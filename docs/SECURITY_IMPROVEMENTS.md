# 安全配置说明

QCNOTE 在密钥管理、传输、Cookie、CSRF、CSP 和 Service Worker 方面的配置及原因，供部署和安全审计参考。数据加密的完整设计见 [ARCHITECTURE.md 第 3、4 节](ARCHITECTURE.md#3-notestorage笔记的读写)。

## 1. 服务端密钥

| 变量                    | 用途                                                   | 缺失时                                                       | 泄露或丢失的后果                                                                                    |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `VAULT_MASTER_KEY`      | 加密 `user_vault_keys` 里每个用户的 KEK（AES-256-GCM） | 生产环境后端**拒绝启动**；开发环境用固定的开发密钥并打印警告 | **丢失或更换**：所有用户的 KEK 解不开，已有设备上的笔记无法解锁。**泄露**：配合数据库可解出所有 KEK |
| `NEXTAUTH_SECRET`       | 签名 NextAuth 会话；后端用它解析会话 Cookie            | 生产环境应用拒绝启动                                         | 可伪造任意用户的登录会话                                                                            |
| `DEVICE_SESSION_SECRET` | 签名设备会话令牌（HS256，12 小时）                     | 回退到 `NEXTAUTH_SECRET`；两者都缺失时生产环境报错           | 可为已知指纹伪造设备会话（仍需有效的登录会话）                                                      |

- `VAULT_MASTER_KEY` 必须是 base64 编码的 32 字节（`openssl rand -base64 32`），长度不对时启动即失败。
- 目前**没有** `VAULT_MASTER_KEY` 的轮换机制。请把它与数据库备份分开、同样可靠地备份。
- 三个变量应各自独立生成。

### 能解密笔记需要什么

登录用户的笔记由浏览器本地的 DEK 加密，DEK 用该用户的 KEK 包裹后存在本地，KEK 由服务端用 `VAULT_MASTER_KEY` 加密保管。

| 攻击者拿到                                  | 能否读到笔记                                         |
| ------------------------------------------- | ---------------------------------------------------- |
| 服务器数据库（含或不含 `VAULT_MASTER_KEY`） | 否：服务器上没有笔记和 DEK                           |
| 某台设备的浏览器存储                        | 否：缺 KEK                                           |
| 浏览器存储 + 服务端密钥和数据库             | 是                                                   |
| 浏览器存储 + 该用户的登录会话               | 是：登录后可"重置设备"把自己登记为新设备，再换取 KEK |

所以这是**服务端托管密钥**，不是端到端加密。设备绑定只能挡住"把设备会话令牌单独拿到另一台设备上用"；指纹由客户端上报、并非秘密，能读到令牌的一方（例如页面里的 XSS）通常也能算出同一指纹，而持有登录会话就能重置设备。它不能替代账号本身的安全。

访客模式的笔记是明文。登录用户的同步凭据、冲突记录、同步基线、embedding 缓存和 AI 设置都用笔记库密钥 seal；设备未解锁时这些数据既不能读也不能写，代码不会退回到较弱的加密。

## 2. HSTS

配置在 `next.config.mjs`：

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

| 参数                | 值         | 说明                       |
| ------------------- | ---------- | -------------------------- |
| `max-age`           | `63072000` | 2 年                       |
| `includeSubDomains` | 开启       | 覆盖所有子域名             |
| `preload`           | 开启       | 允许加入浏览器的预加载列表 |

加入预加载列表：确认 HTTP 会重定向到 HTTPS、所有子域名都支持 HTTPS，然后在 [hstspreload.org](https://hstspreload.org/) 提交，可用 `curl -I https://www.qcnote.com` 检查响应头。加入后需要数月才能移除；HTTPS 一旦配置出错，用户会完全无法访问。

## 3. Cookie

配置在 `pages/api/auth/authConfig.ts`。NextAuth 的三个 Cookie 都是 `httpOnly`、`sameSite: 'lax'`，生产环境加 `secure`：

| Cookie         | 用途                   | 有效期  | 说明                                                                               |
| -------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------- |
| `sessionToken` | 登录会话               | 30 天   | 不用 `strict`：OAuth 回调和外链进入是跨站顶层跳转，`strict` 会让首个请求读不到会话 |
| `callbackUrl`  | OAuth 登录后的回跳地址 | 15 分钟 |                                                                                    |
| `csrfToken`    | NextAuth 的 CSRF 令牌  | 会话级  |                                                                                    |

其余 Cookie（如 PKCE）使用 NextAuth 默认值。

生产环境下 Cookie 名使用浏览器强制校验的前缀（`lib/authCookies.ts`，前端与后端共用）：

| Cookie         | 生产环境名称                       | 前缀的约束                                                   |
| -------------- | ---------------------------------- | ------------------------------------------------------------ |
| `sessionToken` | `__Secure-next-auth.session-token` | 必须带 `Secure` 且经 HTTPS 设置                              |
| `callbackUrl`  | `__Secure-next-auth.callback-url`  | 同上                                                         |
| `csrfToken`    | `__Host-next-auth.csrf-token`      | 另外不能带 `Domain`、必须 `Path=/`，其他子域名无法写入或覆盖 |

开发环境（`http://localhost`）不加前缀，否则浏览器会拒收。

设备会话令牌不是 Cookie，存在 `sessionStorage` 中，关闭浏览器即失效。

## 4. CSRF

`lib/csrfProtection.ts` 提供两层：

- **同源校验（已接入）**：所有会修改状态的 Next API 路由都用 `withCsrfProtection` 包装，包括 `/api/proxy/*`、`/api/admin/set-admin`、`/api/device/*`、`/api/push/*`、`/api/vault/key`、`/api/ugc/maze/start`、`/api/ugc/maze/submit`。浏览器发起的跨站请求通过 `Sec-Fetch-Site`（旧浏览器退回 `Origin` / `Referer`）识别并以 403 拒绝。不带这些头的非浏览器客户端不构成 CSRF 攻击面，直接放行。
- **无状态令牌（可选）**：`generateCSRFToken` / `validateCSRFToken` 生成与会话绑定的 HMAC 令牌，多实例部署也能校验。

NextAuth 自己的 `/api/auth/*` 使用其内置 CSRF 令牌。

## 5. 开发用测试登录

`authConfig.ts` 里有一个 `test` Credentials 登录方式，只有 `NODE_ENV === 'development'` 时才会通过，其他环境一律拒绝。

**生产环境绝不能把 `NODE_ENV` 设为 `development`**，否则任何人都能用它登录。

## 6. 响应头

### Content Security Policy

```
default-src 'self'
script-src 'self' blob: 'wasm-unsafe-eval' https://vercel.live https://*.vercel.live   # 开发环境另加 'unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self' https:
frame-src 'self' https://vercel.live https://*.vercel.live
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

- **`blob:` 和 `'wasm-unsafe-eval'`**：本地语义搜索用 onnxruntime-web，它把 WASM 胶水代码包成 `blob:` URL 加载，`WebAssembly.instantiate` 需要 `wasm-unsafe-eval`。这只放开 WASM 编译，不允许任意字符串求值，且代码是我们自己打包的。
- **`'unsafe-eval'`**：仅开发环境，Next.js HMR 需要。
- **`connect-src https:`**：`/models` 里用户可以配置任意 AI 服务地址，同步也会直连用户的 WebDAV / OneDrive，无法预先列白名单。
- **`style-src 'unsafe-inline'`**：框架和组件的内联样式。
- **`vercel.live`**：Vercel 预览环境的评论工具，是唯一的外部脚本来源。

### 其余头部

| 头部                     | 值                                         |
| ------------------------ | ------------------------------------------ |
| `X-Content-Type-Options` | `nosniff`                                  |
| `X-Frame-Options`        | `DENY`                                     |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`          |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=()` |

## 7. Service Worker

`public/service-worker.js` 的安全约束：

- 只处理同源 GET；跨域请求（AI 服务、同步、模型下载）不经过缓存。
- 不缓存 `/api/`、`/admin`、`/signin`、`/u/`：认证、设备验证、金库密钥、推送和他人的公开内容不会留在缓存里。
- 只缓存成功的、非重定向的同源响应。
- `next.config.mjs` 给 `/service-worker.js` 设了 `no-cache, no-store, must-revalidate`，安全修复能及时下发。
- 没有单独的 `worker-src`，SW 受 `script-src 'self'` 约束。
- 缓存的只是静态页面壳，不含笔记。

## 8. 检查清单

### 部署前

- [ ] 全站 HTTPS，所有子域名也支持 HTTPS
- [ ] `NODE_ENV` 是 `production`
- [ ] `NEXTAUTH_SECRET`、`DEVICE_SESSION_SECRET`、`VAULT_MASTER_KEY` 都是独立生成的强随机值
- [ ] `VAULT_MASTER_KEY` 已与数据库备份分开备份
- [ ] CSP 与实际使用的外部域名一致

### 改代码时

- [ ] 新增携带用户内容的笔记字段已在 `noteStoreSchema` 中标为 `secret`，`test/encryption-at-rest.test.ts` 通过
- [ ] 新增会修改状态的 Next API 路由已用 `withCsrfProtection` 包装
- [ ] 修改缓存策略时递增了 `CACHE_VERSION`

### 定期

- [ ] `npm audit` 无高危
- [ ] 新增第三方脚本或域名时更新 CSP
- [ ] 检查 HSTS 预加载状态

## 9. 参考

- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
