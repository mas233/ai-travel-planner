# AI 旅行规划师 (AI Travel Planner)

一个基于 AI 的智能旅行规划 Web 应用，完整支持行程生成、地图与导航、费用记录，以及运行时环境配置。

## 功能特性

- ✈️ 智能行程规划：通义千问生成结构化 JSON 行程，包含每日景点/餐食/住宿/交通与预算拆分。
- 🗺️ 地图与导航：高德 AMap JSAPI v2.0，自动补齐坐标并支持“导航至下一地点”。
- 💰 费用记录与预算：新增开销记录、显示总预算/已花费/剩余；行程内含 AI 预算拆分可视化。
- 🎤 语音与智能填表：讯飞长语音转写（RAASR），可选 Spark HTTP 提取表单字段；也可手动输入文本并智能解析。
- ☁️ 云端同步：使用 Supabase 存储旅行计划与开销，登录后自动拉取个人数据。
- ⚙️ 运行时环境配置：左侧齿轮打开设置面板，允许在浏览器中覆盖构建时的 `VITE_*` 值（保存在 `localStorage`）。

## 技术栈

- 前端：React + Vite
- 状态管理：Zustand
- UI：MUI（Modal/Alert/Button 等）+ Lucide React 图标
- 地图：高德 AMap JSAPI v2.0（`Geocoder`、`Driving` 插件）
- AI：百炼大模型 DashScope；可选 讯飞 Spark HTTP（OpenAI 兼容）
- 语音：讯飞 RAASR 标准版（开发环境已通过 Vite 代理避免 CORS）
- 数据库：Supabase（PostgreSQL + Auth）

## 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/mas233/ai-travel-planner.git
cd ai-travel-planner
npm install
```

### 2. 配置环境变量（.env）

以 `VITE_` 开头的变量会在构建时注入。未配置的必需项会触发应用内的“环境变量设置”弹窗。

```env
# 地图（必需）
VITE_AMAP_KEY=
# JSAPI 安全方案（二选一，推荐其一）：
VITE_AMAP_SECURE_KEY=    # 直接填写 securityJsCode（开发期便捷）
# 或使用代理服务主机（index.html 会设置 _AMapSecurityConfig.serviceHost）
VITE_AMAP_SERVICE_HOST=

# Supabase（必需）
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# AI / 语音（功能可选）
VITE_QIANWEN_API_KEY=
VITE_XUNFEI_APP_ID=
VITE_XUNFEI_SECRET_KEY=

# 进阶（完全可选，默认不需要）
VITE_XUNFEI_HTTP_API_KEY=   # 语音文本结构化提取优先走 Spark HTTP
VITE_XUNFEI_MODEL=          # 例如 General-Spark-Standard（未设则使用默认）
VITE_AMAP_SERVER_KEY=       # AMap REST 地理编码服务密钥（可作为 JSAPI 回退或优先）
VITE_AMAP_USE_REST=true     # true 时优先使用 REST；默认 false
```

说明：设置面板只显示构建时存在的 `VITE_*` 键。进阶可选项如未在 `.env` 中声明，需通过构建时注入或手动在浏览器 `localStorage` 写入 `env.<KEY>`。

### 3. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`。首次启动如缺少关键参数，会自动弹出“环境变量设置”面板。

## Supabase 初始化（使用 travel_planner schema）

在 SQL 编辑器运行以下脚本：

```sql
-- 1) 创建独立业务 schema
create schema if not exists travel_planner;
set search_path to travel_planner;

-- 2) 旅行计划表
create table if not exists travel_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title varchar(255) not null,
  destination varchar(255) not null,
  start_date date not null,
  end_date date not null,
  budget numeric(10,2),
  travelers integer,
  preferences text,
  itinerary jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3) 开销记录表
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references travel_plans(id) on delete cascade,
  category varchar(100),
  amount numeric(10,2) not null,
  description text,
  date date not null,
  created_at timestamptz default now()
);

-- 4) 启用 RLS
alter table travel_plans enable row level security;
alter table expenses enable row level security;

-- 5) 基本策略：仅允许用户访问/写入自己的数据
create policy if not exists "plans_select_own" on travel_plans
  for select using (auth.uid() = user_id);
create policy if not exists "plans_insert_own" on travel_plans
  for insert with check (auth.uid() = user_id);
create policy if not exists "plans_update_own" on travel_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "expenses_select_own" on expenses
  for select using (
    exists(select 1 from travel_plans p where p.id = expenses.plan_id and p.user_id = auth.uid())
  );
create policy if not exists "expenses_insert_own" on expenses
  for insert with check (
    exists(select 1 from travel_plans p where p.id = expenses.plan_id and p.user_id = auth.uid())
  );
create policy if not exists "expenses_update_own" on expenses
  for update using (
    exists(select 1 from travel_plans p where p.id = expenses.plan_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from travel_plans p where p.id = expenses.plan_id and p.user_id = auth.uid())
  );
```

