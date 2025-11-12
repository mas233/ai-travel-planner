// AI Service for generating travel itineraries using Tongyi Qianwen API
import { geocodeAddress } from './amapService'
import { getEnv } from '../utils/env'

function getQIANWEN_API_KEY() { return getEnv('VITE_QIANWEN_API_KEY') }
const QIANWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

// 讯飞 Spark 推理服务（HTTP 协议，OpenAI 兼容）
const XUNFEI_HTTP_API_KEY = getEnv('VITE_XUNFEI_HTTP_API_KEY')
// 兼容 OpenAI 路径：/v1/chat/completions
const XUNFEI_HTTP_ENDPOINT = 'https://maas-api.cn-huabei-1.xf-yun.com/v1/chat/completions'
// 模型名称，需在 .env 配置，例如：General-Spark-Standard 或 General-Spark-Lite
const XUNFEI_MODEL = getEnv('VITE_XUNFEI_MODEL')

// ---------- Helpers for geocoding & normalization (module scope) ----------
function isValidLongitude(lng) {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180
}

function isValidLatitude(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

function toNumberOrNull(val) {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return Number.isFinite(n) ? n : null
}

async function safeGeocode(address) {
  const q = (address || '').trim()
  if (!q || q.length < 2) {
    return { longitude: null, latitude: null }
  }
  try {
    const { longitude, latitude } = await geocodeAddress(q)
    return {
      longitude: toNumberOrNull(longitude),
      latitude: toNumberOrNull(latitude)
    }
  } catch (_) {
    return { longitude: null, latitude: null }
  }
}

// Attempt to robustly extract a JSON object from a free-form LLM content string
function extractJsonFromText(text) {
  if (text == null) throw new Error('LLM未返回内容')
  if (typeof text !== 'string') {
    // Some providers may already return an object
    try { return JSON.parse(JSON.stringify(text)) } catch { throw new Error('LLM返回内容非字符串且无法序列化') }
  }
  let s = text.trim()
  // Remove common code fences
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  // Extract between the first '{' and the last '}' if extra text is present
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1)
  }
  // Remove trailing commas before closing braces/brackets to fix minor formatting
  s = s.replace(/,\s*([}\]])/g, '$1')
  // Escape raw newlines inside double-quoted strings to keep JSON valid
  {
    let out = ''
    let inString = false
    let backslash = false
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === '"' && !backslash) {
        inString = !inString
        out += ch
        backslash = false
        continue
      }
      if (ch === '\\') {
        out += ch
        backslash = !backslash
        continue
      }
      if (inString && (ch === '\n' || ch === '\r')) {
        out += '\\n'
        backslash = false
        continue
      }
      if (inString && (ch === '\u2028' || ch === '\u2029')) {
        out += '\\n'
        backslash = false
        continue
      }
      out += ch
      backslash = false
    }
    s = out
  }
  // Remove problematic control characters
  s = s.replace(/[\u0000-\u001F]+/g, '')
  // Remove Unicode line/paragraph separators globally
  s = s.replace(/[\u2028\u2029]/g, '')
  try {
    return JSON.parse(s)
  } catch (err) {
    // 将清洗后的全文打印到控制台，便于命令行/控制台定位问题
    try {
      console.error('\n===== LLM JSON RAW (cleaned) BEGIN =====\n')
      console.error(s)
      console.error('\n===== LLM JSON RAW (cleaned) END =====\n')
    } catch (_) {}
    const snippet = s.slice(0, 500)
    throw new Error(`LLM返回JSON解析失败：${err.message}。片段：${snippet}`)
  }
}

// Robust resolver to ensure destination coordinates are non-null by trying multiple candidates
async function resolveDestinationCoords(destination) {
  const raw = (destination || '').trim()
  const candidateSet = new Set()

  // Known mappings for ambiguous region names -> formal names / capital cities
  const formalMap = {
    '西藏': ['西藏自治区', '拉萨市'],
    '内蒙古': ['内蒙古自治区', '呼和浩特市'],
    '广西': ['广西壮族自治区', '南宁市'],
    '宁夏': ['宁夏回族自治区', '银川市'],
    '新疆': ['新疆维吾尔自治区', '乌鲁木齐市'],
    '香港': ['香港特别行政区'],
    '澳门': ['澳门特别行政区']
  }

  if (raw) {
    candidateSet.add(raw)
    candidateSet.add(`${raw}市`)
    candidateSet.add(`${raw}省`)
    candidateSet.add(`${raw}自治区`)
    candidateSet.add(`${raw}特别行政区`)
    if (formalMap[raw]) {
      for (const f of formalMap[raw]) candidateSet.add(f)
    }
  }

  for (const addr of candidateSet) {
    const res = await safeGeocode(addr)
    if (isValidLongitude(res.longitude) && isValidLatitude(res.latitude)) {
      return res
    }
  }

  // As last resort, return nulls (caller may handle further)
  return { longitude: null, latitude: null }
}

