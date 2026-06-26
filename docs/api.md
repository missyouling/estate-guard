# API 接口文档

基础地址: `http://localhost:3000/api`

所有响应遵循以下格式：
```json
{ "code": 0, "message": "ok", "data": { ... } }
```
- `code: 0` = 成功
- `code: -1` = 业务错误
- HTTP 401 = 未登录
- HTTP 403 = 无权限 (角色校验失败)

认证方式: 请求头 `Authorization: Bearer <jwt_token>`。

---

## 公开接口

### POST /auth/login
支持用户名、身份证号、手机号、姓名 + 密码登录。
```
请求体: { account: string, password: string }
返回: { token: string, user: { id, role, name, phone, ... } }
```

### POST /auth/check-whitelist
验证身份信息是否在物业白名单中。
```
请求体: { name: string, id_card: string, phone: string }
返回: { registered?: true, registered_at?: string }      // 已注册
      { matched?: true, room?: string }                   // 白名单匹配
      { require_manual?: true }                            // 需人工审核
```

### POST /auth/register-whitelist
白名单匹配成功后立即注册。
```
请求体: { name, id_card, phone, password }
返回: { token, user }
```

### POST /auth/register-manual
未匹配白名单时，提交房产证走人工审核通道。
```
Content-Type: multipart/form-data
字段: name, id_card, phone, email?, room_number, remark?
文件:  property_deed (图片)
返回: { code: 0, message: "申请已提交" }
```

### POST /auth/verify-code
使用邮件收到的验证码完成注册。
```
请求体: { id_card, verify_code, password }
返回: { code: 0, message: "注册成功" }
```

### POST /auth/refresh
刷新 JWT Token。
```
请求头: Authorization: Bearer <token>
返回: { token: string }
```

---

## 需登录接口 (业主 + 管理员)

### GET /user/me
获取当前登录用户信息。
```
返回: { id, role, name, phone, email, room_number, status, ... }
```

### PATCH /user/me
修改密码。
```
请求体: { old_password: string, new_password: string }
返回: { code: 0, message: "密码修改成功" }
```

### GET /user/stats
获取上传统计数据。
```
返回: { total: number, images: number, videos: number, audio: number }
```

### GET /media
分页获取媒体列表。管理员可查看全部；业主仅查看自己的。
```
查询参数: page=1, limit=20, type?, category_id?, sort? (newest|oldest), keyword?
返回: { items: Media[], total: number, page: number, limit: number }
```

### GET /media/wall
照片墙专用接口，支持三种视图模式。
```
查询参数: view=grid|list|timeline, page=1, limit=50, category_id?, date_from?, date_to?

平铺/列表返回: { items: Media[], total: number }
时间轴返回:    { timeline: [{ date: string, items: Media[] }], total: number }
```

### GET /media/:id
获取单条媒体记录的完整信息。
```
返回: 媒体对象 (含全部元数据)
```

### DELETE /media/:id
软删除 (设置 status='deleted')。仅本人或管理员可操作。

### PATCH /media/:id
修改所属分类或备注。
```
请求体: { category_id?: number, remark?: string }
```

### GET /category
获取全部分类 (按 sort_order 排序)。
```
返回: Category[]
```

### GET /upload/config
获取客户端上传限制配置。
```
返回: { maxImageSizeMb, maxVideoSizeMb, maxAudioSizeMb, maxCountPerBatch, allowedImageTypes[], ... }
```

### POST /upload/image
上传图片 (自动压缩 + 水印处理)。
```
Content-Type: multipart/form-data
文件:  file (图片)
字段:  category_id?, latitude?, longitude?, address?, remark?
返回:  { record_no, url, thumbnail_url, width, height, size_bytes }
```

### POST /upload/video
上传视频 (后台异步转码)。
```
Content-Type: multipart/form-data
文件:  file (视频)
字段:  category_id?, latitude?, longitude?, address?, remark?
返回:  { record_no, url, size_bytes }
```

### POST /upload/audio
上传录音文件。
```
Content-Type: multipart/form-data
文件:  file (音频)
字段:  category_id?, latitude?, longitude?, address?, remark?
```

### POST /upload/document
上传证件文件 (房产证等)。
```
Content-Type: multipart/form-data
文件:  file (文档)
字段:  category_id?, remark?
```

---

## 管理员接口 (需 `role=admin`)

### GET /admin/dashboard
仪表盘统计数据。
```
返回: { totalUsers, totalMedia, todayUploads, pendingApprovals }
```

### GET /admin/users
查看所有用户 (分页)。
```
查询参数: page=1, limit=50, status?, keyword?
返回: { items: User[], total, page, limit }
```

### PATCH /admin/users/:id
修改用户状态、角色或重置密码。
```
请求体: { status?, role?, password? }
```

### GET /admin/whitelist
查看白名单 (分页 + 搜索)。
```
查询参数: page=1, limit=50, keyword?
返回: { items: WhitelistEntry[], total, page, limit }
```

### POST /admin/whitelist
添加单条白名单记录。
```
请求体: { name, id_card, phone, room, remark? }
返回: { code: 0, message: "已添加" }
```

### POST /admin/whitelist/import
批量导入 CSV 文件。
```
Content-Type: multipart/form-data
文件:  file (.csv, 列名: 姓名,身份证号,手机号,房号,备注)
返回:  { imported: number }
```

### PATCH /admin/whitelist/:id
修改白名单记录。

### DELETE /admin/whitelist/:id
删除白名单记录。

### GET /admin/approvals
查看审核记录。
```
查询参数: page=1, limit=20, status=pending|approved|rejected
返回: { items: Approval[], total, page, limit }
```

### PATCH /admin/approvals/:id
通过或拒绝审核申请。
```
请求体: { action: "approve"|"reject", remark?: string }
```
- 通过: 生成6位验证码，发送邮件通知 (如有邮箱)
- 拒绝: 发送拒绝通知邮件 (如有邮箱)

### POST /admin/category
新增分类。
```
请求体: { name, icon?, parent_id?, sort_order? }
```

### PUT /admin/category/:id
修改分类。

### DELETE /admin/category/:id
删除分类。

### GET /admin/config
获取全部系统配置。
```
返回: { key: string, value: string }[]
```

### PUT /admin/config
批量更新配置。
```
请求体: { configs: { key: value, ... } }
```

### POST /admin/export/evidence
导出证据清单 PDF。
```
请求体: { category_id?, date_from?, date_to? }
返回: application/pdf (下载文件)
```

### GET /admin/media
管理员媒体列表 (可跨用户查询)。
```
查询参数: page=1, limit=20, user_id?, type?, status?
```
