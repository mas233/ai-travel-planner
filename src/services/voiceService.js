/*
 * 讯飞录音文件转写（标准版）
 * ------------------------
 * 录音 → 临时文件 → 上传接口（upload）→ 轮询结果接口（getResult）→ 文本
 * 严格按照官方文档参数与签名计算，确保无论成功/失败都清理临时资源。
 */

import CryptoJS from 'crypto-js';

// Xunfei Long Form ASR endpoints & credentials
// Use local proxy in dev to avoid CORS
const XF_UPLOAD_URL    = import.meta.env.DEV ? '/xf/upload'    : 'https://raasr.xfyun.cn/v2/api/upload';
const XF_GETRESULT_URL = import.meta.env.DEV ? '/xf/getResult' : 'https://raasr.xfyun.cn/v2/api/getResult';
const XF_SECRET_KEY    = import.meta.env.VITE_XUNFEI_SECRET_KEY;
// User requires appid env name `CITE_XUNFEI_APP_ID`; also accept `VITE_XUNFEI_APP_ID` as fallback
const XF_APP_ID        = import.meta.env.CITE_XUNFEI_APP_ID || import.meta.env.VITE_XUNFEI_APP_ID;

// Audio conversion helpers
const TARGET_SAMPLE_RATE = 16000;

function float32ToPCM16(float32) {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; ++i) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(i * 2, s, true);
  }
  return new Uint8Array(buf);
}

function downsample(buffer, inRate, outRate = TARGET_SAMPLE_RATE) {
  if (inRate === outRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offset = 0;
  for (let i = 0; i < newLen; ++i) {
    const nextOffset = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; ++j) {
      sum += buffer[j];
      ++count;
    }
    result[i] = count ? (sum / count) : 0;
    offset = nextOffset;
  }
  return result;
}

function pcm16ToWav(pcm16, sampleRate = TARGET_SAMPLE_RATE) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // format = 1 (PCM)
  view.setUint16(22, numChannels, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);          // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm16.length; ++i) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });

  function writeString(dv, offset, str) {
    for (let i = 0; i < str.length; ++i) {
      dv.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

async function blobToWav(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const buf = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(buf);
    const channel = audioBuffer.getChannelData(0);
    const down = downsample(channel, audioBuffer.sampleRate, TARGET_SAMPLE_RATE);
    const pcm16 = float32ToPCM16(down);
    // Convert to Int16 array for WAV writer
    const pcm16View = new Int16Array(pcm16.buffer);
    const wavBlob = pcm16ToWav(pcm16View, TARGET_SAMPLE_RATE);
    const durationMs = Math.round(audioBuffer.duration * 1000);
    return { wavBlob, durationMs };
  } finally {
    audioCtx.close().catch(() => {});
  }
}

// Build signa per doc: base64(HmacSHA1(MD5(appid + ts), secret_key))
function buildSigna(appId, ts, secretKey) {
  const md5Str = CryptoJS.MD5(`${appId}${ts}`).toString();
  const hmac = CryptoJS.HmacSHA1(md5Str, secretKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function toUrlParams(obj) {
  const usp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null) usp.append(k, String(v));
  });
  return usp.toString();
}

class VoiceService {
  constructor() {
    this.onResult = null;
    this.onError  = null;
    this.onEnd    = null;

    this._mediaStream = null;
    this._recorder    = null;
    this._chunks      = [];
    this._tmpUrl      = null;
  }

  isConfigured() {
    return Boolean(XF_SECRET_KEY && XF_APP_ID);
  }

