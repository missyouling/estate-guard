# 部署指南

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
# 服务器
PORT=3000                         # 后端监听端口
NODE_ENV=production               # 'development' 启用美化日志

# 安全密钥 (生产环境必须修改)
JWT_SECRET=<随机32位字符串>
ENCRYPTION_KEY=<随机32字节十六进制>

# 存储
STORAGE_BACKEND=local             # 'local' 或 's3'

# SMTP (QQ邮箱)
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=你的邮箱@qq.com
SMTP_PASS=你的QQ邮箱授权码         # QQ邮箱 → 设置 → 账户 → POP3/SMTP → 生成授权码
MAIL_FROM=你的邮箱@qq.com

# 应用地址 (邮件中使用)
APP_URL=https://你的域名.com

# 高德地图 (可选)
AMAP_API_KEY=你的高德地图API密钥   # 免费申请: https://console.amap.com/
```

**QQ邮箱 SMTP 授权码获取方法：** 登录 QQ邮箱 → 设置 → 账户 → POP3/SMTP服务 → 开启 → 生成授权码。

## Docker Compose 部署

### 第一步：构建前端

```bash
cd web
npm install
npm run build
# 输出目录: ../backend/public/
```

### 第二步：配置环境变量

```bash
cd ..
cp .env.example .env
# 编辑 .env 填入生产环境配置
```

### 第三步：初始化数据库 (可选)

数据库在首次启动时会自动迁移。如需预填充 seed 数据：

```bash
cd backend
npm install
npm run db:seed
# 创建: admin/admin123, 8个分类, 39个配置项
```

### 第四步：启动服务

```bash
docker compose up -d --build
```

### 第五步：验证

```bash
curl http://localhost:3000/api/health
# → {"code":0,"message":"ok","data":{"status":"ok","timestamp":"..."}}
```

## 反向代理 (Nginx/Caddy)

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 你的域名.com;

    ssl_certificate /etc/ssl/certs/你的证书.pem;
    ssl_certificate_key /etc/ssl/private/你的密钥.pem;

    client_max_body_size 250M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

### Caddy 配置示例

```
你的域名.com {
    reverse_proxy localhost:3000
    request_body {
        max_size 250MB
    }
}
```

## 文件存储

### 本地存储 (默认)

文件存储在 `backend/uploads/` 目录下：
```
uploads/
├── images/       # 处理后的 JPEG 图片
├── videos/       # 转码后的 MP4 视频
├── audio/        # 音频文件
├── documents/    # 房产证等证件
├── thumbnails/   # 400x400 缩略图
└── temp/         # 临时上传缓冲区
```

### S3 兼容存储 (MinIO / Cloudflare R2 / AWS S3)

在管理员配置面板中设置（或通过 `PUT /api/admin/config` 接口）：
- `storage_backend` = `s3`
- `s3_endpoint` = S3 服务地址
- `s3_bucket` = 存储桶名称
- `s3_access_key` = 访问密钥
- `s3_secret_key` = 秘密密钥
- `s3_region` = 区域 (或 'auto')

## 数据库维护

数据库文件: `backend/data/db.sqlite`

### 备份

```bash
# 简单的文件复制 (WAL 模式下安全)
cp backend/data/db.sqlite backend/data/db.sqlite.bak.$(date +%Y%m%d)
```

### 重置

```bash
rm backend/data/db.sqlite*
cd backend && npm run db:seed
```

## 常见问题排查

### 端口已被占用
```bash
# 检查 3000 端口占用
netstat -tlnp | grep 3000
# 或在 .env 中修改 PORT
```

### SMTP 连接被拒绝
- 确认 SMTP 密码是 QQ邮箱授权码 (不是登录密码)
- QQ邮箱 SMTP 使用 465 端口 (SSL)

### ffmpeg 未找到
Docker 镜像通过 `apk add ffmpeg` 自动安装。本地开发时需手动安装：
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt install ffmpeg

# Windows
# 从 https://ffmpeg.org/download.html 下载
```

### 跨域 CORS 错误
- 开发模式: Vite 代理自动处理
- 生产环境: 确保反向代理设置正确，或使用同源部署

### 微信小程序无法连接
- 将服务器域名添加到微信白名单:
  - 微信公众平台 → 开发 → 开发管理 → 服务器域名
  - 添加 request 和 uploadFile 合法域名
  - 生产环境必须使用 HTTPS + 已备案域名
