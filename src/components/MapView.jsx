import { useEffect, useMemo, useRef, useState } from 'react'
import './MapView.css'
import { AMapItinerary } from './AMapItinerary'

function MapView({ plan }) {
  const itinerary = useMemo(() => {
    if (!plan?.itinerary) return null
    if (typeof plan.itinerary === 'object') return plan.itinerary
    if (typeof plan.itinerary === 'string') {
      try { return JSON.parse(plan.itinerary) } catch { return null }
    }
    return null
  }, [plan])

  const locationNames = useMemo(() => {
    const names = []
    if (itinerary?.days?.length) {
      for (const day of itinerary.days) {
        if (Array.isArray(day.locations)) {
          for (const loc of day.locations) {
            const name = loc?.name || loc?.place
            if (name) names.push(name)
          }
        }
      }
    }
    return names
  }, [itinerary])

  const nameIndexMap = useMemo(() => {
    const map = new Map()
    locationNames.forEach((n, i) => { if (!map.has(n)) map.set(n, i + 1) })
    return map
  }, [locationNames])

  const [routePoints, setRoutePoints] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      const { from, to } = e.detail || {}
      if (!from || !to) return
      const s = nameIndexMap.get(from)
      const t = nameIndexMap.get(to)
      if (s && t) {
        setRoutePoints([s, t])
      } else {
        console.warn('无法匹配地点到序号:', from, to)
      }
    }
    window.addEventListener('map:routeSegment', handler)
    return () => window.removeEventListener('map:routeSegment', handler)
  }, [nameIndexMap])

  if (!plan) {
    return (
      <div className="map-view">
        <div className="map-placeholder">未选择计划，地图不可用</div>
      </div>
    )
  }

  const title = plan?.destination || plan?.title || '中国北京'

  return (
    <div className="map-view">
      <AMapItinerary title={title} locations={locationNames} routePoints={routePoints} />
    </div>
  )
}

export default MapView

