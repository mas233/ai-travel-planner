# AI 旅行规划师 (AI Travel Planner)

一个基于 AI 的智能旅行规划 Web 应用，帮助用户轻松规划完美旅程。

## 功能特性

- ✈️ **智能行程规划**: 通过 AI 自动生成个性化旅行路线
- 🗺️ **地图导航**: 基于高德地图显示旅行路线和景点
- 💰 **费用管理**: 记录和追踪旅行开销
- 🎤 **语音输入**: 支持语音输入旅行需求（需配置科大讯飞 API）
- ☁️ **云端同步**: 数据存储在 Supabase，多设备同步
- 👤 **用户系统**: 完整的注册登录功能

## 技术栈

- **前端框架**: React + Vite
- **状态管理**: Zustand
- **地图服务**: 高德地图 API
- **数据库**: Supabase (PostgreSQL + Auth)
- **AI 服务**: 通义千问 LLM
- **语音识别**: 科大讯飞 API
- **UI 组件**: Lucide React Icons

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd ai-travel-planner
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的 API 密钥：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Supabase 配置
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 高德地图 API Key
VITE_AMAP_KEY=your_amap_api_key

# 科大讯飞语音 API（可选）
VITE_XUNFEI_APP_ID=your_xunfei_app_id
VITE_XUNFEI_API_SECRET=your_xunfei_api_secret
VITE_XUNFEI_API_KEY=your_xunfei_api_key

# 通义千问 API
VITE_QIANWEN_API_KEY=your_qianwen_api_key
```

### 4. 配置 Supabase 数据库

在 Supabase SQL 编辑器中运行以下 SQL（在 `src/lib/supabase.js` 文件的注释中有完整 SQL）:

```sql
-- 创建旅行计划表
CREATE TABLE IF NOT EXISTS travel_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget DECIMAL(10, 2),
  travelers INTEGER,
  preferences TEXT,
  itinerary JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建开销记录表
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID REFERENCES travel_plans(id) ON DELETE CASCADE,
  category VARCHAR(100),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用行级安全
ALTER TABLE travel_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- 创建安全策略（详见 src/lib/supabase.js）
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`

### 6. 构建生产版本

```bash
npm run build
npm run preview
```

## API 配置指南

### Supabase

1. 访问 [supabase.com](https://supabase.com)
2. 创建新项目
3. 在 Settings > API 中获取 URL 和 anon key

### 高德地图

1. 访问 [高德开放平台](https://lbs.amap.com/)
2. 注册并创建应用
3. 申请 Web 端 JavaScript API 密钥

### 通义千问

1. 访问 [阿里云通义千问](https://dashscope.aliyun.com/)
2. 开通服务并获取 API Key

### 科大讯飞（可选）

1. 访问 [讯飞开放平台](https://www.xfyun.cn/)
2. 创建语音识别应用
3. 获取 APP ID、API Secret 和 API Key

## 项目结构

```
ai-travel-planner/
├── src/
│   ├── components/         # React 组件
│   │   ├── MapView.jsx    # 地图展示组件
│   │   ├── PlanSelector.jsx
│   │   ├── CreatePlanModal.jsx
│   │   └── PlanDetails.jsx
│   ├── pages/             # 页面组件
│   │   ├── LoginPage.jsx  # 登录/注册页
│   │   └── MainPage.jsx   # 主页面
│   ├── store/             # Zustand 状态管理
│   │   ├── authStore.js   # 认证状态
│   │   └── travelStore.js # 旅行计划状态
│   ├── services/          # 外部服务
│   │   └── aiService.js   # AI 生成服务
│   ├── lib/
│   │   └── supabase.js    # Supabase 客户端
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

## 功能说明

### 1. 用户认证

- 邮箱注册/登录
- Supabase Auth 提供的安全认证
- 会话持久化

### 2. 创建旅行计划

- 填写目的地、日期、预算、人数、偏好
- 支持语音输入（需配置 API）
- AI 自动生成详细行程

### 3. 查看计划

- 下拉列表选择已创建的计划
- 地图显示景点和路线
- 详细行程安排展示

### 4. 费用管理

- 记录旅行开销
- 预算追踪
- 分类统计

## 注意事项

1. **地图功能**: 需要有效的高德地图 API Key
2. **AI 功能**: 当前使用 mock 数据，需接入通义千问 API
3. **语音识别**: 需要配置科大讯飞 API 才能使用
4. **数据安全**: 已配置 Supabase RLS 确保数据安全

## 开发计划

- [ ] 接入真实的通义千问 API
- [ ] 实现科大讯飞语音识别
- [ ] 添加更多地图交互功能
- [ ] 支持导出行程为 PDF
- [ ] 添加社交分享功能
- [ ] 多语言支持

## 许可证

MIT License

## 作者

AI Travel Team

---

**注意**: 这是一个演示项目，部分 AI 功能使用 mock 数据。在生产环境中需要配置真实的 API 密钥。