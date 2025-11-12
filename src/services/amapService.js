// AMap Geocoding service: supports REST (server/serverless key) and JSAPI (browser key) fallback
const AMAP_SERVER_KEY = import.meta.env.VITE_AMAP_SERVER_KEY;
const AMAP_WEB_KEY = import.meta.env.VITE_AMAP_KEY;
const REST_KEY = AMAP_SERVER_KEY || AMAP_WEB_KEY; // 兼容只配置 VITE_AMAP_KEY 的场景
const AMAP_USE_REST = String(import.meta.env.VITE_AMAP_USE_REST || '').toLowerCase() === 'true';

function waitForAMap(timeoutMs = 8000) {
  if (typeof window !== 'undefined' && window.AMap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const onLoaded = () => {
      clearTimeout(timer);
      window.removeEventListener('amap:loaded', onLoaded);
      resolve();
    };
    try {
      window.addEventListener('amap:loaded', onLoaded);
    } catch (_) {}
    timer = setTimeout(() => {
      window.removeEventListener('amap:loaded', onLoaded);
      if (window.AMap) resolve();
      else reject(new Error('AMap JSAPI 加载超时'));
    }, timeoutMs);
  });
}

async function geocodeWithRest(address) {
  const base = 'https://restapi.amap.com/v3/geocode/geo';
  const key = REST_KEY;
  if (!key) throw new Error('缺少 REST Key (VITE_AMAP_SERVER_KEY 或 VITE_AMAP_KEY)');
  const qs = new URLSearchParams({ address, key, output: 'json' });
  const url = `${base}?${qs.toString()}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`AMap HTTP错误：${resp.status} ${resp.statusText}`);
  if (data.status !== '1' || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
    throw new Error(`AMap REST geocode失败：${data.info || '未返回结果'}`);
  }
  const loc = data.geocodes[0]?.location || '';
  const [lngStr, latStr] = String(loc).split(',');
  const longitude = Number.isFinite(parseFloat(lngStr)) ? parseFloat(lngStr) : null;
  const latitude = Number.isFinite(parseFloat(latStr)) ? parseFloat(latStr) : null;
  return { longitude, latitude, raw: data };
}

async function geocodeWithJSAPI(address) {
  // 等待 JSAPI 加载完成（或超时后直接检查）
  await waitForAMap();
  if (typeof window === 'undefined' || !window.AMap) {
    throw new Error('AMap JSAPI 未加载');
  }
  // 确保加载 Geocoder 插件
  await new Promise(resolve => {
    try {
      window.AMap.plugin('AMap.Geocoder', resolve);
    } catch (_) {
      resolve();
    }
  });

  const geocoder = new window.AMap.Geocoder({ city: '全国' });
  return new Promise((resolve, reject) => {
    geocoder.getLocation(address, (status, result) => {
      if (status === 'complete' && result?.geocodes?.length) {
        const loc = result.geocodes[0].location;
        const longitude = Number.isFinite(Number(loc?.lng)) ? Number(loc.lng) : null;
        const latitude = Number.isFinite(Number(loc?.lat)) ? Number(loc.lat) : null;
        resolve({ longitude, latitude, raw: result });
      } else {
        reject(new Error(`AMap JSAPI geocode失败：${result?.info || status}`));
      }
    });
  });
}

/**
 * 根据地址调用高德地理编码，优先 REST（如配置且启用），否则回退到 JSAPI。
 * @param {string} address
 * @returns {Promise<{ longitude: number|null, latitude: number|null, raw: any }>} 解析结果
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('address 必须为非空字符串');
  }

  const reasons = [];
  // Prefer REST if explicitly enabled and key exists
  if (AMAP_USE_REST && REST_KEY) {
    try {
      return await geocodeWithRest(address);
    } catch (e) {
      reasons.push(e.message);
    }
  }

  // Fallback to JSAPI (browser key)
  try {
    return await geocodeWithJSAPI(address);
  } catch (e) {
    reasons.push(e.message);
  }

  // As a last attempt, if REST key exists but not enabled, try REST
  if (!AMAP_USE_REST && REST_KEY) {
    try {
      return await geocodeWithRest(address);
    } catch (e) {
      reasons.push(e.message);
    }
  }

  throw new Error(`AMap 地理编码失败：${reasons.join(' | ') || '未知错误'}`);
}
