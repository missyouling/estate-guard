# 微信小程序配置指南

## 前置准备

1. **微信小程序 AppID**
   - 在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册
   - 选择"小程序"类型
   - 完成主体认证
   - 在"开发 → 开发设置"中获取 AppID

2. **微信开发者工具**
   - 下载地址: [developers.weixin.qq.com/miniprogram/dev/devtools/download.html](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

3. **服务器域名白名单** (仅生产环境需要)
   - 微信公众平台 → 开发 → 开发管理 → 服务器域名
   - 添加 `request` 合法域名: `https://你的域名.com`
   - 添加 `uploadFile` 合法域名: `https://你的域名.com`
   - 添加 `downloadFile` 合法域名: `https://你的域名.com`
   - 必须使用 HTTPS + 已备案域名

## 项目配置

### 第一步：配置 AppID

编辑 `miniapp/project.config.json`：
```json
{
  "appid": "wx你的APPID",
  ...
}
```

### 第二步：配置 API 地址

编辑 `miniapp/app.ts`：
```typescript
globalData: {
  apiBase: 'https://你的域名.com/api',  // 修改此处
}
```

本地开发时使用 `http://localhost:3000/api` (需在开发者工具中勾选"不校验合法域名")。

### 第三步：Tab Bar 图标

在 `miniapp/assets/` 目录下创建 6 个图标文件：
```
assets/
├── tab-photo.png          # 40x40px, 未选中状态
├── tab-photo-active.png   # 40x40px, 选中状态 (蓝色)
├── tab-upload.png
├── tab-upload-active.png
├── tab-profile.png
└── tab-profile-active.png
```

图标要求：**40x40px PNG**，单个文件 < 40KB。

### 第四步：在开发者工具中打开

1. 打开微信开发者工具
2. 导入项目 → 选择 `miniapp/` 目录
3. 填入 AppID
4. 设置 → 项目设置 → 勾选"不校验合法域名" (开发时)
5. 点击编译

## 隐私权限配置

GPS 定位和相机功能需要在微信公众平台配置隐私接口：

1. **微信公众平台 → 设置 → 用户隐私保护指引 → 隐私接口**
2. 添加隐私接口声明：
   - `getLocation` — 用途: "用于记录拍摄地点的位置信息"
   - `chooseLocation` — 用途: "用于记录拍摄地点的位置信息"
   - `chooseMedia` — 用途: "用于拍摄照片和视频"

## 使用的微信 API

| 微信 API | 用途 |
|------------|-------|
| `wx.chooseMedia` | 拍照 + 相册选图，支持图片视频混合 |
| `wx.chooseImage` | 房产证图片上传 |
| `wx.getLocation` | 获取 GPS 坐标 (wgs84) |
| `wx.uploadFile` | 文件上传 (支持进度回调) |
| `wx.request` | API 网络请求 |
| `wx.setStorageSync` | Token 本地持久化 |
| `wx.showToast` | 轻提示通知 |
| `wx.showLoading` | 加载中状态 |
| `wx.setClipboardData` | 复制链接到剪贴板 |
| `wx.showModal` | 确认对话框 |

## 页面结构

| 页面 | 路径 | 说明 | 需登录 |
|------|------|------|:---:|
| 照片墙 | `pages/index/index` | 平铺/列表/时间轴三种视图 | ✅ |
| 上传 | `pages/upload/upload` | 拍照 + GPS + 分类 + 上传 | ✅ |
| 详情 | `pages/detail/detail` | 单条媒体详情 + 复制/删除 | ✅ |
| 个人中心 | `pages/profile/profile` | 用户信息 + 修改密码 | ✅ |
| 登录 | `pages/login/login` | 登录表单 | - |
| 注册 | `pages/register/register` | 白名单匹配 / 房产证上传 | - |

## Tab 导航栏

```
[照片墙]  [上传]  [我的]
```

## 提审清单

### 提交前必查项

- [ ] AppID 已配置
- [ ] 服务器域名白名单已配置 (HTTPS)
- [ ] API 接口返回正常
- [ ] 所有页面无报错
- [ ] GPS 权限弹窗正常
- [ ] 相机权限弹窗正常
- [ ] Tab 图标正常显示
- [ ] 隐私政策已配置
- [ ] 无硬编码测试数据
- [ ] 无 `console.log` 生产代码

### 审核注意事项

- 小程序类目选择 "工具 - 物业管理"
- 必须包含清晰的隐私政策页面
- 相机和位置权限需提供有意义的用途说明
- 无需登录即可浏览 (如适用)；上传功能需登录后使用

## 常见问题

**出现 "request:fail url not in domain list" 错误**
→ 将域名添加到微信白名单，或在开发者工具中勾选"不校验合法域名"。

**出现 "getLocation:fail authorize" 错误**
→ 用户拒绝了定位权限。可改为手动输入位置。

**Tab 图标不显示**
→ 确认图标为 40x40px PNG 格式。检查 `app.json` 中的路径是否正确。

**大文件上传超时**
→ 增大 `wx.uploadFile` 超时时间。或使用 `wx.showLoading` 配合 `mask: true`。
