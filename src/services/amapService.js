// AMap REST Geocoding using server key from .env
// Exposes window.geocodeAddress for easy use in browser console

const AMAP_SERVER_KEY = import.meta.env.VITE_AMAP_SERVER_KEY || import.meta.env.VITE_AMAP_KEY;

/**
 * 根据地址调用高德地图地理编码接口，返回经纬度与原始响应
 * @param {string} address 例如："北京市朝阳区国贸"
 * @returns {Promise<{ longitude: number|null, latitude: number|null, raw: any }>} 解析结果
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('address 必须为非空字符串');
  }
  if (!AMAP_SERVER_KEY) {
    throw new Error('缺少 VITE_AMAP_SERVER_KEY 或 VITE_AMAP_KEY');
  }

  const base = 'https://restapi.amap.com/v3/geocode/geo';
  const qs = new URLSearchParams({
    address,
    key: AMAP_SERVER_KEY,
    output: 'json'
  });

  const url = `${base}?${qs.toString()}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(`AMap HTTP错误：${resp.status} ${resp.statusText}`);
  }
  if (data.status !== '1' || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
    throw new Error(`AMap geocode失败：${data.info || '未返回结果'}`);
  }

  const loc = data.geocodes[0]?.location || '';
  const [lngStr, latStr] = String(loc).split(',');
  const longitude = Number.isFinite(parseFloat(lngStr)) ? parseFloat(lngStr) : null;
  const latitude = Number.isFinite(parseFloat(latStr)) ? parseFloat(latStr) : null;

  return { longitude, latitude, raw: data };
}

// 在浏览器环境中暴露到 window，便于命令行调用
if (typeof window !== 'undefined') {
  // 防止覆盖已有同名方法
  if (!window.geocodeAddress) {
    window.geocodeAddress = geocodeAddress;
  }
}

