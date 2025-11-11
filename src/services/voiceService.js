import CryptoJS from 'crypto-js';

// 使用与 .env 一致的变量名（XUNFEI 前缀）
const APPID = import.meta.env.VITE_XUNFEI_APP_ID;
const API_SECRET = import.meta.env.VITE_XUNFEI_API_SECRET;
const API_KEY = import.meta.env.VITE_XUNFEI_API_KEY;

// IAT 配置与音频常量（严格依据 raw.txt 文档，可通过 .env 覆盖）
const IAT_HOST = import.meta.env.VITE_XUNFEI_IAT_HOST || 'iat.xf-yun.com';
const IAT_PATH = import.meta.env.VITE_XUNFEI_IAT_PATH || '/v1';
const IAT_WS_URL = `wss://${IAT_HOST}${IAT_PATH}`;
// 业务参数（按文档：domain=slm, language=zh_cn, accent=mandarin, eos=6000 默认）
const IAT_LANGUAGE = import.meta.env.VITE_XUNFEI_IAT_LANGUAGE || 'zh_cn';
const IAT_ACCENT = import.meta.env.VITE_XUNFEI_IAT_ACCENT || 'mandarin';
const IAT_DOMAIN = import.meta.env.VITE_XUNFEI_IAT_DOMAIN || 'slm';
const IAT_VAD_EOS = Number(import.meta.env.VITE_XUNFEI_IAT_VAD_EOS || 6000);
const TARGET_SAMPLE_RATE = 16000;
const PROCESSOR_BUFFER_SIZE = 4096;
// 按文档建议：每次发送音频间隔40ms，每次发送字节数为一帧音频大小的整数倍（PCM16 16k 单声道 40ms => 640采样 => 1280字节）
const FRAME_INTERVAL_MS = 40;
const FRAME_SIZE_BYTES = 1280;

// 将 Float32 PCM 转为 16-bit PCM（小端）
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buffer);
}

