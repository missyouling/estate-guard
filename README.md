# 物业服务监督系统

## 项目简介

一套完整的小区物业服务监督平台，连接业主与管理员。业主通过微信小程序（或网页端）拍摄上传物业服务问题的照片/视频证据；管理员维护白名单、审核注册申请、管理分类、配置系统参数、导出证据清单。

## 技术栈

| 层级 | 技术 |
|-------|-----------|
| 后端 | Fastify 5.x + TypeScript + Drizzle ORM |
| 数据库 | SQLite (better-sqlite3 + WAL 模式) |
| 存储 | 本地磁盘 (预留 S3 抽象层) |
| 图片处理 | sharp (缩放 + 水印) |
| 视频处理 | fluent-ffmpeg |
| 邮件 | nodemailer (QQ邮箱 SMTP) |
| PDF 导出 | pdfkit |
| Web 前端 | React 19 + Vite 6 + Tailwind CSS + Zustand |
| 小程序 | 微信原生 (TypeScript + WXML + WXSS) |
| 部署 | Docker Compose |

## 环境要求

- **Node.js** >= 22
- **Docker** + Docker Compose (生产环境部署)
- **ffmpeg** (Docker 镜像中已内置)
- **微信小程序 AppID** (小程序部署时)

## 快速启动 (开发环境)

```bash
# 1. 进入项目目录
cd property-supervision

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env — 设置 JWT_SECRET, ENCRYPTION_KEY, SMTP 凭证

# 3. 安装后端依赖
cd backend
npm install

# 4. 初始化数据库 (创建 admin/admin123 + 默认配置)
npm run db:seed

# 5. 启动后端开发服务器
npm run dev
# → http://localhost:3000

# 6. 安装前端依赖 (新终端)
cd web
npm install
npm run dev
# → http://localhost:5173 (API 自动代理到 :3000)
```

## 生产部署 (Docker)

```bash
# 1. 构建前端
cd web
npm run build
# 构建产物输出到 ../backend/public/

# 2. 配置生产环境变量
cd ..
# 编辑 .env: NODE_ENV=production, JWT_SECRET, SMTP 凭证等

# 3. 启动所有服务
docker compose up -d --build
# → http://localhost:3000
```

## 数据库

SQLite 数据文件位于 `backend/data/db.sqlite`。系统启动时自动执行迁移 (`backend/src/db/migrate.ts`)。

### Seed 数据

运行 `npm run db:seed` 会创建以下数据：

| 实体 | 内容 |
|--------|---------|
| 管理员 | `admin` / `admin123` |
| 分类 | 8 个默认分类 (环境卫生, 公共设施, 安全隐患, ...) |
| 配置 | 39 个系统配置项及默认值 |

### 重置数据库

```bash
rm backend/data/db.sqlite*
npm run db:seed
```

## 项目结构

```
property-supervision/
├── docker-compose.yml        # 容器编排
├── .env.example              # 环境变量模板
├── AGENTS.md                 # Agent 配置 (开发工作流)
├── README.md                 # 项目说明 (本文件)
├── docs/                     # 详细文档
│   ├── architecture.md       # 系统架构
│   ├── schema.md             # 数据库表结构
│   ├── api.md                # API 接口文档
│   ├── deployment.md         # 部署指南
│   ├── miniapp.md            # 小程序配置指南
│   └── development.md        # 开发指南
├── backend/                  # Fastify API 服务器
│   ├── src/
│   │   ├── index.ts          # 入口文件
│   │   ├── app.ts            # Fastify 实例 + 插件
│   │   ├── env.ts            # 环境变量
│   │   ├── db/               # 数据库层
│   │   ├── routes/           # API 路由 (10 个模块)
│   │   ├── services/         # 业务逻辑 (9 个模块)
│   │   ├── middleware/       # 认证 + 上传守卫
│   │   └── utils/            # 响应工具 + 校验器
│   ├── data/                 # SQLite 挂载卷
│   └── uploads/              # 文件存储挂载卷
├── web/                      # React SPA 前端
│   ├── src/pages/            # 6 个页面组件 + 5 个管理页面
│   ├── src/components/       # 布局 + 照片网格/列表/时间轴
│   └── src/stores/           # Zustand 认证状态管理
└── miniapp/                  # 微信小程序
    ├── pages/                # 6 个页面
    ├── components/           # 照片卡片 + 分类选择器
    └── utils/                # API 客户端 + 认证工具
```
