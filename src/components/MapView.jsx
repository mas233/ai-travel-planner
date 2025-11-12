import { useEffect, useRef } from 'react'
import { geocodeAddress } from '../services/amapService'
import { useTravelStore } from '../store/travelStore'
import './MapView.css'

// MapView 组件：使用高德 AMap JSAPI 初始化并展示中心点与标记
function MapView({ plan }) {
  const drivingRef = useRef(null)
  const routeInfoWindowRef = useRef(null)

  useEffect(() => {
    // 全局监听导航事件：释放旧地图，重建新地图，并打印坐标
    const onDrivingRouteGlobal = (ev) => {
      const detail = ev?.detail || {}
      const start = detail.start
      const end = detail.end
      const toNum = (v) => {
        const n = typeof v === 'string' ? parseFloat(v) : v
        return Number.isFinite(n) ? n : null
      }
      const sLng = toNum(start?.lng), sLat = toNum(start?.lat)
      const eLng = toNum(end?.lng), eLat = toNum(end?.lat)
      const valid = (lng, lat) => typeof lng === 'number' && typeof lat === 'number' && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
      try { console.log('[MapView] 接收导航事件(全局) -> 起点:', { lng: sLng, lat: sLat }, '终点:', { lng: eLng, lat: eLat }) } catch {}
      if (!valid(sLng, sLat) || !valid(eLng, eLat)) {
        console.warn('无效的导航坐标：', start, end)
        // 仍执行释放与重建动作，便于观察点击效果（不绘制路线）
        try {
          const m = window.__travelPlannerAMap
          if (m) {
            try { m.__cleanupDriving && m.__cleanupDriving() } catch {}
            try { m.destroy && m.destroy() } catch {}
            window.__travelPlannerAMap = null
          }
          const ctn = document.getElementById('container')
          if (ctn) ctn.innerHTML = ''
        } catch (e) {
          console.warn('释放旧地图资源异常：', e)
        }
        if (window.AMap && window.AMap.Map) {
          try {
            const newMap = new window.AMap.Map('container', {
              resizeEnable: true,
              zoom: 12,
              center: [121.4737, 31.2304],
              viewMode: '2D'
            })
            try { window.__travelPlannerAMap = newMap } catch {}
          } catch (e) {
            console.error('创建新地图失败：', e)
          }
        }
        return
      }

      // 若 AMap 尚未加载，等待一次再执行
      if (!(window.AMap && window.AMap.Map)) {
        console.warn('AMap 尚未加载，等待 amap:loaded 后自动执行导航')
        const once = () => {
          try { onDrivingRouteGlobal({ detail }) } finally { window.removeEventListener('amap:loaded', once) }
        }
        window.addEventListener('amap:loaded', once)
        return
      }

      // 释放旧地图资源
      try {
        const m = window.__travelPlannerAMap
        if (m) {
          try { m.__cleanupDriving && m.__cleanupDriving() } catch {}
          try { m.destroy && m.destroy() } catch {}
          window.__travelPlannerAMap = null
        }
        const ctn = document.getElementById('container')
        if (ctn) ctn.innerHTML = ''
      } catch (e) {
        console.warn('释放旧地图资源异常：', e)
      }

      // 创建新地图并初始化驾车
      let newMap
      try {
        newMap = new window.AMap.Map('container', {
          resizeEnable: true,
          zoom: 13,
          center: [sLng, sLat],
          viewMode: '2D'
        })
      } catch (e) {
        console.error('创建新地图失败：', e)
        return
      }

      try {
        drivingRef.current = new window.AMap.Driving({
          map: newMap,
          showTraffic: true,
          autoFitView: true,
        })
      } catch (e) {
        console.warn('AMap.Driving 初始化失败：', e)
      }
      newMap.__cleanupDriving = () => {
        try { drivingRef.current && drivingRef.current.clear() } catch {}
        try { routeInfoWindowRef.current && routeInfoWindowRef.current.close() } catch {}
        routeInfoWindowRef.current = null
        drivingRef.current = null
      }

      // 搜索并显示信息窗
      if (drivingRef.current) {
        drivingRef.current.search([sLng, sLat], [eLng, eLat], (status, result) => {
          if (status === 'complete') {
            const routes = result?.routes || []
            if (routes.length > 0) {
              const route = routes[0]
              const distanceKm = ((route.distance || 0) / 1000).toFixed(2)
              const timeMin = Math.ceil((route.time || 0) / 60)
              try {
                routeInfoWindowRef.current = new window.AMap.InfoWindow({
                  content: `距离约 ${distanceKm} 公里，预计 ${timeMin} 分钟`,
                  offset: new window.AMap.Pixel(0, -20)
                })
                routeInfoWindowRef.current.open(newMap, [eLng, eLat])
              } catch {}
            }
          } else {
            console.warn('路线规划失败或未完成：', result)
          }
        })
      }

      try { window.__travelPlannerAMap = newMap } catch {}
    }

    window.addEventListener('map:drivingRoute', onDrivingRouteGlobal)
    const init = async () => {
      if (!(window.AMap && window.AMap.Map)) return
      const { updatePlan } = useTravelStore.getState()
      // 默认中心点为上海；若计划提供坐标则使用计划坐标
      let lng = 121.4737
      let lat = 31.2304
      let itineraryObj = plan?.itinerary
      try {
        if (typeof itineraryObj === 'string') itineraryObj = JSON.parse(itineraryObj)
      } catch {}

      const lngRaw = itineraryObj?.destination_longitude ?? plan?.destination_longitude
      const latRaw = itineraryObj?.destination_latitude ?? plan?.destination_latitude
      const lngNum = lngRaw !== undefined ? Number(lngRaw) : NaN
      const latNum = latRaw !== undefined ? Number(latRaw) : NaN

      // 若坐标缺失，尝试二次地理编码并更新数据库
      if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) {
        const dest = (plan?.destination || '').trim()
        const candidates = dest ? [
          dest,
          `${dest}市`,
          `${dest}省`,
          `${dest}自治区`,
          ...(dest === '西藏' ? ['西藏自治区', '拉萨市'] : []),
          ...(dest === '内蒙古' ? ['内蒙古自治区', '呼和浩特市'] : []),
          ...(dest === '广西' ? ['广西壮族自治区', '南宁市'] : []),
          ...(dest === '宁夏' ? ['宁夏回族自治区', '银川市'] : []),
          ...(dest === '新疆' ? ['新疆维吾尔自治区', '乌鲁木齐市'] : [])
        ] : []

        let found = { longitude: null, latitude: null }
        for (const addr of candidates) {
          try {
            const res = await geocodeAddress(addr)
            if (Number.isFinite(Number(res.longitude)) && Number.isFinite(Number(res.latitude))) {
              found = { longitude: Number(res.longitude), latitude: Number(res.latitude) }
              break
            }
          } catch (_) {
            // 忽略错误，尝试下一个候选
          }
        }

        if (Number.isFinite(found.longitude) && Number.isFinite(found.latitude)) {
          lng = found.longitude
          lat = found.latitude
          // 更新数据库中的 itinerary 坐标字段
          try {
            const mergedItinerary = {
              ...(itineraryObj || {}),
              destination_longitude: lng,
              destination_latitude: lat
            }
            await updatePlan(plan.id, { itinerary: mergedItinerary })
          } catch (e) {
            console.warn('坐标更新数据库失败：', e)
          }
        }
      } else {
        lng = lngNum
        lat = latNum
      }

      const containerId = 'container'
      const el = document.getElementById(containerId)
      if (!el) return

      const map = new window.AMap.Map(containerId, {
        resizeEnable: true,
        zoom: 12,
        center: [lng, lat],
        viewMode: '2D'
      })

      const marker = new window.AMap.Marker({ position: [lng, lat] })
      map.add(marker)

      // 初始化驾车导航（JSAPI），自动在地图上绘制路线
      try {
        drivingRef.current = new window.AMap.Driving({
          map,
          showTraffic: true,
          autoFitView: true,
        })
      } catch (e) {
        console.warn('AMap.Driving 初始化失败：', e)
      }

      // 移除内部监听，改为全局监听（已在 effect 顶部绑定）

      window.__travelPlannerAMap = map

      // 清理函数（仅清理驾车相关资源）
      const cleanup = () => {
        try { drivingRef.current && drivingRef.current.clear() } catch {}
        try { routeInfoWindowRef.current && routeInfoWindowRef.current.close() } catch {}
        routeInfoWindowRef.current = null
        drivingRef.current = null
      }
      // 将清理逻辑挂到 map 对象上，供外部销毁时使用
      map.__cleanupDriving = cleanup
    }

    if (window.AMap && window.AMap.Map) {
      init()
    } else {
      const handler = () => init()
      window.addEventListener('amap:loaded', handler, { once: true })
      return () => window.removeEventListener('amap:loaded', handler)
    }

    return () => {
      // 解绑全局导航事件监听
      window.removeEventListener('map:drivingRoute', onDrivingRouteGlobal)
      const el = document.getElementById('container')
      if (el) el.innerHTML = ''
      const m = window.__travelPlannerAMap
      if (m && m.destroy) {
        try { m.destroy() } catch {}
        // 清理 Driving 事件等
        try { m.__cleanupDriving && m.__cleanupDriving() } catch {}
      }
      window.__travelPlannerAMap = null
    }
  }, [plan])

  return (
    <div className="map-view">
      <div id="container" />
    </div>
  )
}

export default MapView