async function enrichItineraryWithCoords({ itinerary, destination, days, budget, travelers }) {
  const destLatRaw = itinerary.destination_latitude
  const destLngRaw = itinerary.destination_longitude
  let destLat = toNumberOrNull(destLatRaw)
  let destLng = toNumberOrNull(destLngRaw)
  const normDest = (destination || '').trim()

  if (!isValidLatitude(destLat) || !isValidLongitude(destLng)) {
    const dest = await resolveDestinationCoords(destination)
    destLat = dest.latitude
    destLng = dest.longitude
  }

  const normalizedItinerary = {
    // 目的地坐标使用 AMap 解析结果；若解析失败则保持为 null，由上层渲染或后续修复逻辑处理
    destination_latitude: isValidLatitude(destLat) ? destLat : null,
    destination_longitude: isValidLongitude(destLng) ? destLng : null,
    days: (Array.isArray(itinerary.days) ? itinerary.days : []).map((day, index) => ({
      day: day?.day || index + 1,
      theme: day?.theme || `第${index + 1}天`,
      locations: Array.isArray(day?.locations) ? day.locations : [],
      accommodation: day?.accommodation || {
        name: '待定酒店',
        area: destination,
        priceRange: '中档',
        estimatedCost: Math.round((budget || 0) / (days || 1) / (travelers || 1) * 0.4)
      },
      meals: day?.meals || {
        breakfast: '酒店早餐',
        lunch: '当地餐厅',
        dinner: '特色美食'
      },
      transportation: day?.transportation || {
        type: '公共交通',
        estimatedCost: Math.round((budget || 0) / (days || 1) * 0.1)
      },
      estimatedCost: day?.estimatedCost || Math.round((budget || 0) / (days || 1))
    })),
    budgetBreakdown: itinerary.budgetBreakdown || {
      accommodation: Math.round((budget || 0) * 0.35),
      food: Math.round((budget || 0) * 0.25),
      transportation: Math.round((budget || 0) * 0.20),
      attractions: Math.round((budget || 0) * 0.10),
      shopping: Math.round((budget || 0) * 0.05),
      reserve: Math.round((budget || 0) * 0.05)
    },
    tips: Array.isArray(itinerary.tips) ? itinerary.tips : [
      '提前预订景点门票',
      '注意天气变化',
      '保管好贵重物品'
    ],
    transportation: itinerary.transportation || {
      toDestination: '飞机/高铁',
      local: '地铁/公交',
      estimatedCost: Math.round((budget || 0) * 0.2)
    }
  }

  const destFallback = {
    longitude: normalizedItinerary.destination_longitude,
    latitude: normalizedItinerary.destination_latitude
  }

  for (const day of normalizedItinerary.days) {
    const newLocs = []
    for (const loc of day.locations) {
      const name = (loc?.name || '未命名景点').trim()
      const place = (loc?.place || normDest).trim()

      let lng = toNumberOrNull(loc?.longitude)
      let lat = toNumberOrNull(loc?.latitude)

      const hasValid = isValidLongitude(lng) && isValidLatitude(lat)
      if (!hasValid) {
        const addrCandidates = Array.from(new Set([
          place,
          `${normDest} ${place}`.trim(),
          `${normDest} ${name}`.trim(),
          normDest
        ].filter(Boolean)))

        let found = { longitude: null, latitude: null }
        for (const addr of addrCandidates) {
          const res = await safeGeocode(addr)
          if (isValidLongitude(res.longitude) && isValidLatitude(res.latitude)) {
            found = res
            break
          }
        }

        if (isValidLongitude(found.longitude) && isValidLatitude(found.latitude)) {
          lng = found.longitude
          lat = found.latitude
        } else if (isValidLongitude(destFallback.longitude) && isValidLatitude(destFallback.latitude)) {
          lng = destFallback.longitude
          lat = destFallback.latitude
        } else {
          lng = null
          lat = null
        }
      }

      newLocs.push({
        name,
        place,
        longitude: isValidLongitude(lng) ? lng : null,
        latitude: isValidLatitude(lat) ? lat : null,
        description: loc?.description || '',
        time: loc?.time || '全天',
        tips: loc?.tips || ''
      })
    }
    day.locations = newLocs
  }

  return normalizedItinerary
}
/**
 * Generate travel itinerary using Tongyi Qianwen LLM
 * @param {Object} params - Travel parameters
 * @param {string} params.destination - Destination city/country
 * @param {number} params.days - Number of days
 * @param {number} params.budget - Total budget in CNY
 * @param {number} params.travelers - Number of travelers
 * @param {string} params.preferences - User preferences (food, anime, shopping, etc.)
 * @returns {Promise<Object>} Structured itinerary object
 */
