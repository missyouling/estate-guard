# 系统架构

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Docker Compose                              │
│                                                                     │
│  ┌──────────────────┐                                               │
│  │   React SPA      │  ← Vite 构建 → backend/public/               │
│  │   (web/)          │    由 Fastify @fastify/static 托管            │
│  └──────────────────┘                                               │
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │   Fastify 5      │────────▶│   SQLite         │                 │
│  │   (backend/)      │  Drizzle│   (WAL 模式)     │                 │
│  │   :3000           │◀────────│   data/db.sqlite │                 │
│  │                   │         └──────────────────┘                 │
│  │   ┌─────────────┐│                                               │
│  │   │ 路由模块(10) ││         ┌──────────────────┐                 │
│  │   ├─ auth        ││────────▶│  文件存储         │                 │
│  │   ├─ user        ││  本地   │  uploads/        │                 │
│  │   ├─ upload      ││  或S3   │  ├─ images/      │                 │
│  │   ├─ media       ││         │  ├─ videos/      │                 │
│  │   ├─ category    ││         │  ├─ audio/       │                 │
│  │   ├─ whitelist   ││         │  ├─ documents/   │                 │
│  │   ├─ approval    ││         │  └─ thumbnails/  │                 │
│  │   ├─ config      ││         └──────────────────┘                 │
│  │   ├─ export      ││                                               │
│  │   └─ admin       ││         ┌──────────────────┐                 │
│  │   ┌─────────────┐││────────▶│  外部服务         │                 │
│  │   │ 服务层(9)   ││   HTTP   │  ├─ QQ邮箱 SMTP  │                 │
│  │   ├─ crypto      ││         │  ├─ 高德地图       │                 │
│  │   ├─ mailer      ││         │  └─ FFmpeg        │                 │
│  │   ├─ imageProc   ││         └──────────────────┘                 │
│  │   ├─ videoProc   ││                                               │
│  │   ├─ watermark   ││                                               │
│  │   ├─ storage     ││                                               │
│  │   ├─ geocoder    ││                                               │
│  │   ├─ recordNo    ││                                               │
│  │   └─ exportPdf   ││                                               │
│  │   └──────────────┘│                                               │
│  └──────────────────┘                                               │
│                                                                     │
│  ┌──────────────────┐                                               │
│  │  微信小程序        │  ← HTTP/HTTPS → Fastify API                 │
│  │  (miniapp/)        │    wx.request / wx.uploadFile                │
│  └──────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

## 数据流

### 注册流程

```
用户输入 (姓名, 身份证号, 手机号)
       │
       ▼
POST /api/auth/check-whitelist
       │
       ├── 已注册? → 返回错误"已于 YYYY-MM-DD 注册"
       │
       ├── 白名单匹配? → YES → POST /api/auth/register-whitelist
       │                        → 创建用户 (role=owner, method=whitelist)
       │                        → 返回 JWT
       │
       └── 未匹配 → POST /api/auth/register-manual (multipart)
                      → 创建审核记录 (status=pending)
                      → 管理员审核 → 通过 → 生成6位验证码
                      → 发送邮件验证码 → POST /api/auth/verify-code
                      → 创建用户 (method=manual_verify)
```

### 图片上传流程

```
客户端 → POST /api/upload/image (multipart)
       │
       ▼
认证钩子 → jwtVerify()
       │
       ▼
上传路由 → 解析 multipart 字段 + 文件
       │
       ▼
获取下一个记录编号 (MAX + 1)
       │
       ▼
[可选] 通过高德地图 API 逆地理编码
       │
       ▼
水印模板渲染 (NO.{record_no} {datetime} {location})
       │
       ▼
sharp 处理管道:
  1. resize → 最大宽度 1920px
  2. composite → SVG 水印叠加
  3. jpeg → 质量 80
  4. resize(400,400) → 缩略图
       │
       ▼
Storage.put() → files/{uuid}.jpg
       │
       ▼
INSERT INTO media (record_no, url, thumbnail_url, ...)
       │
       ▼
响应 → { record_no, url, thumbnail_url, size }
```

### 视频上传流程

```
客户端 → POST /api/upload/video (multipart)
       │
       ▼
保存原文件 → uploads/videos/{uuid}.mp4
       │
       ▼
INSERT media (status=active, compressed=0)
       │
       ▼
立即返回 200
       │
       ▼
[异步] ffmpeg spawn:
  ffmpeg -i input -vf scale=1920:-2 -b:v 2000k -c:v libx264 -preset fast -c:a aac output.mp4
       │
       ▼
成功 → UPDATE media (compressed=1, url=转码路径)
失败 → UPDATE media (status=failed, remark=错误信息)
       │
       ▼
提取缩略图 → ffmpeg -ss 1 -vframes 1 thumb.jpg
```

## 认证模型

- **JWT** 使用 HS256 算法，7天有效期
- Token 存储在 `Authorization: Bearer <token>` 请求头中
- `@fastify/jwt` 验证并填充 `req.user`，字段为 `{ sub, role, iat, exp }`
- 每个路由插件有独立的 `onRequest` 钩子进行认证
- 管理员路由额外检查 `req.user.role === 'admin'`

## 安全机制

| 事项 | 方案 |
|---------|----------|
| 密码存储 | bcrypt 哈希 (cost=12) |
| 身份证号/手机号 | AES-256-GCM 数据库加密存储 |
| SQL 注入防护 | Drizzle ORM 参数化查询 |
| API 限流 | @fastify/rate-limit (100次/分钟) |
| CORS | @fastify/cors (origin: true) |
| 文件上传 | MIME 类型 + 扩展名校验 |
| 请求体限制 | 220MB (可配置) |