// 简单降采样到 16k（均值抽取法）
function downsampleBuffer(buffer, sampleRate, outSampleRate = TARGET_SAMPLE_RATE) {
  if (outSampleRate === sampleRate) return buffer;
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / Math.max(1, count);
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

class XunfeiVoiceService {
  constructor() {
    this.appId = APPID;
    this.apiSecret = API_SECRET;
    this.apiKey = API_KEY;
    this.socket = null;
    this.recorder = null; // 兼容旧字段
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.hasSentStartFrame = false;
    this.audioData = [];
    this.resultText = '';
    this.onResult = null;
    this.onError = null;
    this.onEnd = null;
    this.seq = 0; // 文档允许0-999999，首帧从0开始
    // 分片发送队列
    this._byteQueue = [];
    this._byteQueueLen = 0;
    this._flushTimer = null;
  }

  isConfigured() {
    return Boolean(this.appId && this.apiSecret && this.apiKey);
  }

  getWebSocketUrl() {
    // Validate environment configuration before generating the URL
    if (!this.appId || !this.apiSecret || !this.apiKey) {
      throw new Error(
        '科大讯飞语音识别未正确配置：请在 .env 设置 VITE_XUNFEI_APP_ID、VITE_XUNFEI_API_SECRET、VITE_XUNFEI_API_KEY，并重启开发服务器（或重新加载页面）。'
      );
    }

    const url = IAT_WS_URL;
    const host = IAT_HOST;
    const date = new Date().toUTCString();
    const algorithm = 'hmac-sha256';
    const headers = 'host date request-line';
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${IAT_PATH} HTTP/1.1`;
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, this.apiSecret);
    const signature = CryptoJS.enc.Base64.stringify(signatureSha);
    const authorizationOrigin = `api_key="${this.apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
    const authorization = btoa(authorizationOrigin);
    // 严格对齐raw.txt示例：authorization原样；date进行URL编码；host不编码
    return `${url}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
  }

  start(onResult, onError, onEnd) {
    this.onResult = onResult;
    this.onError = onError;
    this.onEnd = onEnd;
    this.resultText = '';
    if (!this.isConfigured()) {
      this.handleError(
        new Error('语音识别未配置：请在 .env 设置 VITE_XUNFEI_APP_ID、VITE_XUNFEI_API_SECRET、VITE_XUNFEI_API_KEY，或改用文本输入与“智能填充”。')
      );
      return;
    }
    let wsUrl;
    try {
      wsUrl = this.getWebSocketUrl();
    } catch (err) {
      this.handleError(err);
      return;
    }
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.startRecording();
    };

    this.socket.onmessage = (event) => {
      try {
        const res = JSON.parse(event.data);
        const header = res.header || {};
        const payload = res.payload || {};
        if (header.code !== 0) {
          const friendly = `[${header.code}] ${header.message || '错误'}：请按文档检查 APP_ID、APIKey、APISecret 是否对应 ws(s)://iat.xf-yun.com/v1，并确保已在控制台创建 WebAPI 平台应用并添加语音听写（流式版）服务。`;
          this.handleError(new Error(friendly));
          return;
        }
        const result = payload.result;
        if (result && typeof result.text === 'string') {
          // 文档规定：payload.result.text 为 base64 的 JSON，包含 ws/cw/w 等
          try {
            const decoded = atob(result.text);
            const json = JSON.parse(decoded);
            if (Array.isArray(json.ws)) {
              const words = json.ws.map(seg => (seg.cw && seg.cw[0] ? seg.cw[0].w : '')).join('');
              this.resultText += words;
              if (this.onResult) this.onResult(this.resultText);
            }
            // 若 ls=true 表示最后结果
            if (json.ls === true || result.status === 2 || header.status === 2) {
              this.cleanup();
              if (this.onEnd) this.onEnd(this.resultText);
            }
          } catch (e) {
            // 解码失败直接忽略，但仍根据 header.status 判断结束
            if (header.status === 2) {
              this.cleanup();
              if (this.onEnd) this.onEnd(this.resultText);
            }
          }
        } else if (header.status === 2) {
          // 没有 result.text，但会话已结束
          this.cleanup();
          if (this.onEnd) this.onEnd(this.resultText);
        }
      } catch (e) {
        this.handleError(e);
      }
    };

    this.socket.onerror = (error) => {
      this.handleError(error);
    };

    this.socket.onclose = () => {
      // 已在 status=2 时触发 onEnd，这里不重复回调
    };
  }

  stop() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const endFrame = {
        header: { app_id: this.appId, status: 2 },
        payload: {
          audio: {
            encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
            seq: this.seq++, status: 2, audio: ''
          }
        }
      };
      this.socket.send(JSON.stringify(endFrame));
    }
    this.cleanup();
  }

  cleanup() {
    try {
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode.onaudioprocess = null;
        this.processorNode = null;
      }
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.audioContext) {
        this.audioContext.close().catch(() => {});
        this.audioContext = null;
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      }
      if (this.socket) {
        try { this.socket.close(); } catch (e) {}
        this.socket = null;
      }
      this.hasSentStartFrame = false;
      this.recorder = null;
      this._byteQueue = [];
      this._byteQueueLen = 0;
      if (this._flushTimer) {
        clearInterval(this._flushTimer);
        this._flushTimer = null;
      }
    } catch (e) {
      // ignore
    }
  }

  handleError(error) {
    if (this.onError) {
      this.onError(error);
    }
    this.stop();
  }

  startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      this.mediaStream = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.processorNode = this.audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);

      this.recorder = this.processorNode; // 兼容旧字段

      this.processorNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = downsampleBuffer(inputData, this.audioContext.sampleRate, TARGET_SAMPLE_RATE);
        const pcm16 = floatTo16BitPCM(downsampled);
        this._appendBytes(pcm16);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // 定时按40ms发送1280字节的分片
      if (this._flushTimer) clearInterval(this._flushTimer);
      this._flushTimer = setInterval(() => {
        this._flushFrameChunk();
      }, FRAME_INTERVAL_MS);
    }).catch(error => {
      this.handleError(error);
    });
  }

  // 追加PCM字节到队列
  _appendBytes(uint8arr) {
    if (!uint8arr || !uint8arr.length) return;
    this._byteQueue.push(uint8arr);
    this._byteQueueLen += uint8arr.length;
  }

  // 从队列取指定字节数
  _takeBytes(n) {
    if (this._byteQueueLen < n) return null;
    let need = n;
    const chunks = [];
    while (need > 0 && this._byteQueue.length) {
      const head = this._byteQueue[0];
      if (head.length <= need) {
        chunks.push(head);
        this._byteQueue.shift();
        this._byteQueueLen -= head.length;
        need -= head.length;
      } else {
        const part = head.subarray(0, need);
        const rest = head.subarray(need);
        chunks.push(part);
        this._byteQueue[0] = rest;
        this._byteQueueLen -= need;
        need = 0;
      }
    }
    // 合并
    const out = new Uint8Array(n);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  _bytesToBase64(uint8arr) {
    let binary = '';
    const len = uint8arr.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8arr[i]);
    }
    return btoa(binary);
  }

  _flushFrameChunk() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    // 必须满足一帧1280字节
    const chunk = this._takeBytes(FRAME_SIZE_BYTES);
    if (!chunk) return;
    const base64Audio = this._bytesToBase64(chunk);

    if (!this.hasSentStartFrame) {
      const startFrame = {
        header: { app_id: this.appId, status: 0 },
        parameter: {
          iat: {
            domain: IAT_DOMAIN,
            language: IAT_LANGUAGE,
            accent: IAT_ACCENT,
            eos: IAT_VAD_EOS,
            vinfo: 1,
            dwa: 'wpgs',
            result: { encoding: 'utf8', compress: 'raw', format: 'json' }
          }
        },
        payload: {
          audio: {
            encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
            seq: this.seq++, status: 0, audio: base64Audio
          }
        }
      };
      this.socket.send(JSON.stringify(startFrame));
      this.hasSentStartFrame = true;
      return;
    }

    const streamFrame = {
      header: { app_id: this.appId, status: 1 },
      payload: {
        audio: {
          encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
          seq: this.seq++, status: 1, audio: base64Audio
        }
      }
    };
    this.socket.send(JSON.stringify(streamFrame));
  }
}

export default new XunfeiVoiceService();
