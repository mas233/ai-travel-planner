import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadEnv() {
  const env = { ...process.env };
  const dotenvPath = path.join(projectRoot, '.env');
  try {
    const content = fs.readFileSync(dotenvPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
  } catch (e) {
    // ignore missing .env
  }
  return env;
}

function buildWsUrl(env) {
  const appId = env.VITE_XUNFEI_APP_ID;
  const apiSecret = env.VITE_XUNFEI_API_SECRET;
  const apiKey = env.VITE_XUNFEI_API_KEY;
  const host = env.VITE_XUNFEI_IAT_HOST || 'iat.xf-yun.com';
  const pathStr = env.VITE_XUNFEI_IAT_PATH || '/v1';

  if (!appId || !apiSecret || !apiKey) {
    throw new Error('Missing env: VITE_XUNFEI_APP_ID / VITE_XUNFEI_API_SECRET / VITE_XUNFEI_API_KEY');
  }

  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${pathStr} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureOrigin, 'utf8').digest('base64');
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString('base64');
  // 严格对齐示例URL：authorization原样；date进行URL编码；host不编码
  const url = `wss://${host}${pathStr}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;

  // 调试输出：逐字校验鉴权字符串与URL
  console.log('--- AUTH DEBUG BEGIN ---');
  console.log('signature_origin>>>');
  console.log(signatureOrigin);
  console.log('authorization_origin>>>');
  console.log(authorizationOrigin);
  console.log('authorization_origin_length>>>', authorizationOrigin.length);
  console.log('authorization_origin_has_newline>>>', authorizationOrigin.includes('\n'));
  console.log('authorization(base64)>>>');
  console.log(authorization);
  console.log('date(RFC1123)>>>');
  console.log(date);
  console.log('final_url>>>');
  console.log(url);
  console.log('--- AUTH DEBUG END ---');
  return { url, appId };
}

// 按文档建议：每帧40ms，PCM16 16k 单声道 => 640采样 * 2字节 = 1280字节
const FRAME_INTERVAL_MS = 40;
const FRAME_SIZE_BYTES = 1280;
function makeSilenceBase64Bytes(bytes = FRAME_SIZE_BYTES) {
  const buffer = Buffer.alloc(bytes);
  return buffer.toString('base64');
}

async function main() {
  const env = loadEnv();
  const { url, appId } = buildWsUrl(env);
  console.log('Connecting:', url);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('WebSocket open');
    // 首帧（status=0）
    const startFrame = {
      header: { app_id: appId, status: 0 },
      parameter: {
        iat: {
          domain: env.VITE_XUNFEI_IAT_DOMAIN || 'slm',
          language: env.VITE_XUNFEI_IAT_LANGUAGE || 'zh_cn',
          accent: env.VITE_XUNFEI_IAT_ACCENT || 'mandarin',
          eos: Number(env.VITE_XUNFEI_IAT_VAD_EOS || 6000),
          vinfo: 1,
          dwa: 'wpgs',
          result: { encoding: 'utf8', compress: 'raw', format: 'json' }
        }
      },
      payload: {
        audio: {
          encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
          seq: 0, status: 0, audio: makeSilenceBase64Bytes(FRAME_SIZE_BYTES)
        }
      }
    };
    ws.send(JSON.stringify(startFrame));

    // 中间帧（status=1），40ms 后发送一帧 1280 字节
    setTimeout(() => {
      const midFrame = {
        header: { app_id: appId, status: 1 },
        payload: {
          audio: {
            encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
            seq: 1, status: 1, audio: makeSilenceBase64Bytes(FRAME_SIZE_BYTES)
          }
        }
      };
      ws.send(JSON.stringify(midFrame));
    }, FRAME_INTERVAL_MS);

    // 结束帧（status=2），再等待一个间隔后发送空音频
    setTimeout(() => {
      const endFrame = {
        header: { app_id: appId, status: 2 },
        payload: {
          audio: {
            encoding: 'raw', sample_rate: 16000, channels: 1, bit_depth: 16,
            seq: 2, status: 2, audio: ''
          }
        }
      };
      ws.send(JSON.stringify(endFrame));
    }, FRAME_INTERVAL_MS * 2);
  });

  ws.on('message', (data) => {
    try {
      const res = JSON.parse(String(data));
      const header = res.header || {};
      const payload = res.payload || {};
      if (header.code !== 0) {
        console.error('Message error:', header);
        return;
      }
      const result = payload.result;
      if (result && typeof result.text === 'string') {
        const decoded = Buffer.from(result.text, 'base64').toString('utf8');
        try {
          const json = JSON.parse(decoded);
          const words = Array.isArray(json.ws) ? json.ws.map(seg => (seg.cw && seg.cw[0] ? seg.cw[0].w : '')).join('') : '';
          console.log('Text:', words);
        } catch (e) {
          console.log('Decoded text(raw):', decoded);
        }
      } else {
        console.log('Message:', res);
      }
    } catch (e) {
      console.log('Message(raw):', String(data));
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message || err);
  });

  ws.on('close', (code, reason) => {
    console.log('WebSocket close:', code, reason?.toString());
  });
}

main().catch((e) => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});