  start(onResult, onError, onEnd) {
    if (onResult) this.onResult = onResult;
    if (onError)  this.onError  = onError;
    if (onEnd)    this.onEnd    = onEnd;

    if (!this.isConfigured()) {
      if (this.onError) this.onError(new Error('语音识别未配置：缺少 CITE_XUNFEI_APP_ID 或 VITE_XUNFEI_SECRET_KEY'));
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      this._mediaStream = stream;
      const mime = this._selectMime();
      this._recorder = new MediaRecorder(stream, { mimeType: mime });
      this._chunks = [];

      this._recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this._chunks.push(e.data);
      };
      this._recorder.onerror = (e) => {
        this._handleError(e?.error || new Error('录音失败'));
      };
      this._recorder.onstop = () => {
        // Build temp file(blob)
        const blob = new Blob(this._chunks, { type: this._recorder.mimeType });
        this._tmpUrl = URL.createObjectURL(blob);
        // Upload then poll result per Xunfei API
        this._uploadAndGetResult(blob).finally(() => {
          // Cleanup temp file regardless of success/failure
          if (this._tmpUrl) {
            try { URL.revokeObjectURL(this._tmpUrl); } catch (_) {}
            this._tmpUrl = null;
          }
          this._finalizeStream();
        });
      };

      try {
        this._recorder.start();
      } catch (e) {
        this._handleError(e);
      }
    }).catch(err => this._handleError(err));
  }

  stop() {
    // Stop recording; onstop will trigger transcription
    try {
      if (this._recorder && this._recorder.state !== 'inactive') {
        this._recorder.stop();
      }
    } catch (e) {
      this._handleError(e);
    }
  }

  _selectMime() {
    const canWav = MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/wav');
    if (canWav) return 'audio/wav';
    const canWebm = MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm');
    if (canWebm) return 'audio/webm';
    return undefined; // let browser choose
  }

  async _uploadAndGetResult(srcBlob) {
    try {
      // Convert to target WAV and read duration
      const { wavBlob, durationMs } = await blobToWav(srcBlob);

      const ts1 = nowTs();
      const signa1 = buildSigna(XF_APP_ID, ts1, XF_SECRET_KEY);
      const fileName = 'recording.wav';
      const fileSize = wavBlob.size;
      const uploadParams = {
        appId: XF_APP_ID,
        ts: ts1,
        // signa should be base64; let URLSearchParams do single encoding
        signa: signa1,
        fileName,
        fileSize,
        duration: durationMs,
        language: 'cn',
        audioMode: 'fileStream',
        standardWav: 1,
      };
      const uploadUrl = `${XF_UPLOAD_URL}?${toUrlParams(uploadParams)}`;

      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: wavBlob
      });
      const uploadText = await uploadResp.text();
      if (!uploadResp.ok) {
        throw new Error(`Upload失败：${uploadResp.status} ${uploadResp.statusText} ${uploadText}`);
      }
      let uploadJson = null;
      try { uploadJson = JSON.parse(uploadText); } catch (_) {}
      const orderId = uploadJson?.orderId || uploadJson?.data?.orderId;
      if (!orderId) throw new Error(`Upload成功但未返回orderId：${uploadText}`);

      // Poll getResult until完成
      const maxTries = 20;
      const delayMs = 1500;
      for (let i = 0; i < maxTries; i++) {
        const ts2 = nowTs();
        const signa2 = buildSigna(XF_APP_ID, ts2, XF_SECRET_KEY);
        const query = toUrlParams({
          appId: XF_APP_ID,
          ts: ts2,
          signa: signa2,
          orderId
        });
        const resultUrl = `${XF_GETRESULT_URL}?${query}`;
        const resResp = await fetch(resultUrl, { method: 'GET' });
        const resText = await resResp.text();
        if (!resResp.ok) {
          throw new Error(`getResult失败：${resResp.status} ${resResp.statusText} ${resText}`);
        }
        let resJson = null;
        try { resJson = JSON.parse(resText); } catch (_) {}
        const status = resJson?.orderInfo?.status;
        if (status === 4) {
          const text = extractTextFromOrderResult(resJson?.orderResult);
          if (!text) throw new Error('转写完成但未解析到文本结果');
          if (this.onResult) this.onResult(text);
          if (this.onEnd) this.onEnd(text);
          return;
        }
        if (status === -1) {
          const failType = resJson?.orderInfo?.failType;
          throw new Error(`转写失败，status=-1，failType=${failType ?? '未知'}`);
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
      throw new Error('转写结果查询超时，请稍后重试');
    } catch (err) {
      this._handleError(err);
    }
  }

  _handleError(err) {
    if (this.onError) this.onError(err);
    // Ensure temp file cleanup and stream shutdown
    if (this._tmpUrl) {
      try { URL.revokeObjectURL(this._tmpUrl); } catch (_) {}
      this._tmpUrl = null;
    }
    this._finalizeStream();
  }

  _finalizeStream() {
    try {
      if (this._mediaStream) {
        this._mediaStream.getTracks().forEach(t => t.stop());
      }
    } catch (_) {}
    this._mediaStream = null;
    this._recorder = null;
    this._chunks = [];
  }
}

export default new VoiceService();

// Extract plain text from Xunfei orderResult
function extractTextFromOrderResult(orderResult) {
  if (!orderResult) return '';
  let obj = orderResult;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (_) {}
  }
  if (!obj) return typeof orderResult === 'string' ? orderResult : '';
  const lattices = obj.lattice || obj.lattice2 || [];
  const pieces = [];
  for (const item of lattices) {
    if (!item?.json_1best) continue;
    let one = null;
    try { one = JSON.parse(item.json_1best); } catch (_) {}
    if (!one?.st?.rt) continue;
    for (const rt of one.st.rt) {
      if (!rt?.ws) continue;
      for (const ws of rt.ws) {
        if (!ws?.cw || !ws.cw.length) continue;
        const best = ws.cw[0];
        if (best?.w) pieces.push(best.w);
      }
    }
  }
  return pieces.join('');
}
