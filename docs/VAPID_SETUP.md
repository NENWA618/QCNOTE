# Web Push 推送通知配置指南

QCNOTE 的 Web Push 功能需要一对 VAPID（Voluntary Application Server Identification）密钥来对推送服务器做身份验证。本文档介绍如何生成密钥、在前后端分别配置，以及部署后如何验证。

## 1. 生成 VAPID 密钥

在本地机器上运行（需要 Node.js）：

```bash
npx web-push generate-vapid-keys
```

输出示例：

```
Public Key: BHl2qWcz2Z4k...（约 88 字符）
Private Key: wM0R7qJ2kN5p...（约 43 字符）
```

VAPID 使用 ECDSA P-256 椭圆曲线，上述长度是标准长度，无需修改。

## 2. 配置前端（Vercel）环境变量

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)，选择 QCNOTE 项目
2. 进入 **Settings → Environment Variables**，添加：

| 名称                       | 值                                                       |
| -------------------------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC` | 上一步生成的 Public Key                                  |
| `BACKEND_URL`              | 独立后端地址，例如 `https://qcnote-backend.onrender.com` |

`NEXT_PUBLIC_VAPID_PUBLIC` 未在 `.env.example` 中列出（该文件目前只覆盖后端的 `VAPID_PUBLIC`/`VAPID_PRIVATE`），部署前端时需要单独添加，否则浏览器端订阅会因缺少公钥而失败（`lib/pushNotification.ts` 读取该变量）。

## 3. 配置后端（Render）环境变量

1. 登录 [Render Dashboard](https://dashboard.render.com)，选择 `QCNOTE-server` 服务
2. 进入 **Environment**，添加：

| 名称            | 值                      |
| --------------- | ----------------------- |
| `VAPID_PUBLIC`  | 与前端相同的 Public Key |
| `VAPID_PRIVATE` | 生成的 Private Key      |

`server/push-service.ts` 在启动时读取这两个变量；只要有一个缺失，推送功能会自动禁用（不影响其他 API），并在日志中打印警告，不会导致服务崩溃。

## 4. 重新部署

Render 和 Vercel 保存环境变量后都会自动触发重新部署，无需手动操作。

## 5. 验证部署

### 后端是否正确加载了 VAPID 配置

`/api/push/stats` 会返回当前订阅数，但该接口需要**已登录的管理员账号**（`server/index.ts` 中用 `requireAdmin` 校验会话 + 角色，不接受任何 token 或查询参数）。验证步骤：

1. 用管理员账号登录前端（角色提升方式见 [ARCHITECTURE.md §8.1](ARCHITECTURE.md#81-管理与用户服务) 的 `check-admin` / `set-admin` 脚本，或部署时的 `ADMIN_SET_EMAIL`）。
2. 保持登录状态，在浏览器中直接打开：

   ```
   https://your-render-backend.onrender.com/api/push/stats
   ```

   （需要前后端共享同一套会话 Cookie/域名配置，跨域部署时改用已登录状态下的 `fetch`，让浏览器带上凭证。）

3. 正常应返回：

   ```json
   {
     "success": true,
     "totalSubscriptions": 0,
     "timestamp": "2026-05-10T..."
   }
   ```

   返回 401/403 通常是没登录或当前账号不是管理员；`{"error": "Push service not configured"}` 一类的提示则说明 `VAPID_PUBLIC` / `VAPID_PRIVATE` 未配置。

### 前端是否能订阅

1. 访问前端应用，应在页面上看到订阅通知的提示（`PushNotificationPrompt.tsx`）
2. 点击订阅，浏览器会请求通知权限
3. 允许后，重复上一步的管理员检查，`totalSubscriptions` 应变为 1

## 6. 常见问题

**重新部署后仍提示 "Push service not configured"？**

- 确认 `VAPID_PUBLIC` 和 `VAPID_PRIVATE`（后端）、`NEXT_PUBLIC_VAPID_PUBLIC`（前端）都已设置，且三者的 Public Key 一致
- 确认值没有多余空格或换行
- 私钥格式应为纯 Base64 字符串（`web-push generate-vapid-keys` 的原始输出，不需要额外包装）

**可以在多个应用间共用同一套 VAPID 密钥吗？**

可以，但不推荐——为安全起见每个应用应使用独立密钥对。

**如何重新生成 VAPID 密钥？**

再次运行 `npx web-push generate-vapid-keys`，然后更新前后端所有相关环境变量。旧密钥签发的订阅仍然有效，但收不到新通知，直到用户用新公钥重新订阅。
