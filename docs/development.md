# 开发指南

## 本地开发环境搭建

### 第一步：安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd web
npm install
```

### 第二步：环境配置

```bash
# 复制并编辑环境变量文件
cp .env.example .env
```

开发环境最小化 `.env` 配置：
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-do-not-use-in-production
ENCRYPTION_KEY=dev-key-32-bytes-long-here!!
STORAGE_BACKEND=local
```

### 第三步：初始化数据库

```bash
cd backend
npm run db:seed
```

### 第四步：启动开发服务器

```bash
# 终端 1: 后端
cd backend
npm run dev
# → http://localhost:3000

# 终端 2: 前端
cd web
npm run dev
# → http://localhost:5173
```

前端 Vite 开发服务器会将 `/api` 和 `/files` 请求代理到 `http://localhost:3000`。

## 开发流程

### 添加新的 API 路由

1. 创建 `backend/src/routes/xxx.routes.ts`：
```typescript
import { FastifyInstance } from 'fastify';
import { success, fail } from '../utils/response';

export default async function xxxRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch {
      return reply.status(401).send(fail('未登录'));
    }
  });

  app.get('/api/xxx', async (req) => {
    return success({ data: 'hello' });
  });
}
```

2. 在 `backend/src/index.ts` 中注册：
```typescript
import xxxRoutes from './routes/xxx.routes';
// ...
await app.register(xxxRoutes);
```

### 添加新的服务模块

将服务放在 `backend/src/services/xxx.ts` 中，需要时导入：

```typescript
import { getDb } from '../db';
import { someTable } from '../db/schema';

export async function doSomething() {
  const db = getDb();
  const result = await db.select().from(someTable);
  return result;
}
```

### 添加新的前端页面

1. 创建 `web/src/pages/NewPage.tsx`：
```tsx
export default function NewPage() {
  return <div>新页面</div>;
}
```

2. 在 `web/src/router.tsx` 中添加路由：
```tsx
{ path: 'new-page', element: <NewPage /> },
```

3. 如需显示在侧边栏，编辑 `web/src/components/layout/Sidebar.tsx`。

### 修改数据库结构

1. 编辑 `backend/src/db/schema.ts`
2. 运行迁移：
```bash
cd backend
npm run db:migrate
```
3. 根据需要更新 seed 数据 (`backend/src/db/seed.ts`)

## 测试

### 后端 API 测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 管理员登录
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"admin","password":"admin123"}'

# 使用返回的 token
TOKEN="eyJ..."
curl http://localhost:3000/api/user/me \
  -H "Authorization: Bearer $TOKEN"
```

### 前端测试

Vite 开发服务器支持热更新 (HMR)，修改代码即时生效。通过浏览器 DevTools 的 Network 面板可查看所有 API 调用。

## 核心文件速查表

| 文件 | 用途 |
|------|------|
| `backend/src/db/schema.ts` | 所有数据表定义 |
| `backend/src/db/seed.ts` | 默认数据 (管理员、分类、配置) |
| `backend/src/app.ts` | Fastify 服务器配置 |
| `backend/src/index.ts` | 入口文件 + 路由注册 |
| `backend/src/env.ts` | 环境变量定义 |
| `backend/src/services/crypto.ts` | 加解密工具函数 |
| `backend/src/services/imageProcessor.ts` | Sharp 图片处理 |
| `backend/src/services/videoProcessor.ts` | FFmpeg 视频转码 |
| `backend/src/services/storage.ts` | 存储后端抽象层 |
| `web/src/router.tsx` | 前端路由表 |
| `web/src/lib/api.ts` | Axios 实例 (含认证拦截器) |
| `web/src/stores/authStore.ts` | Zustand 认证状态 (持久化) |
| `miniapp/app.ts` | 小程序入口 + globalData |
| `miniapp/utils/api.ts` | wx.request 封装 |

## 常用命令

```bash
# 后端类型检查
cd backend && npx tsc --noEmit

# 前端类型检查
cd web && npx tsc --noEmit

# 前端生产构建
cd web && npm run build
# → 输出到 backend/public/

# 后端开发启动
cd backend && npm run dev

# 数据库操作
cd backend && npm run db:migrate    # 生成并推送迁移
cd backend && npm run db:seed       # 填充初始数据
cd backend && npm run db:studio     # 打开数据库可视化浏览器

# Docker 构建
docker compose build

# Docker 启动
docker compose up -d

# Docker 日志
docker compose logs -f backend
```

## 调试技巧

### 后端日志
```bash
# 开发模式 (pino-pretty) — 自动格式化
npm run dev

# 生产模式 — JSON 格式日志
docker compose logs -f backend
```

### 数据库可视化
```bash
cd backend
npm run db:studio
# 打开 drizzle-kit studio 浏览 SQLite 数据
```

### 前端调试
- 使用 React DevTools 浏览器扩展
- 浏览器 DevTools Network 面板查看请求
- 控制台中用 `useAuthStore.getState()` 查看 Zustand 状态
