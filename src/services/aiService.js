// AI Service for generating travel itineraries using Tongyi Qianwen API

const QIANWEN_API_KEY = import.meta.env.VITE_QIANWEN_API_KEY
const QIANWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

// 讯飞 Spark 推理服务（HTTP 协议，OpenAI 兼容）
const XUNFEI_HTTP_API_KEY = import.meta.env.VITE_XUNFEI_HTTP_API_KEY
// 兼容 OpenAI 路径：/v1/chat/completions
const XUNFEI_HTTP_ENDPOINT = 'https://maas-api.cn-huabei-1.xf-yun.com/v1/chat/completions'
// 模型名称，需在 .env 配置，例如：General-Spark-Standard 或 General-Spark-Lite
const XUNFEI_MODEL = import.meta.env.VITE_XUNFEI_MODEL

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
  if (!QIANWEN_API_KEY || QIANWEN_API_KEY === 'your_qianwen_api_key') {
    console.warn('Qianwen API key not configured, using mock data')
    return generateMockItinerary({ destination, days, budget, travelers, preferences })
  }

  try {
    const systemPrompt = `你是一位专业的旅行规划专家。你的任务是根据用户需求生成详细的旅行行程计划。

你必须严格按照以下JSON格式返回结果，不要添加任何其他文字说明：

{
  "days": [
    {
      "day": 1,
      "theme": "第一天主题（例如：抵达与适应）",
      "locations": [
        {
          "name": "景点名称",
          "place": "具体地址或区域",
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

要求：
1. 每天安排3-5个景点或活动
2. 景点安排要考虑地理位置，避免过度往返
3. 预算分配要合理，确保总和不超过用户预算
4. 考虑用户的旅行偏好
5. 提供实用的小贴士和建议
6. 所有费用字段必须是数字类型，不要包含货币符号
7. 地址信息要具体，便于地图定位`

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
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.message || ''}`)
    }

    const data = await response.json()
    
    // Extract the JSON string from response
    const contentString = data.choices?.[0]?.message?.content
    
    if (!contentString) {
      throw new Error('No content returned from API')
    }

    // Parse the JSON string
    const itinerary = JSON.parse(contentString)
    
    // Validate the structure
    if (!itinerary.days || !Array.isArray(itinerary.days)) {
      throw new Error('Invalid itinerary structure: missing days array')
    }

    // Ensure all required fields exist with defaults
    const validatedItinerary = {
      days: itinerary.days.map((day, index) => ({
        day: day.day || index + 1,
        theme: day.theme || `第${index + 1}天`,
        locations: Array.isArray(day.locations) ? day.locations.map(loc => ({
          name: loc.name || '未命名景点',
          place: loc.place || destination,
          description: loc.description || '',
          time: loc.time || '全天',
          tips: loc.tips || ''
        })) : [],
        accommodation: day.accommodation || {
          name: '待定酒店',
          area: destination,
          priceRange: '中档',
          estimatedCost: Math.round(budget / days / travelers * 0.4)
        },
        meals: day.meals || {
          breakfast: '酒店早餐',
          lunch: '当地餐厅',
          dinner: '特色美食'
        },
        transportation: day.transportation || {
          type: '公共交通',
          estimatedCost: Math.round(budget / days * 0.1)
        },
        estimatedCost: day.estimatedCost || Math.round(budget / days)
      })),
      budgetBreakdown: itinerary.budgetBreakdown || {
        accommodation: Math.round(budget * 0.35),
        food: Math.round(budget * 0.25),
        transportation: Math.round(budget * 0.20),
        attractions: Math.round(budget * 0.10),
        shopping: Math.round(budget * 0.05),
        reserve: Math.round(budget * 0.05)
      },
      tips: Array.isArray(itinerary.tips) ? itinerary.tips : [
        '提前预订景点门票',
        '注意天气变化',
        '保管好贵重物品'
      ],
      transportation: itinerary.transportation || {
        toDestination: '飞机/高铁',
        local: '地铁/公交',
        estimatedCost: Math.round(budget * 0.2)
      }
    }

    console.log('Successfully generated itinerary from Qianwen API')
    return validatedItinerary

  } catch (error) {
    console.error('Error calling Qianwen API:', error)
    
    // If API call fails, fall back to mock data
    console.warn('Falling back to mock itinerary due to error')
    return generateMockItinerary({ destination, days, budget, travelers, preferences })
  }
}

/**
 * Generate mock itinerary for testing/fallback
 */
function generateMockItinerary({ destination, days, budget, travelers, preferences }) {
  console.log('Generating mock itinerary for:', { destination, days, budget, travelers, preferences })
  
  return {
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      theme: i === 0 ? '抵达与适应' : i === days - 1 ? '返程准备' : `探索${destination}`,
      locations: [
        {
          name: `${destination}著名景点 ${i + 1}`,
          place: `${destination}市中心`,
          description: `这是${destination}最受欢迎的景点之一，${preferences ? `特别适合喜欢${preferences}的游客` : '适合各类游客'}。建议游玩时间2-3小时。`,
          time: '09:00-12:00',
          tips: '建议提前在线购票，避免排队'
        },
        {
          name: `${destination}特色美食街`,
          place: `${destination}老城区`,
          description: '汇集当地特色小吃和传统美食，是品尝地道风味的最佳地点。',
          time: '12:00-14:00',
          tips: '人均消费约80-120元'
        },
        {
          name: `${destination}文化体验中心`,
          place: `${destination}新区`,
          description: '了解当地历史文化的绝佳场所，设有互动展览和体验活动。',
          time: '15:00-18:00',
          tips: '周一闭馆，请注意开放时间'
        }
      ],
      accommodation: {
        name: `${destination}精选酒店`,
        area: '市中心/交通便利区域',
        priceRange: '中高档',
        estimatedCost: Math.round(budget / days / travelers * 0.35)
      },
      meals: {
        breakfast: '酒店自助早餐',
        lunch: `${destination}特色餐厅`,
        dinner: '当地推荐美食'
      },
      transportation: {
        type: '地铁/公交/打车',
        estimatedCost: Math.round(budget / days * 0.1)
      },
      estimatedCost: Math.round(budget / days)
    })),
    budgetBreakdown: {
      accommodation: Math.round(budget * 0.35),
      food: Math.round(budget * 0.25),
      transportation: Math.round(budget * 0.20),
      attractions: Math.round(budget * 0.10),
      shopping: Math.round(budget * 0.05),
      reserve: Math.round(budget * 0.05)
    },
    tips: [
      `${destination}最佳旅游季节建议`,
      '建议购买旅游保险',
      '提前下载当地地图和翻译软件',
      '注意保管好贵重物品',
      '尊重当地文化习俗'
    ],
    transportation: {
      toDestination: '建议乘坐飞机或高铁前往',
      local: '市内以地铁和公交为主，部分景点可打车',
      estimatedCost: Math.round(budget * 0.2)
    }
  }
}

/**
 * Voice recognition service using Xunfei API (placeholder)
 */
export async function recognizeVoice(audioBlob) {
  // Placeholder for Xunfei voice recognition
  // In production, implement actual API call to Xunfei
  throw new Error('语音识别功能需要配置科大讯飞 API。请在 .env 文件中配置 VITE_XFYUN_APPID、VITE_XFYUN_API_SECRET、VITE_XFYUN_API_KEY 相关参数。')
}

/**
 * Parse user voice input to extract travel plan details.
 * @param {string} voiceInput - The user's voice input as a string.
 * @returns {Promise<Object>} A structured object with extracted details.
 */
export async function parseVoiceInput(voiceInput) {
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
- 日期处理：如果用户提到月份，默认为当年的该月1号；尽量解析为 YYYY-MM-DD。
- 数字转换：确保预算和人数是数字类型。
- 字段缺失：如果信息不明确或未提供，返回 null。`;

    const userPrompt = `请从以下文本中提取旅行计划信息：\n\n"${voiceInput}"`;

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
  if (QIANWEN_API_KEY && QIANWEN_API_KEY !== 'your_qianwen_api_key') {
    const systemPrompt = `你是一个智能助理，负责从用户的自然语言输入中提取旅行计划的关键信息。

你必须严格按照以下JSON格式返回结果，不要添加任何其他文字说明。如果某个字段在用户输入中没有提及，请将其值设为 null。

{
  "destination": "目的地城市或国家",
  "startDate": "开始日期 (YYYY-MM-DD)",
  "endDate": "结束日期 (YYYY-MM-DD)",
  "budget": 预算金额 (数字),
  "travelers": 同行人数 (数字),
  "preferences": "旅行偏好"
}`;

    const userPrompt = `请从以下文本中提取旅行计划信息：\n\n"${voiceInput}"`;

    try {
      const response = await fetch(QIANWEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${QIANWEN_API_KEY}`,
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
