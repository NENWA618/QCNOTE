# 推送通知（Web Push）配置

QCNOTE 的管理员可以在 `/admin` 的“推送通知”里，向所有已订阅的用户广播官方消息。推送需要一对 **VAPID 密钥**，用来向浏览器的推送服务证明消息确实来自你的服务器。

本文说明怎样生成密钥、配置前后端，以及怎样确认推送已经生效。

## 工作方式

```
浏览器                                   后端 server/                 推送服务（浏览器厂商）
lib/pushNotification.ts
  请求通知权限，用公钥订阅 ──────────────────────────────────────────▶
  把订阅信息发到 /api/push/subscribe ──▶ 存进 push_subscriptions 表
                                        管理员广播时用私钥签名 ──────▶ 转发给订阅者
public/service-worker.js ◀──────────────────────────────────────────── 唤醒并弹出通知
  点击通知：聚焦或打开 /dashboard
```

- 签名和发送由后端的 `server/push-service.ts` 负责（基于 `web-push`）。
- 订阅需要登录。用户可以在首次出现的订阅提示里订阅，也可以随时在“个人资料”里订阅或取消。
- 订阅属于**浏览器**而不是账号：换一台设备需要重新订阅。
- 推送依赖 Service Worker，而它只在**生产构建**中注册，所以 `npm run dev` 下无法订阅。本地调试请用 `npm run build && npm run start`。

## 1. 生成密钥

```bash
npx web-push generate-vapid-keys
```

会输出一个 Public Key（约 88 个字符）和一个 Private Key（约 43 个字符），直接使用原始输出即可。每个应用应使用独立的密钥对。

## 2. 配置环境变量

公钥要同时配到前端和后端，**两边必须完全一致**。

| 位置 | 变量                       | 值                                                             |
| ---- | -------------------------- | -------------------------------------------------------------- |
| 前端 | `NEXT_PUBLIC_VAPID_PUBLIC` | Public Key                                                     |
| 前端 | `BACKEND_URL`              | 后端地址                                                       |
| 后端 | `VAPID_PUBLIC`             | 与前端相同的 Public Key                                        |
| 后端 | `VAPID_PRIVATE`            | Private Key                                                    |
| 后端 | `ADMIN_SET_EMAIL`          | 推送协议要求的联系邮箱；未设置时使用占位的 `admin@example.com` |

- `NEXT_PUBLIC_*` 在**构建时**写进前端代码，修改后必须重新构建前端。
- 后端缺少 `VAPID_PUBLIC` 或 `VAPID_PRIVATE`（只设了一个也算）时，推送功能自动禁用，其他接口不受影响。
- `ADMIN_SET_EMAIL` 同时也是管理员引导脚本使用的变量（历史遗留的命名重叠），生产环境建议设为你自己的邮箱。
- `docker-compose.yml` 会把 `VAPID_PUBLIC` / `VAPID_PRIVATE` 传给后端（可选）。

## 3. 数据库

订阅保存在 PostgreSQL 的 `push_subscriptions` 表，后端启动时会自动创建。如需手动建表：

```bash
psql "$DATABASE_URL" -f scripts/001-create-push-subscriptions-table.sql
```

## 4. 重新部署

Vercel 和 Render 保存环境变量后会自动重新部署；自托管需要重新构建前端、重启后端。

## 5. 验证

**后端是否加载了密钥**：看后端启动日志。

- 成功：`✓ Web Push VAPID configured successfully`
- 未配置：`⚠ VAPID_PUBLIC and/or VAPID_PRIVATE environment variables not set`

**能否订阅并收到通知**（需要一个管理员账号，设置方法见 [DEPLOYMENT.md](DEPLOYMENT.md#管理员)）：

1. 用生产环境的前端登录，在订阅提示或“个人资料 → 推送通知”里点“订阅通知”，并允许浏览器通知。
2. 打开 `/admin` → “推送通知”，填写标题和内容，点“发送通知”。结果会显示成功和失败的数量；没有任何订阅时会提示“当前没有任何订阅，通知未发送”。
3. 也可以在已登录的页面里用 DevTools 控制台查询订阅数：

   ```js
   await fetch('/api/proxy/push/stats', { credentials: 'include' }).then((r) => r.json());
   // { success: true, totalSubscriptions: 1, timestamp: "..." }
   ```

   返回 401 / 403 表示没登录或不是管理员。这个接口只返回订阅数，不反映密钥是否配置正确。

## 6. 常见问题

**点了订阅没有反应**
通常是 Service Worker 没有注册：确认运行的是生产构建，站点是 HTTPS（`localhost` 除外）。DevTools → Application → Service Workers 里应能看到 `/service-worker.js` 处于激活状态。

**发送时提示 “Push service not configured”**
后端没有加载到密钥。确认后端的 `VAPID_PUBLIC`、`VAPID_PRIVATE` 和前端的 `NEXT_PUBLIC_VAPID_PUBLIC` 都已设置、公钥一致、没有多余的空格或换行，并且前端已经重新构建。

**“个人资料”里显示浏览器已禁止通知**
用户之前拒绝过通知权限。需要在浏览器地址栏左侧的网站设置里允许“通知”，刷新页面后再订阅。

**iOS 能收到吗**
需要 iOS 16.4 及以上，先把站点“添加到主屏幕”，从主屏幕图标打开后再订阅。

**怎么更换密钥**
重新生成，更新前后端所有相关变量并重新部署。旧的订阅收不到新密钥签名的通知，用户需要重新订阅。
