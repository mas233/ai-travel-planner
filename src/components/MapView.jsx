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
          plugins: ['AMap.Geocoder', 'AMap.Marker', 'AMap.Polyline', 'AMap.Driving']
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

        // Clear existing markers and routes
        markersRef.current.forEach(marker => marker.setMap(null))
        markersRef.current = []
        if (window.driving) {
          window.driving.clear()
        }

        const geocoder = new AMap.Geocoder()
        const locations = []
        const waypoints = []

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

                  const position = [result.lng, result.lat];
                  locations.push({
                    position: position,
                    name: location.name || location.place,
                    description: location.description
                  })

                  // Add marker
                  const marker = new AMap.Marker({
                    position: position,
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

                  if (locations.length > 1) {
                    waypoints.push(position);
                  }

                } catch (error) {
                  console.error('Error geocoding location:', location.name, error)
                }
              }
            }
          }
        }

        if (locations.length > 1) {
          const start = locations[0].position;
          const end = locations[locations.length - 1].position;
          const path = waypoints.slice(0, -1);

          const driving = new AMap.Driving({
            map: map,
            policy: AMap.DrivingPolicy.LEAST_TIME
          });

          window.driving = driving; // Store driving instance to clear it later

          driving.search(start, end, { waypoints: path }, (status, result) => {
            if (status === 'complete') {
              // Fit map to route
              map.setFitView();
            } else {
              console.error('Failed to get driving route:', result);
            }
          });
        } else if (locations.length === 1) {
          map.setCenter(locations[0].position)
          map.setZoom(14)
        }

      } catch (error) {
        console.error('Error updating map with plan:', error)
      }
    }

    updateMapWithPlan()

  }, [plan])

  return <div ref={mapRef} className="map-view"></div>
}

export default MapView