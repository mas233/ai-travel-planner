import React, { useEffect, useRef, useState, useCallback } from 'react';

// 请在public/index.html中添加：
// <script type="text/javascript" src="https://webapi.amap.com/maps?v=2.0&key=YOUR_API_KEY&plugin=AMap.Geocoder,AMap.Driving"></script>

/**
 * AMap itinerary组件
 * 功能：
 * 1. 根据标题渲染地图中心点，并显示地区边界框
 * 2. 按顺序渲染地点标记，标注序号
 * 3. 支持根据两个点的序号渲染导航路线
 */
const AMapItinerary = ({ title, locations, routePoints }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const boundsRef = useRef(null);
  const drivingRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState(null);
  const pendingGeocodesRef = useRef(0);
  const lastRouteRequestRef = useRef(null);
  const AMAP_KEY = (import.meta && import.meta.env && import.meta.env.VITE_AMAP_KEY) ? import.meta.env.VITE_AMAP_KEY : undefined;
  const USE_REST = !!(import.meta && import.meta.env && import.meta.env.VITE_AMAP_USE_REST);

  // 使用 REST API 进行地理编码，避免 JSONP 警告
  const restGeocode = useCallback(async (query) => {
    if (!AMAP_KEY) return null;
    try {
      const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${AMAP_KEY}&output=json`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && Array.isArray(data.geocodes) && data.geocodes.length > 0) {
        const g = data.geocodes[0];
        const [lngStr, latStr] = (g.location || '').split(',');
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);
        if (!isNaN(lng) && !isNaN(lat)) {
          return { lng, lat, address: g.formatted_address || g.formattedAddress || query };
        }
      }
    } catch (e) {
      console.warn('REST地理编码失败', e);
    }
    return null;
  }, [AMAP_KEY]);

  // 使用 REST API 进行驾车路线规划并绘制折线
  const restDriving = useCallback(async (origin, destination) => {
    if (!AMAP_KEY) return false;
    try {
      const url = `https://restapi.amap.com/v3/direction/driving?origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}&key=${AMAP_KEY}&extensions=base`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && data.route && Array.isArray(data.route.paths) && data.route.paths.length > 0) {
        const path = data.route.paths[0];
        // 聚合所有 step 的 polyline
        const points = [];
        for (const step of (path.steps || [])) {
          const seg = (step.polyline || '').split(';');
          for (const p of seg) {
            const [lngStr, latStr] = p.split(',');
            const lng = parseFloat(lngStr);
            const lat = parseFloat(latStr);
            if (!isNaN(lng) && !isNaN(lat)) {
              points.push(new window.AMap.LngLat(lng, lat));
            }
          }
        }
        // 清除旧线
        if (polylineRef.current) {
          polylineRef.current.setMap(null);
        }
        // 绘制新线
        polylineRef.current = new window.AMap.Polyline({
          path: points,
          isOutline: true,
          outlineColor: '#ffffff',
          strokeColor: '#4A90E2',
          strokeOpacity: 0.9,
          strokeWeight: 6,
          strokeStyle: 'solid',
          lineJoin: 'round',
          lineCap: 'round'
        });
        polylineRef.current.setMap(mapRef.current);
        mapRef.current.setFitView([polylineRef.current], false, [50, 50, 50, 50]);
        return true;
      }
    } catch (e) {
      console.warn('REST驾车路线失败', e);
    }
    return false;
  }, [AMAP_KEY]);

  // 尝试绘制路线（在标记可用时调用）
  const attemptRouteDraw = useCallback((startIndex, endIndex) => {
    if (!mapLoaded) return false;

    const startMarker = markersRef.current[startIndex - 1];
    const endMarker = markersRef.current[endIndex - 1];
    if (!startMarker || !endMarker) {
      return false; // 等待标记加载完成后再试
    }

    const startPos = startMarker.getPosition();
    const endPos = endMarker.getPosition();

    // 清除之前的路线
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (USE_REST) {
      // 使用REST绘制
      restDriving({ lng: startPos.lng, lat: startPos.lat }, { lng: endPos.lng, lat: endPos.lat });
      return true;
    }

    if (!drivingRef.current) return false;
    drivingRef.current.clear();
    drivingRef.current.search(
      [startPos.lng, startPos.lat],
      [endPos.lng, endPos.lat],
      (status, result) => {
        if (status === 'complete') {
          const routes = result.routes || [];
          if (routes.length > 0) {
            const route = routes[0];
            const distance = (route.distance / 1000).toFixed(2);
            const time = Math.ceil(route.time / 60);
            const infoWindow = new window.AMap.InfoWindow({
              content: `
                <div style="padding: 10px; min-width: 250px;">
                  <h4 style="margin: 0 0 10px 0; color: #333;">导航路线</h4>
                  <div style="margin-bottom: 8px;">
                    <span style="color: #666;">从：</span>
                    <strong>${startMarker.getExtData().name}</strong>
                  </div>
                  <div style="margin-bottom: 8px;">
                    <span style="color: #666;">到：</span>
                    <strong>${endMarker.getExtData().name}</strong>
                  </div>
                  <div style="font-size: 12px; color: #999;">
                    <div>距离：${distance} 公里</div>
                    <div>预计时间：${time} 分钟</div>
                  </div>
                </div>
              `,
              offset: new window.AMap.Pixel(0, 0)
            });
            infoWindow.open(mapRef.current, [endPos.lng, endPos.lat]);
            return true;
          }
        } else {
          console.warn('路线规划未完成或失败', result);
        }
        return false;
      }
    );

    return true;
  }, [mapLoaded, USE_REST, restDriving]);

  // 初始化地图
  useEffect(() => {
    if (!window.AMap) {
      setError('AMap API未加载，请在index.html中添加高德地图API脚本');
      return;
    }

    // 创建地图实例
    mapRef.current = new window.AMap.Map(mapContainerRef.current, {
      zoom: 10,
      center: [116.397428, 39.90923], // 默认中心点（北京）
      resizeEnable: true,
      viewMode: '2D', // 可以使用3D模式：'3D'
    });

    // 监听地图加载完成事件
    mapRef.current.on('complete', () => {
      setMapLoaded(true);
    });

    // 创建驾车路线规划实例（只在未启用REST时）
    if (!USE_REST) {
      drivingRef.current = new window.AMap.Driving({
        map: mapRef.current,
        showTraffic: true,
        autoFitView: true,
      });
    }

    // 清理函数
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // 搜索标题位置并设置为中心点，获取边界框
  useEffect(() => {
    if (!mapLoaded || !title) return;

    const geocoder = new window.AMap.Geocoder();
    
    geocoder.getLocation(title, (status, result) => {
      if (status === 'complete' && result.geocodes.length > 0) {
        const location = result.geocodes[0].location;
        const bounds = result.geocodes[0].bounds;
        
        // 设置地图中心
        mapRef.current.setCenter([location.lng, location.lat]);
        
        // 如果有边界框，调整地图视野
        if (bounds) {
          mapRef.current.setBounds(
            new window.AMap.Bounds(
              [bounds.southwest.lng, bounds.southwest.lat],
              [bounds.northeast.lng, bounds.northeast.lat]
            ),
            false, // 不动画
            [50, 50, 50, 50] // 边距
          );
          boundsRef.current = bounds;
        } else {
          // 如果没有边界框，根据地点自动调整
          mapRef.current.setZoom(10);
        }
      } else {
        console.warn('无法找到标题位置:', title);
        setError(`无法找到标题位置: ${title}`);
      }
    });
  }, [mapLoaded, title]);

  // 渲染地点标记
  useEffect(() => {
    if (!mapLoaded || !locations || locations.length === 0) return;

    // 清除现有标记
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
    pendingGeocodesRef.current = locations.length;
    const geocoder2 = new window.AMap.Geocoder();

    // 添加新的地点标记
    locations.forEach((locationName, index) => {
      const handleResult = (status, result) => {
        if (status === 'complete' && result.geocodes.length > 0) {
          const location = result.geocodes[0].location;
          const address = result.geocodes[0].formattedAddress;
          
          // 创建自定义标记图标
          const markerContent = `
            <div style="
              position: relative;
              width: 36px;
              height: 36px;
              background: #4A90E2;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <div style="
                transform: rotate(45deg);
                color: white;
                font-size: 14px;
                font-weight: bold;
                font-family: Arial, sans-serif;
                margin-top: -2px;
              ">
                ${index + 1}
              </div>
            </div>
          `;
          
          const marker = new window.AMap.Marker({
            position: [location.lng, location.lat],
            content: markerContent,
            anchor: 'center',
            offset: new window.AMap.Pixel(-18, -18),
            extData: {
              index: index + 1,
              name: locationName,
              address: address,
              coord: { lng: location.lng, lat: location.lat }
            }
          });
          
          // 添加标记到地图
          marker.setMap(mapRef.current);
          markersRef.current.push(marker);
          
          // 添加点击事件
          marker.on('click', () => {
            const infoWindow = new window.AMap.InfoWindow({
              content: `
                <div style="padding: 10px; min-width: 200px;">
                  <h4 style="margin: 0 0 8px 0; color: #333;">${locationName}</h4>
                  <p style="margin: 0; color: #666; font-size: 12px;">序号：${index + 1}</p>
                  <p style="margin: 4px 0 0 0; color: #999; font-size: 12px;">${address}</p>
                </div>
              `,
              offset: new window.AMap.Pixel(0, -30)
            });
            infoWindow.open(mapRef.current, [location.lng, location.lat]);
          });
          
          // 自动调整地图视野
          if (index === locations.length - 1) {
            setTimeout(() => {
              mapRef.current.setFitView(markersRef.current, false, [50, 50, 50, 50]);
            }, 500);
          }
        } else {
          console.warn('无法找到地点（将跳过标记）:', locationName);
        }
        // 无论成功与否都减少计数
        pendingGeocodesRef.current -= 1;
        if (pendingGeocodesRef.current === 0) {
          // 所有地理编码完成后，适配视图并尝试绘制排队的路线
          setTimeout(() => {
            if (markersRef.current.length > 0) {
              mapRef.current.setFitView(markersRef.current, false, [50, 50, 50, 50]);
            }
            if (lastRouteRequestRef.current) {
              const [s, t] = lastRouteRequestRef.current;
              attemptRouteDraw(s, t);
            }
          }, 300);
        }
      };

      const geocodeWithContext = async () => {
        if (USE_REST) {
          const g1 = await restGeocode(`${title || ''} ${locationName}`.trim());
          const g2 = g1 || await restGeocode(locationName);
          if (g2) {
            const result = { geocodes: [{ location: { lng: g2.lng, lat: g2.lat }, formattedAddress: g2.address }] };
            handleResult('complete', result);
          } else {
            handleResult('no_data', { geocodes: [] });
          }
        } else {
          geocoder2.getLocation(`${title || ''} ${locationName}`.trim(), (status, result) => {
            if (status === 'complete' && result.geocodes.length > 0) {
              handleResult(status, result);
            } else {
              // 回退REST
              restGeocode(locationName).then(g => {
                if (g) {
                  const r = { geocodes: [{ location: { lng: g.lng, lat: g.lat }, formattedAddress: g.address }] };
                  handleResult('complete', r);
                } else {
                  handleResult('no_data', { geocodes: [] });
                }
              });
            }
          });
        }
      };

      geocodeWithContext();
    });
  }, [mapLoaded, locations, title, USE_REST, restGeocode, attemptRouteDraw]);

  // 渲染路线
  useEffect(() => {
    if (!mapLoaded || !routePoints || routePoints.length !== 2) return;
    const [startIndex, endIndex] = routePoints;
    // 记录最新的路线请求，等标记加载结束后重试
    lastRouteRequestRef.current = [startIndex, endIndex];
    // 尝试立即绘制（如果标记已就绪）
    attemptRouteDraw(startIndex, endIndex);
  }, [mapLoaded, routePoints, attemptRouteDraw]);

  // 渲染导航路线的函数（供外部调用）
  const navigateTo = useCallback(async (startIndex, endIndex) => {
    if (!mapRef.current) {
      console.warn('地图未初始化，无法导航');
      return;
    }
    
    let startMarker = markersRef.current[startIndex - 1];
    let endMarker = markersRef.current[endIndex - 1];
    const startName = locations?.[startIndex - 1];
    const endName = locations?.[endIndex - 1];
    
    let startPos, endPos;
    if (!startMarker && USE_REST && startName) {
      const g = await restGeocode(`${title || ''} ${startName}`.trim()) || await restGeocode(startName);
      if (g) startPos = { lng: g.lng, lat: g.lat };
    }
    if (!endMarker && USE_REST && endName) {
      const g = await restGeocode(`${title || ''} ${endName}`.trim()) || await restGeocode(endName);
      if (g) endPos = { lng: g.lng, lat: g.lat };
    }

    if (!startPos && startMarker) {
      const p = startMarker.getPosition();
      startPos = { lng: p.lng, lat: p.lat };
    }
    if (!endPos && endMarker) {
      const p = endMarker.getPosition();
      endPos = { lng: p.lng, lat: p.lat };
    }
    
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    
    if (!startPos || !endPos) {
      console.warn('找不到路线起点或终点');
      return;
    }

    if (USE_REST) {
      const ok = await restDriving(startPos, endPos);
      if (!ok) {
        console.warn('REST路线规划失败');
      }
      return;
    }

    if (!drivingRef.current) {
      console.warn('路线规划器未初始化');
      return;
    }
    drivingRef.current.clear();
    drivingRef.current.search(
      [startPos.lng, startPos.lat],
      [endPos.lng, endPos.lat],
      (status, result) => {
        if (status === 'complete') {
          const routes = result.routes || [];
          if (routes.length > 0) {
            const route = routes[0];
            const distance = (route.distance / 1000).toFixed(2);
            const time = Math.ceil(route.time / 60);
            const infoWindow = new window.AMap.InfoWindow({
              content: `
                <div style="padding: 10px; min-width: 250px;">
                  <h4 style="margin: 0 0 10px 0; color: #333;">导航路线</h4>
                  <div style="margin-bottom: 8px;">
                    <span style="color: #666;">从：</span>
                    <strong>${startName || '起点'}</strong>
                  </div>
                  <div style="margin-bottom: 8px;">
                    <span style="color: #666;">到：</span>
                    <strong>${endName || '终点'}</strong>
                  </div>
                  <div style="font-size: 12px; color: #999;">
                    <div>距离：${distance} 公里</div>
                    <div>预计时间：${time} 分钟</div>
                  </div>
                </div>
              `,
              offset: new window.AMap.Pixel(0, 0)
            });
            infoWindow.open(mapRef.current, [endPos.lng, endPos.lat]);
          }
        } else {
          console.warn('路线规划失败:', result);
        }
      }
    );
  }, []);

  // 清除导航路线
  const clearRoute = useCallback(() => {
    if (drivingRef.current) {
      drivingRef.current.clear();
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
  }, []);

  // 将方法暴露给父组件
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.navigateTo = navigateTo;
      mapRef.current.clearRoute = clearRoute;
    }
  }, [navigateTo, clearRoute]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {error && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '4px',
          zIndex: 1000,
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}
      
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* 控制面板（可选） */}
      {markersRef.current.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 1000,
          maxWidth: '300px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>地点列表</h4>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {markersRef.current.map((marker, index) => (
              <div key={index} style={{ marginBottom: '5px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '18px',
                  height: '18px',
                  background: '#4A90E2',
                  color: 'white',
                  borderRadius: '50%',
                  textAlign: 'center',
                  lineHeight: '18px',
                  marginRight: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>
                  {index + 1}
                </span>
                {marker.getExtData().name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 使用示例组件
const AMapItineraryExample = () => {
  const [showItinerary, setShowItinerary] = useState(true);
  const [routePoints, setRoutePoints] = useState(null);
  const mapRef = useRef(null);

  const data = {
    title: "日本北海道",
    locations: ["小樽", "富良野", "旭川动物园", "札幌王子大酒店"]
  };

  const handleShowFullMap = () => {
    setShowItinerary(true);
    setRoutePoints(null);
    if (mapRef.current) {
      mapRef.current.clearRoute();
    }
  };

  const handleShowRoute = (startIndex, endIndex) => {
    setShowItinerary(true);
    setRoutePoints([startIndex, endIndex]);
    
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.navigateTo(startIndex, endIndex);
      }
    }, 1000);
  };

  if (!showItinerary) {
    return null;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '15px', 
        background: '#f5f5f5', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <button 
          onClick={handleShowFullMap}
          style={{
            padding: '8px 16px',
            background: '#4A90E2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          显示完整地图
        </button>
        <button 
          onClick={() => handleShowRoute(1, 2)}
          style={{
            padding: '8px 16px',
            background: '#52C41A',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          显示路线：小樽 → 富良野
        </button>
        <button 
          onClick={() => handleShowRoute(2, 3)}
          style={{
            padding: '8px 16px',
            background: '#52C41A',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          显示路线：富良野 → 旭川动物园
        </button>
        <button 
          onClick={() => handleShowRoute(3, 4)}
          style={{
            padding: '8px 16px',
            background: '#52C41A',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          显示路线：旭川动物园 → 札幌王子大酒店
        </button>
      </div>
      
      <div style={{ flex: 1, position: 'relative' }}>
        <AMapItinerary 
          ref={mapRef}
          title={data.title} 
          locations={data.locations}
          routePoints={routePoints}
        />
      </div>
    </div>
  );
};

export default AMapItineraryExample;
export { AMapItinerary };
