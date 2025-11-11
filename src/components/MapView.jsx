import { useEffect } from 'react'
import { geocodeAddress } from '../services/amapService'
import './MapView.css'

/**
 * MapView 组件
 * 1. 当未选择 TravelPlan 时，不渲染任何内容（返回 null）
 * 2. 当选择了 TravelPlan 时，根据其 destination_latitude / destination_longitude
 *    渲染高德地图，并将地图中心设置为该目的地坐标
 * 3. 在加载 AMap JS API 之前，按照高德官方要求，先注入 window._AMapSecurityConfig
 *    其 securityJsCode 来源于环境变量 VITE_AMAP_SECURE_KEY
 *
 * 由于用户要求严格遵循示例 HTML/JS 结构，因此本实现继续保持此前的 DOM 注入方式，
 * 仅在必要处做最小改动以支持动态中心点与安全密钥设置。
 */

function MapViewInner({ center, fallbackQuery }) {
  const destLng = Number(center?.lng)
  const destLat = Number(center?.lat)

  useEffect(() => {
    const initMapWithResolvedCenter = async () => {
      if (!window.AMap || !window.AMap.Map) return
      let lng = destLng
      let lat = destLat
      const hasValid = Number.isFinite(lng) && Number.isFinite(lat)
      if (!hasValid && typeof fallbackQuery === 'string' && fallbackQuery.length > 0) {
        try {
          const res = await geocodeAddress(fallbackQuery)
          if (Number.isFinite(res.longitude) && Number.isFinite(res.latitude)) {
            lng = res.longitude
            lat = res.latitude
          }
        } catch (e) {
          // 静默失败，保持无地图
        }
      }
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      if (window.__travelPlannerMap) {
        window.__travelPlannerMap.destroy()
        window.__travelPlannerMap = null
      }
      const map = new window.AMap.Map('container', {
        resizeEnable: true,
        center: [lng, lat],
        zoom: 13,
      })
      window.__travelPlannerMap = map
    }

    // 如果 AMap 已就绪，直接初始化；否则等待脚本加载事件
    if (window.AMap && window.AMap.Map) {
      initMapWithResolvedCenter()
    } else {
      const handler = () => { initMapWithResolvedCenter() }
      window.addEventListener('amap:loaded', handler, { once: true })
      return () => {
        window.removeEventListener('amap:loaded', handler)
        if (window.__travelPlannerMap) {
          window.__travelPlannerMap.destroy()
          window.__travelPlannerMap = null
        }
      }
    }

    return () => {
      if (window.__travelPlannerMap) {
        window.__travelPlannerMap.destroy()
        window.__travelPlannerMap = null
      }
    }
  }, [destLng, destLat, fallbackQuery])

  return (
    <div className="map-view">
      <div id="container"></div>
      <div id="panel"></div>
    </div>
  )
}

function MapView({ plan }) {
  // 未选择计划，不渲染任何内容（本组件不含 hooks，不会破坏 hooks 顺序）
  if (!plan) return null

  // 从计划中读取目的地坐标
  let itineraryObj = plan?.itinerary
  if (typeof itineraryObj === 'string') {
    try {
      itineraryObj = JSON.parse(itineraryObj)
    } catch (e) {
      console.warn('无法解析 itinerary JSON', e)
    }
  }

  const destLngRaw = itineraryObj?.destination_longitude ?? plan?.destination_longitude
  const destLatRaw = itineraryObj?.destination_latitude ?? plan?.destination_latitude
  const lng = destLngRaw !== undefined ? Number(destLngRaw) : NaN
  const lat = destLatRaw !== undefined ? Number(destLatRaw) : NaN

  const fallbackQuery = plan?.destination || ''
  return <MapViewInner center={{ lng, lat }} fallbackQuery={fallbackQuery} />
}

export default MapView