export async function generateItinerary({ destination, days, budget, travelers, preferences }) {
  const QIANWEN_API_KEY = getQIANWEN_API_KEY()
  if (!QIANWEN_API_KEY) {
    try { window.dispatchEvent(new CustomEvent('env:config-required', { detail: { missing: ['VITE_QIANWEN_API_KEY'] } })) } catch {}
    throw new Error('行程生成服务未配置：请在设置中填写 VITE_QIANWEN_API_KEY')
  }

  try {
    const systemPrompt = `你是一位专业的旅行规划专家。你的任务是根据用户需求生成详细的旅行行程计划。

必须严格返回一个 JSON 对象（不允许任何额外文字），字段规范如下：

{
  "days": [
    {
      "day": 1,
      "theme": "第一天主题（例如：抵达与适应）",
      "locations": [
        {
          "name": "景点名称",
          "place": "具体地址或区域（便于后续地理编码）",
          "description": "景点描述和游玩建议",
          "time": "建议游玩时间（例如：09:00-12:00）",
          "tips": "游玩小贴士"
        }
      ],
      "accommodation": {
        "name": "推荐酒店名称",
        "area": "所在区域",
        "priceRange": "价格区间",
        "estimatedCost": 每晚费用（数字）
      },
      "meals": {
        "breakfast": "早餐建议",
        "lunch": "午餐建议",
        "dinner": "晚餐建议"
      },
      "transportation": {
        "type": "主要交通方式",
        "estimatedCost": 当日交通费用（数字）
      },
      "estimatedCost": 当日总预算（数字）
    }
  ],
  "budgetBreakdown": {
    "accommodation": 住宿总费用（数字）, 
    "food": 餐饮总费用（数字）, 
    "transportation": 交通总费用（数字）, 
    "attractions": 景点门票总费用（数字）, 
    "shopping": 购物预算（数字）, 
    "reserve": 预留费用（数字）
  },
  "tips": [
    "实用旅行建议1",
    "实用旅行建议2",
    "实用旅行建议3"
  ],
  "transportation": {
    "toDestination": "往返目的地的交通建议",
    "local": "当地交通建议",
    "estimatedCost": 总交通费用（数字）
  }
}

严格要求：
1. 每天安排 2-4 个景点或活动；必须是真实存在的地点，避免含糊或虚构。
2. 所有费用字段必须是数字类型，不包含货币符号。
3. 不要生成任何经纬度相关字段（如 longitude、latitude、destination_longitude、destination_latitude）。
4. 地址信息要具体，便于后续地理编码（例如包含城市区名或著名地标）。
5. 返回值必须是严格的 JSON 对象（与响应格式一致），不允许多余文本。`

    const userPrompt = `请为我规划一个${days}天的${destination}旅行计划：

基本信息：
- 目的地：${destination}
- 旅行天数：${days}天
- 总预算：${budget}元人民币
- 出行人数：${travelers}人
- 旅行偏好：${preferences || '休闲观光'}

请根据以上信息，生成详细的每日行程安排，包括景点、住宿、餐饮、交通等详细信息。确保预算分配合理，行程安排紧凑但不过于疲惫。`

    const response = await fetch(QIANWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${QIANWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3-30b-a3b-instruct-2507',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        response_format: {
          type: 'json_object'
        },
        max_tokens: 5000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.message || ''}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    const itineraryRaw = extractJsonFromText(content)
    // 为确保坐标一律通过 AMap 统一解析，剥离 LLM 可能返回的坐标字段
    const itinerary = (() => {
      try {
        const obj = JSON.parse(JSON.stringify(itineraryRaw))
        delete obj.destination_longitude
        delete obj.destination_latitude
        if (Array.isArray(obj.days)) {
          for (const day of obj.days) {
            if (Array.isArray(day?.locations)) {
              for (const loc of day.locations) {
                if (loc && typeof loc === 'object') {
                  delete loc.longitude
                  delete loc.latitude
                }
              }
            }
          }
        }
        return obj
      } catch (_) {
        return itineraryRaw
      }
    })()

    // Validate the structure
    if (!itinerary.days || !Array.isArray(itinerary.days)) {
      throw new Error('Invalid itinerary structure: missing days array')
    }

    // Normalize and fill defaults, then enrich with coordinates
    const normalized = await enrichItineraryWithCoords({ itinerary, destination, days, budget, travelers })
    console.log('Successfully generated itinerary from Qianwen API')
    return normalized

  } catch (error) {
    console.error('Error calling Qianwen API:', error)
    throw error
  }
}

