import { useEffect, useRef } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'
import './MapView.css'

function MapView({ plan }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    const initMap = async () => {
      try {
        const AMap = await AMapLoader.load({
          key: import.meta.env.VITE_AMAP_KEY || 'your-amap-key',
          version: '2.0',
          plugins: ['AMap.Geocoder', 'AMap.Marker', 'AMap.Polyline']
        })

        if (mapInstanceRef.current) {
          mapInstanceRef.current.destroy()
        }

        const map = new AMap.Map(mapRef.current, {
          zoom: 11,
          center: [116.397428, 39.90923],
          viewMode: '2D'
        })

        mapInstanceRef.current = map
      } catch (error) {
        console.error('Error loading map:', error)
      }
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy()
        mapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !plan?.itinerary) return

    const updateMapWithPlan = async () => {
      try {
        const AMap = window.AMap
        const map = mapInstanceRef.current

        // Clear existing markers
        markersRef.current.forEach(marker => marker.setMap(null))
        markersRef.current = []

        const geocoder = new AMap.Geocoder()
        const locations = []

        // Get coordinates for each day's locations
        if (plan.itinerary.days) {
          for (const day of plan.itinerary.days) {
            if (day.locations) {
              for (const location of day.locations) {
                try {
                  const result = await new Promise((resolve, reject) => {
                    geocoder.getLocation(location.name || location.place, (status, data) => {
                      if (status === 'complete' && data.geocodes.length) {
                        resolve(data.geocodes[0].location)
                      } else {
                        reject(new Error('Geocoding failed'))
                      }
                    })
                  })

                  locations.push({
                    position: result,
                    name: location.name || location.place,
                    description: location.description
                  })

                  // Add marker
                  const marker = new AMap.Marker({
                    position: result,
                    title: location.name || location.place,
                    map: map
                  })

                  // Add info window
                  const infoWindow = new AMap.InfoWindow({
                    content: `<div style="padding: 10px;">
                      <h4 style="margin: 0 0 8px 0;">${location.name || location.place}</h4>
                      <p style="margin: 0; font-size: 12px; color: #666;">${location.description || ''}</p>
                    </div>`
                  })

                  marker.on('click', () => {
                    infoWindow.open(map, marker.getPosition())
                  })

                  markersRef.current.push(marker)
                } catch (err) {
                  console.warn('Failed to geocode:', location.name)
                }
              }
            }
          }
        }

        // Draw route if multiple locations
        if (locations.length > 1) {
          const path = locations.map(loc => loc.position)
          new AMap.Polyline({
            path: path,
            strokeColor: '#667eea',
            strokeWeight: 4,
            strokeOpacity: 0.8,
            map: map
          })

          // Fit map to show all markers
          map.setFitView()
        } else if (locations.length === 1) {
          map.setCenter(locations[0].position)
          map.setZoom(13)
        } else {
          // Try to geocode destination
          try {
            const result = await new Promise((resolve, reject) => {
              geocoder.getLocation(plan.destination, (status, data) => {
                if (status === 'complete' && data.geocodes.length) {
                  resolve(data.geocodes[0].location)
                } else {
                  reject(new Error('Geocoding failed'))
                }
              })
            })
            map.setCenter(result)
            map.setZoom(11)
          } catch (err) {
            console.warn('Failed to geocode destination:', plan.destination)
          }
        }
      } catch (error) {
        console.error('Error updating map:', error)
      }
    }

    updateMapWithPlan()
  }, [plan])

  return (
    <div className="map-view">
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {!plan && (
        <div className="map-placeholder">
          <p>请选择或创建旅行计划以查看地图</p>
        </div>
      )}
    </div>
  )
}

export default MapView