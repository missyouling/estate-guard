# 数据库表结构

## ER 关系图

```
┌──────────┐     ┌──────────┐     ┌───────────┐
│  users   │────<│  media   │>────│ categories│
│  用户表   │     │  媒体表   │     │  分类表    │
│ id 主键   │     │ id 主键   │     └───────────┘
│ role     │     │ user_id 外键
│ name     │     │ category_id 外键
│ id_card  │     │ type      │
│ phone    │     │ url       │     ┌───────────┐
│ room_no  │     │ ...       │     │ approvals │
│ ...      │     └──────────┘     │  审核表    │
└──────────┘                       │           │
     │                             │ reviewed_by 外键
     │     ┌──────────┐            └───────────┘
     ├────<│ whitelist│     ┌──────────┐
     │     │ 白名单表  │     │ configs  │
     │     └──────────┘     │ 配置表    │
     │                      │ key 主键  │
     │     ┌──────────┐     │ value    │
     └────<│audit_logs│     └──────────┘
           │ 操作日志  │
           └──────────┘
```

## 数据表定义

### users — 用户表

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| username | TEXT | UNIQUE | 登录用户名 (业主为 null) |
| role | TEXT | NOT NULL DEFAULT 'owner' | 'admin' \| 'owner' |
| name | TEXT | NOT NULL | 真实姓名 |
| id_card | TEXT | UNIQUE | AES-256-GCM 加密存储 |
| phone | TEXT | UNIQUE | AES-256-GCM 加密存储 |
| email | TEXT | | 可选邮箱 |
| room_number | TEXT | | 房号 |
| password_hash | TEXT | NOT NULL | bcrypt 哈希 (cost=12) |
| status | TEXT | NOT NULL DEFAULT 'active' | 'active' \| 'pending' \| 'disabled' |
| register_method | TEXT | NOT NULL | 'whitelist' \| 'manual_verify' |
| property_deed_url | TEXT | | 房产证图片地址 |
| created_at | TEXT | DEFAULT datetime('now','localtime') | |
| updated_at | TEXT | DEFAULT datetime('now','localtime') | |

### whitelist — 白名单

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| name | TEXT | NOT NULL | 姓名 |
| id_card | TEXT | NOT NULL | AES-256-GCM 加密存储 |
| phone | TEXT | NOT NULL | AES-256-GCM 加密存储 |
| room | TEXT | NOT NULL | 房号 |
| remark | TEXT | | 备注 |
| created_by | INTEGER | 外键 → users.id | 添加人 |
| created_at | TEXT | DEFAULT datetime('now','localtime') | |

唯一约束: `UNIQUE(name, id_card, phone)`

### media — 媒体文件

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| record_no | INTEGER | NOT NULL | 全局递增编号 |
| user_id | INTEGER | NOT NULL 外键 → users.id | 上传人 |
| category_id | INTEGER | 外键 → categories.id | 所属分类 |
| type | TEXT | NOT NULL | 'image' \| 'video' \| 'audio' \| 'document' |
| filename | TEXT | NOT NULL | UUID.ext |
| original_name | TEXT | NOT NULL | 原始文件名 |
| url | TEXT | NOT NULL | 访问路径 |
| thumbnail_url | TEXT | | 缩略图路径 |
| size_bytes | INTEGER | NOT NULL | 文件大小 (字节) |
| mime_type | TEXT | | 文件 MIME 类型 |
| width | INTEGER | | 图片/视频宽度 |
| height | INTEGER | | 图片/视频高度 |
| duration | INTEGER | | 视频/录音时长 (秒) |
| latitude | REAL | | 纬度 |
| longitude | REAL | | 经度 |
| address | TEXT | | 位置描述 |
| watermark_applied | INTEGER | NOT NULL DEFAULT 0 | 0=无 1=已加水印 |
| compressed | INTEGER | NOT NULL DEFAULT 0 | 0=原始 1=已压缩 |
| status | TEXT | NOT NULL DEFAULT 'active' | 'active' \| 'deleted' \| 'failed' |
| remark | TEXT | | 用户备注 |
| uploaded_at | TEXT | DEFAULT datetime('now','localtime') | 上传时间 |

### categories — 分类

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| name | TEXT | NOT NULL | 分类名称 |
| icon | TEXT | | 图标标识符 |
| parent_id | INTEGER | 外键 → categories.id | NULL=一级分类 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 排序权重 |
| created_at | TEXT | DEFAULT datetime('now','localtime') | |

### configs — 系统配置

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| key | TEXT | 主键 | 配置键名 |
| value | TEXT | NOT NULL | JSON 字符串值 |
| updated_by | INTEGER | 外键 → users.id | 修改人 |
| updated_at | TEXT | DEFAULT datetime('now','localtime') | |

### approvals — 审核记录

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| name | TEXT | NOT NULL | 申请人姓名 |
| id_card | TEXT | NOT NULL | AES-256-GCM 加密存储 |
| phone | TEXT | NOT NULL | AES-256-GCM 加密存储 |
| email | TEXT | | 用于通知的邮箱 |
| room_number | TEXT | NOT NULL | 房号 |
| property_deed_url | TEXT | NOT NULL | 房产证图片 |
| status | TEXT | NOT NULL DEFAULT 'pending' | 'pending' \| 'approved' \| 'rejected' |
| verify_code | TEXT | | 6位验证码 |
| code_expires_at | TEXT | | 验证码过期时间 |
| notify_method | TEXT | DEFAULT 'email' | 'email' \| 'sms' |
| reviewed_by | INTEGER | 外键 → users.id | 审核人 |
| reviewed_at | TEXT | | 审核时间 |
| remark | TEXT | | 审核备注 |
| created_at | TEXT | DEFAULT datetime('now','localtime') | |

### audit_logs — 操作日志

| 字段 | 类型 | 约束 | 说明 |
|--------|------|------------|-------------|
| id | INTEGER | 主键 自增 | |
| user_id | INTEGER | 外键 → users.id | 操作人 |
| action | TEXT | NOT NULL | 操作描述 |
| target_type | TEXT | | 'media' \| 'user' \| 'whitelist' \| 'config' 等 |
| target_id | INTEGER | | 被操作记录 ID |
| detail | TEXT | | 操作详情 |
| ip | TEXT | | 客户端 IP |
| created_at | TEXT | DEFAULT datetime('now','localtime') | |

## 索引

| 表 | 索引名 | 字段 |
|-------|------------|---------|
| whitelist | unq | (name, id_card, phone) UNIQUE |
| whitelist | idx_whitelist_room | (room) |
| media | idx_media_user_id | (user_id) |
| media | idx_media_category_id | (category_id) |
| media | idx_media_type | (type) |
| media | idx_media_record_no | (record_no) |
| media | idx_media_uploaded_at | (uploaded_at) |
| approvals | idx_approvals_status | (status) |

## 数据库迁移

Drizzle ORM 通过 `backend/drizzle.config.ts` 管理迁移。系统启动时 `backend/src/db/migrate.ts` 自动执行。

```bash
# 修改 schema 后生成迁移
cd backend
npm run db:migrate

# 实际执行: drizzle-kit generate && drizzle-kit push
```