// 删除未使用的 generateMockItinerary，避免混淆与冗余


/**
 * Parse user voice input to extract travel plan details.
 * @param {string} voiceInput - The user's voice input as a string.
 * @returns {Promise<Object>} A structured object with extracted details.
 */
export async function parseVoiceInput(voiceInput) {
  // 当前系统时间上下文（含 UTC 偏移），用于日期推断
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const currentDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const tzOffsetMin = -now.getTimezoneOffset() // 本地相对 UTC 的偏移（正表示东区）
  const sign = tzOffsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(tzOffsetMin)
  const tz = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  const currentContext = `当前系统时间：${currentDate} ${currentTime}（UTC${tz}）`
  // 1) 优先使用讯飞 Spark HTTP（OpenAI 兼容）
    if (XUNFEI_HTTP_API_KEY) {
    const systemPrompt = `你是一个智能助理，负责从用户的自然语言输入中提取旅行计划的关键信息。

你必须严格按照以下JSON格式返回结果，不要添加任何其他文字说明。如果某个字段在用户输入中没有提及，请将其值设为 null。

{
  "destination": "目的地城市或国家",
  "startDate": "开始日期 (YYYY-MM-DD)",
  "endDate": "结束日期 (YYYY-MM-DD)",
  "budget": 预算金额 (数字),
  "travelers": 同行人数 (数字),
  "preferences": "旅行偏好"
}

注意：
- 你将获得“当前系统时间（UTC±HH:mm）”；若用户未明确年份或仅提到相对时间（如“下周末”“本月中旬”），请根据当前系统时间推断具体 YYYY-MM-DD；若无法确定返回 null。
- 统一日期输出格式为 YYYY-MM-DD；数字字段确保为数字类型。`;

    const userPrompt = `当前时间上下文：${currentContext}\n\n请从以下文本中提取旅行计划信息：\n\n"${voiceInput}"`;

    try {
      const response = await fetch(XUNFEI_HTTP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XUNFEI_HTTP_API_KEY}`
        },
        body: JSON.stringify({
          model: XUNFEI_MODEL || 'General-Spark-Standard',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          stream: false
        })
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`Xunfei HTTP request failed: ${response.status} ${response.statusText} ${errText}`)
      }

      const data = await response.json()
      const contentString = data.choices?.[0]?.message?.content
      if (!contentString) throw new Error('Empty content from Xunfei response')

      const jsonContent = contentString.replace(/\n/g, '').trim()
      return JSON.parse(jsonContent)

    } catch (error) {
      console.error('Error parsing voice input via Xunfei HTTP:', error)
      // 回退到其他模型或 mock
    }
  }

  // 2) 次选：通义千问（若配置可用）
  const QIANWEN_API_KEY_FALLBACK = getQIANWEN_API_KEY()
  if (QIANWEN_API_KEY_FALLBACK) {
    const systemPrompt = `你是一个智能助理，负责从用户的自然语言输入中提取旅行计划的关键信息。

你必须严格按照以下JSON格式返回结果，不要添加任何其他文字说明。如果某个字段在用户输入中没有提及，请将其值设为 null。

{
  "destination": "目的地城市或国家",
  "startDate": "开始日期 (YYYY-MM-DD)",
  "endDate": "结束日期 (YYYY-MM-DD)",
  "budget": 预算金额 (数字),
  "travelers": 同行人数 (数字),
  "preferences": "旅行偏好"
}

注意：
- 你将获得“当前系统时间（UTC±HH:mm）”；若用户未明确年份或仅提到相对时间（如“下周末”“本月中旬”），请根据当前系统时间推断具体 YYYY-MM-DD；若无法确定返回 null。
- 统一日期输出格式为 YYYY-MM-DD；数字字段确保为数字类型。`;

    const userPrompt = `当前时间上下文：${currentContext}\n\n请从以下文本中提取旅行计划信息：\n\n"${voiceInput}"`;

    try {
      const response = await fetch(QIANWEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        'Authorization': `Bearer ${QIANWEN_API_KEY_FALLBACK}`,
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2
        }),
      })

      if (!response.ok) {
        throw new Error(`Qianwen HTTP error: ${response.status}`)
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      const jsonContent = content.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error('Error parsing voice input via Qianwen:', error)
    }
  }

  // 3) 最终回退：mock 数据，保证功能可用
  console.warn('No AI key configured; using mock parsing result')
  return {
    destination: '日本横滨',
    startDate: null,
    endDate: null,
    budget: 5000,
    travelers: 2,
    preferences: '游览景点'
  }
}
