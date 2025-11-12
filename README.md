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

创建并编辑 `.env` 文件（所有参数默认可留空；以 `VITE_` 开头的变量在构建时注入）：

```env
# 地图相关（当前组件使用高德 AMap JSAPI）
VITE_AMAP_KEY=
VITE_AMAP_SECURE_KEY=
VITE_AMAP_SERVICE_HOST=
VITE_AMAP_SERVER_KEY=
VITE_AMAP_USE_REST=

# Supabase 配置
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# AI / 语音服务
VITE_QIANWEN_API_KEY=
VITE_XUNFEI_APP_ID=
VITE_XUNFEI_SECRET_KEY=
VITE_XUNFEI_HTTP_API_KEY=
VITE_XUNFEI_MODEL=
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

[mas233](https://mas233.github.io)

---

**注意**: 这是一个演示项目，部分 AI 功能使用 mock 数据。在生产环境中需要配置真实的 API 密钥。
## 环境变量说明（VITE_*）

- `VITE_AMAP_KEY`: 高德 JSAPI Key（浏览器端 JSAPI 加载）。
- `VITE_AMAP_SECURE_KEY`: 高德 JSAPI 安全密钥（明文 securityJsCode 方案）。
- `VITE_AMAP_SERVICE_HOST`: 高德 JSAPI 安全代理根路径（推荐代理方案）。
- `VITE_AMAP_SERVER_KEY`: 高德 Web 服务 REST Key（服务端用途）。
- `VITE_AMAP_USE_REST`: 是否优先使用高德 REST 服务（布尔/字符串）。
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: Supabase 项目 URL 与 anon key。
- `VITE_QIANWEN_API_KEY`: 通义千问 API Key。
- `VITE_XUNFEI_APP_ID`, `VITE_XUNFEI_SECRET_KEY`, `VITE_XUNFEI_HTTP_API_KEY`, `VITE_XUNFEI_MODEL`: 讯飞语音/HTTP 参数。

提示：Vite 以构建时注入 `VITE_*` 变量为准，因此容器或本地修改这些值后需要重新构建。

## 使用 Docker 运行

本项目提供多阶段 Dockerfile，将前端构建产物打包为单个可运行镜像，默认通过 Nginx 提供服务。

### 构建镜像（支持在构建时设置 .env 参数）

```bash
docker build -t ai-travel-planner \
  --build-arg VITE_AMAP_KEY= \
  --build-arg VITE_AMAP_SECURE_KEY= \
  --build-arg VITE_AMAP_SERVICE_HOST= \
  --build-arg VITE_AMAP_SERVER_KEY= \
  --build-arg VITE_AMAP_USE_REST= \
  --build-arg VITE_SUPABASE_URL= \
  --build-arg VITE_SUPABASE_ANON_KEY= \
  --build-arg VITE_QIANWEN_API_KEY= \
  --build-arg VITE_XUNFEI_APP_ID= \
  --build-arg VITE_XUNFEI_SECRET_KEY= \
  --build-arg VITE_XUNFEI_HTTP_API_KEY= \
  --build-arg VITE_XUNFEI_MODEL= \
  .
```

说明：以上 `--build-arg` 均为可选，未设置时默认注入为空字符串。需要在构建时设置的环境参数都以 `VITE_` 开头。

### 运行镜像

```bash
docker run --rm -p 8080:80 ai-travel-planner
```

启动后访问 `http://localhost:8080`。

## 本地运行

1. 安装 Node.js 18+
2. 创建并填写 `.env`（所有变量可留空）；示例见上文
3. 安装依赖并启动开发服务器：

```bash
npm ci
npm run dev
```

访问 `http://localhost:3000`。

## 重要说明

- 前端读取的环境变量以 `VITE_*` 前缀为准，且在构建时注入。如果需要在 Docker 中变更这些值，需要重新构建镜像。
- 地图功能当前使用高德 AMap JSAPI。请配置 `VITE_AMAP_*` 变量并在开放平台设置域名白名单。
