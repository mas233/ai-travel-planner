// Runtime env overrides via localStorage, falling back to build-time import.meta.env
const PREFERRED_ORDER = [
  'VITE_AMAP_KEY', // 高德地图JS API密钥
  'VITE_AMAP_SECURE_KEY', // 高德地图JSAPI 安全密钥
  'VITE_SUPABASE_URL', // Supabase项目URL
  'VITE_SUPABASE_ANON_KEY', // Supabase ANON密钥
  'VITE_QIANWEN_API_KEY', // 千问API密钥
  'VITE_XUNFEI_APP_ID', // 讯飞语音识别 App ID
  'VITE_XUNFEI_SECRET_KEY', // 讯飞语音识别 安全密钥
];

// 对应字段的 UI 占位提示文案（取自上面的注释）
export const ENV_PLACEHOLDERS = {
  VITE_AMAP_KEY: '高德地图JS API密钥',
  VITE_AMAP_SECURE_KEY: '高德地图JSAPI 安全密钥',
  VITE_SUPABASE_URL: 'Supabase项目URL',
  VITE_SUPABASE_ANON_KEY: 'Supabase ANON密钥',
  VITE_QIANWEN_API_KEY: '千问API密钥',
  VITE_XUNFEI_APP_ID: '讯飞语音识别 App ID',
  VITE_XUNFEI_SECRET_KEY: '讯飞语音识别 安全密钥',
};

export function getDisplayKeys() {
  const env = import.meta.env || {};
  const viteKeys = Object.keys(env).filter(k => k.startsWith('VITE_'));
  const ordered = PREFERRED_ORDER.filter(k => viteKeys.includes(k));
  const rest = viteKeys.filter(k => !ordered.includes(k)).sort();
  return [...ordered, ...rest];
}

export const ALL_ENV_KEYS = getDisplayKeys();

export function getEnv(key) {
  try {
    const override = typeof window !== 'undefined' ? window.localStorage.getItem(`env.${key}`) : null;
    if (override !== null && override !== '') return override;
  } catch (_) {}
  return (import.meta.env && import.meta.env[key]) || '';
}

export function setEnv(key, value) {
  try { window.localStorage.setItem(`env.${key}`, value || ''); } catch (_) {}
}

export function clearEnv(key) {
  try { window.localStorage.removeItem(`env.${key}`); } catch (_) {}
}

export function getAllEnv(keys = ALL_ENV_KEYS) {
  const obj = {};
  for (const k of keys) obj[k] = getEnv(k);
  return obj;
}

export const RELOAD_REQUIRED_KEYS = [
  'VITE_AMAP_KEY',
  'VITE_AMAP_SECURE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

export function hasReloadRequiredChange(prev, next) {
  return RELOAD_REQUIRED_KEYS.some(k => (prev?.[k] || '') !== (next?.[k] || ''));
}
