# Web Push 配置

Web Push 需要一对 VAPID 密钥，用来向浏览器的推送服务证明消息来自你的服务器。本文说明怎样生成密钥、配置前后端、验证是否生效。

## 工作方式

1. 浏览器通过 `lib/pushNotification.ts` 请求通知权限，用公钥向推送服务订阅，再把订阅信息发到后端 `/api/push/subscribe`（需登录）
2. 后端 `server/push-service.ts` 用私钥签名，经推送服务把消息发给订阅者
3. 浏览器唤醒 `public/service-worker.js` 弹出通知；点击通知会聚焦或打开 `/dashboard`

推送依赖 Service Worker，而它只在**生产构建**中注册，所以 `npm run dev` 下无法订阅。本地调试请用 `npm run build && npm run start`。

## 1. 生成密钥

```bash
npx web-push generate-vapid-keys
```

输出一个 Public Key（约 88 个字符）和一个 Private Key（约 43 个字符），直接使用原始输出即可。

## 2. 建表

订阅保存在 PostgreSQL 的 `push_subscriptions` 表。这张表不会自动创建，需要执行一次：

```bash
psql "$DATABASE_URL" -f scripts/001-create-push-subscriptions-table.sql
```

## 3. 配置环境变量

公钥要同时配到前端和后端，**两处必须一致**。

**前端**（如 Vercel）

| 名称                       | 值         |
| -------------------------- | ---------- |
| `NEXT_PUBLIC_VAPID_PUBLIC` | Public Key |
| `BACKEND_URL`              | 后端地址   |

`NEXT_PUBLIC_*` 在**构建时**写进前端代码，修改后必须重新构建。

**后端**（如 Render）

| 名称              | 值                                                         |
| ----------------- | ---------------------------------------------------------- |
| `VAPID_PUBLIC`    | 与前端相同的 Public Key                                    |
| `VAPID_PRIVATE`   | Private Key                                                |
| `ADMIN_SET_EMAIL` | 推送要求的联系邮箱；未设置时使用占位的 `admin@example.com` |

缺少 `VAPID_PUBLIC` 或 `VAPID_PRIVATE` 时推送功能自动禁用，其他接口不受影响。`ADMIN_SET_EMAIL` 同时也是管理员引导脚本使用的变量（历史遗留的命名重叠），生产环境建议设置为你自己的邮箱。

`docker-compose.yml` 会把 `VAPID_PUBLIC` / `VAPID_PRIVATE` 传给后端（可选）。

## 4. 重新部署

Vercel 和 Render 保存环境变量后会自动重新部署；自托管需要重新构建前端、重启后端。

## 5. 验证

**后端是否加载了密钥**：看后端启动日志。

- 成功：`✓ Web Push VAPID configured successfully`
- 未配置：`⚠ VAPID_PUBLIC and/or VAPID_PRIVATE environment variables not set`

**能否订阅和收到通知**（需要一个管理员账号，提升方法见 `npm run check-admin` 或部署时设置 `ADMIN_SET_EMAIL`）：

1. 打开生产环境的前端并登录，应看到订阅提示；点击订阅并允许通知
2. 在同一个页面的 DevTools 控制台查看订阅数：

   ```js
   await fetch('/api/proxy/push/stats', { credentials: 'include' }).then((r) => r.json());
   // { success: true, totalSubscriptions: 1, timestamp: "..." }
   ```

   401 / 403 表示没登录或不是管理员。这个接口只返回订阅数，不反映 VAPID 是否配置。

3. 发一条测试通知：

   ```js
   await fetch('/api/push/broadcast', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ title: '测试', body: 'Hello' }),
   }).then((r) => r.json());
   ```

   返回 503 `Push service not configured` 说明后端没有加载到密钥。

## 6. 常见问题

**订阅没有反应**
通常是 Service Worker 没注册：确认运行的是生产构建，站点是 HTTPS（`localhost` 除外）。DevTools → Application → Service Workers 里应能看到 `/service-worker.js` 已激活。

**提示 "Push service not configured"**
确认后端的 `VAPID_PUBLIC`、`VAPID_PRIVATE` 和前端的 `NEXT_PUBLIC_VAPID_PUBLIC` 都已设置、公钥一致、没有多余的空格或换行，并且前端已重新构建。

**iOS 能收到吗**
需要 iOS 16.4+，先把站点"添加到主屏幕"，从主屏幕图标打开后再订阅。

**怎么更换密钥**
重新生成，更新前后端所有变量并重新部署。旧订阅收不到新通知，用户需要用新公钥重新订阅。每个应用应使用独立的密钥对。