> 代码中通过 `supabase.schema('travel_planner')` 访问以上表，请确保已创建该 schema。

## 运行与构建

- 开发：`npm run dev`（端口 `3000`）。Vite 代理已配置 `/xf/upload` 与 `/xf/getResult` 到讯飞 RAASR。
- 生产构建：`npm run build` 后 `npm run preview` 本地预览。
- 运行时覆盖：齿轮图标打开设置面板，保存后刷新使 AMap/Supabase 配置生效；值持久化于浏览器 `localStorage`。

## 使用 Docker

本项目使用多阶段 Dockerfile，最终输出单镜像（Nginx 静态服务）。构建时通过 `--build-arg` 注入 `VITE_*`。

项目的`travel-planner-image.tar`文件为MacOS/arm平台打包好的镜像，可直接在arm架构的Mac上运行。

```bash
docker build -t ai-travel-planner \
  --build-arg VITE_AMAP_KEY= \
  --build-arg VITE_AMAP_SECURE_KEY= \
  --build-arg VITE_SUPABASE_URL= \
  --build-arg VITE_SUPABASE_ANON_KEY= \
  --build-arg VITE_QIANWEN_API_KEY= \
  --build-arg VITE_XUNFEI_APP_ID= \
  --build-arg VITE_XUNFEI_SECRET_KEY= \
  .

docker run --rm -p 3000:3000 ai-travel-planner
```

说明：构建产物中的 `VITE_*` 固化于静态资源。如需变更，建议使用应用内设置面板进行运行时覆盖（不修改已构建资源）；或重新构建镜像。

## API 配置指引

- Supabase：创建项目后在 Settings > API 获取 `URL` 与 `anon key`。
- 高德地图：申请 JSAPI Key 并设置域名白名单；可选 `securityJsCode` 或代理服务主机。
- 通义千问：开通 DashScope 并获取 API Key。
- 讯飞（可选）：RAASR 用 `VITE_XUNFEI_APP_ID` 与 `VITE_XUNFEI_SECRET_KEY`；Spark HTTP 需 `VITE_XUNFEI_HTTP_API_KEY` 与可选 `VITE_XUNFEI_MODEL`。

## 注意事项

- 缺少 `VITE_AMAP_KEY` 时，页面会提示“缺少 JSAPI Key”，并自动弹出设置面板。
- 未配置 Supabase URL/anon key 时，无法登录；应用会在登录前提示配置。
- 未配置 `VITE_QIANWEN_API_KEY` 时，行程生成不可用；语音填表将回退到 Qianwen 或使用 mock 结果。
- 运行时覆盖不改变构建产物，仅在当前浏览器生效；更换设备或清理浏览器数据后需重新设置。

## 项目结构

```
ai-travel-planner/
├── src/
│   ├── components/         # MapView / PlanSelector / CreatePlanModal / PlanDetails / EnvSettingsModal
│   ├── pages/              # LoginPage / MainPage
│   ├── store/              # authStore / travelStore
│   ├── services/           # aiService / amapService / voiceService
│   ├── lib/                # supabase 客户端
│   ├── utils/              # env.js（运行时覆盖与占位符）
│   └── ...
├── index.html              # 加载 AMap JSAPI，触发 amap:loaded 与缺失提示事件
├── vite.config.js          # 开发代理与端口
├── Dockerfile              # 多阶段构建，最终 Nginx 镜像
└── README.md
```

## 许可证与作者

- 许可证：MIT
- 作者：[mas233](https://mas233.github.io)
