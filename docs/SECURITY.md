# 安全

这份文档说明 QCNOTE 的安全边界，以及密钥、传输、Cookie、CSRF、内容安全策略和 Service Worker 的配置与原因，供部署和安全审计参考。加密的实现细节见 [ARCHITECTURE.md 第 3、4 节](ARCHITECTURE.md#3-笔记存储)。

- [安全边界](#安全边界)
- [服务端密钥](#服务端密钥)
- [传输](#传输)
- [Cookie](#cookie)
- [CSRF](#csrf)
- [开发用测试登录](#开发用测试登录)
- [响应头](#响应头)
- [Service Worker](#service-worker)
- [外部输入与内容渲染](#外部输入与内容渲染)
- [检查清单](#检查清单)
- [报告安全问题](#报告安全问题)

## 安全边界

| 数据                     | 存放位置                 | 保护方式                                       |
| ------------------------ | ------------------------ | ---------------------------------------------- |
| 访客的笔记               | 浏览器 IndexedDB         | 明文                                           |
| 登录用户的笔记及派生数据 | 浏览器 IndexedDB         | 字段级 AES-GCM，密钥由服务端托管（金库方案）   |
| 公开笔记                 | 服务器 PostgreSQL        | 明文，任何人可见；只有用户主动发布的才会上传   |
| 同步文件                 | 用户的 WebDAV / OneDrive | 填了同步密钥时 PBKDF2 + AES-GCM，否则明文 JSON |
| AI 请求                  | 浏览器 → 用户配置的地址  | 不经过 QCNOTE 服务器；API Key 加密存在本机     |

服务器不接收任何私有笔记。

### 能解密笔记需要什么

登录用户的笔记由浏览器本地的 DEK 加密；DEK 用该用户的 KEK 包裹后存在本地；KEK 由服务端用 `VAULT_MASTER_KEY` 加密保管。

| 攻击者拿到                                  | 能否读到笔记                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| 服务器数据库（含或不含 `VAULT_MASTER_KEY`） | 否：服务器上没有笔记和 DEK                               |
| 某台设备的浏览器存储                        | 否：缺 KEK                                               |
| 浏览器存储 + 服务端密钥和数据库             | 是                                                       |
| 浏览器存储 + 该用户的登录会话               | 是：登录后可“重置设备指纹”把自己登记为新设备，再换取 KEK |

所以这是**服务端托管密钥，不是端到端加密**。

设备绑定只能挡住“把设备会话令牌单独拿到另一台设备上用”。设备指纹由客户端上报，并非秘密；能读到令牌的一方（例如页面里的 XSS）通常也能算出同一指纹，而持有登录会话就能重置设备。它不能替代账号本身的安全。

访客模式的笔记是明文。登录用户的同步凭据、冲突记录、同步基线、embedding 缓存和 AI 设置都用笔记库密钥 seal；设备未解锁时这些数据既不能读也不能写，代码不会退回到较弱的加密。

## 服务端密钥

| 变量                    | 用途                                                   | 缺失时                                                       | 泄露或丢失的后果                                                                                    |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `VAULT_MASTER_KEY`      | 加密 `user_vault_keys` 里每个用户的 KEK（AES-256-GCM） | 生产环境后端**拒绝启动**；开发环境用固定的开发密钥并打印警告 | **丢失或更换**：所有用户的 KEK 解不开，已有设备上的笔记无法解锁。**泄露**：配合数据库可解出所有 KEK |
| `NEXTAUTH_SECRET`       | 签名 NextAuth 会话；后端用它解析会话 Cookie            | 生产环境前端拒绝启动（也拒绝短于 16 个字符或已知的默认值）   | 可伪造任意用户的登录会话                                                                            |
| `DEVICE_SESSION_SECRET` | 签名设备会话令牌（HS256，12 小时）                     | 回退到 `NEXTAUTH_SECRET`；两者都缺失时生产环境报错           | 可为已知指纹伪造设备会话（仍需有效的登录会话）                                                      |

- `VAULT_MASTER_KEY` 必须是 base64 编码的 32 字节（`openssl rand -base64 32`），长度不对时启动即失败。
- 目前**没有** `VAULT_MASTER_KEY` 的轮换机制。请把它与数据库备份分开、同样可靠地备份。
- 三个变量应各自独立生成。

## 传输

全站 HTTPS，`next.config.mjs` 设置：

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

即 2 年有效期、覆盖所有子域名、允许加入浏览器的预加载列表。

加入预加载列表前，确认 HTTP 会重定向到 HTTPS、所有子域名都支持 HTTPS，然后在 [hstspreload.org](https://hstspreload.org/) 提交；可用 `curl -I https://www.qcnote.com` 检查响应头。加入后需要数月才能移除，HTTPS 一旦配置出错，用户会完全无法访问。

## Cookie

配置在 `pages/api/auth/authConfig.ts`。NextAuth 的三个 Cookie 都是 `httpOnly`、`sameSite: 'lax'`，生产环境加 `secure`：

| Cookie         | 用途                   | 有效期  | 说明                                                                               |
| -------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------- |
| `sessionToken` | 登录会话               | 30 天   | 不用 `strict`：OAuth 回调和外链进入是跨站顶层跳转，`strict` 会让首个请求读不到会话 |
| `callbackUrl`  | OAuth 登录后的回跳地址 | 15 分钟 |                                                                                    |
| `csrfToken`    | NextAuth 的 CSRF 令牌  | 会话级  |                                                                                    |

其余 Cookie（如 PKCE）使用 NextAuth 的默认值。

生产环境的 Cookie 名使用浏览器强制校验的前缀（`lib/authCookies.ts`，前后端共用）：

| Cookie         | 生产环境名称                       | 前缀的约束                                                   |
| -------------- | ---------------------------------- | ------------------------------------------------------------ |
| `sessionToken` | `__Secure-next-auth.session-token` | 必须带 `Secure`，且经 HTTPS 设置                             |
| `callbackUrl`  | `__Secure-next-auth.callback-url`  | 同上                                                         |
| `csrfToken`    | `__Host-next-auth.csrf-token`      | 另外不能带 `Domain`、必须 `Path=/`，其他子域名无法写入或覆盖 |

开发环境（`http://localhost`）不加前缀，否则浏览器会拒收。

设备会话令牌不是 Cookie，存在 `sessionStorage` 中，关闭浏览器即失效。

## CSRF

`lib/csrfProtection.ts` 提供两层保护：

- **同源校验（已接入）**：所有会修改状态的 Next API 路由都用 `withCsrfProtection` 包装，包括 `/api/proxy/*`、`/api/admin/set-admin`、`/api/device/*`、`/api/push/*`、`/api/vault/key`、`/api/ugc/maze/start`、`/api/ugc/maze/submit`。浏览器发起的跨站请求通过 `Sec-Fetch-Site` 识别（旧浏览器退回 `Origin` / `Referer`），以 403 拒绝。不带这些头的非浏览器客户端不构成 CSRF 攻击面，直接放行。
- **无状态令牌（可选）**：`generateCSRFToken` / `validateCSRFToken` 生成与会话绑定的 HMAC 令牌，多实例部署也能校验。

NextAuth 自己的 `/api/auth/*` 使用其内置的 CSRF 令牌。

## 开发用测试登录

`authConfig.ts` 里有一个 `test` Credentials 登录方式，只在 `NODE_ENV === 'development'` 时通过，其他环境一律拒绝。

**生产环境绝不能把 `NODE_ENV` 设为 `development`**，否则任何人都能用它登录。

## 响应头

### 内容安全策略

```
default-src 'self'
script-src 'self' blob: 'wasm-unsafe-eval'   # 开发环境另加 'unsafe-eval'；Vercel 预览部署另加 vercel.live
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self' https:
frame-src 'self'                              # Vercel 预览部署另加 vercel.live
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

| 放开的项                      | 原因                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob:`、`'wasm-unsafe-eval'` | 本地语义搜索用 onnxruntime-web：它把 WASM 胶水代码包成 `blob:` URL 加载，`WebAssembly.instantiate` 需要 `wasm-unsafe-eval`。这只放开 WASM 编译，不允许任意字符串求值，且代码是我们自己打包的 |
| `'unsafe-eval'`               | 仅开发环境，Next.js 的热更新需要                                                                                                                                                             |
| `connect-src https:`          | `/models` 里用户可以配置任意 AI 服务地址，同步也会直连用户的 WebDAV / OneDrive，无法预先列白名单                                                                                             |
| `img-src https:`              | 用户头像是任意外链                                                                                                                                                                           |
| `style-src 'unsafe-inline'`   | 框架和组件的内联样式                                                                                                                                                                         |
| `vercel.live`                 | 仅 Vercel 预览部署（`VERCEL_ENV=preview`），评论工具需要；生产和自托管不放行任何外部脚本                                                                                                     |

`script-src` **不包含** `'unsafe-inline'`，所以页面里不能有可执行的内联脚本（JSON-LD 这类非执行脚本不受影响）。需要提前执行的脚本只能放成同源的独立文件。

### 其余头部

| 头部                     | 值                                         |
| ------------------------ | ------------------------------------------ |
| `X-Content-Type-Options` | `nosniff`                                  |
| `X-Frame-Options`        | `DENY`                                     |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`          |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=()` |

后端另外使用 `@fastify/helmet` 和 `@fastify/rate-limit`；按 IP 限流时，只信任 `TRUST_PROXY_HOPS` 层代理追加的 `X-Forwarded-For` 条目。经前端代理的请求，客户端 IP 由前端按 `FRONTEND_TRUST_PROXY_HOPS` 用同样的规则取出并签名，后端只采信签名有效的值。

## Service Worker

`public/service-worker.js` 的约束：

- 只处理同源 GET；跨域请求（AI 服务、同步、模型下载）不经过缓存。
- 不缓存 `/api/`、`/admin`、`/signin`、`/u/`：认证、设备验证、金库密钥、推送和他人的公开内容不会留在缓存里。
- 只缓存成功的、非重定向的同源响应。缓存的只是静态页面外壳，不含笔记。
- `next.config.mjs` 给 `/service-worker.js` 设了 `no-cache, no-store, must-revalidate`，安全修复能及时下发。
- 没有单独的 `worker-src`，Service Worker 受 `script-src 'self'` 约束。

## 外部输入与内容渲染

- **Markdown**：渲染时使用 `rehype-sanitize`；公开笔记的文字着色由服务端逐项校验，丢弃不安全的颜色。
- **网页剪藏**：剪藏数据来自 URL hash，任何链接都能伪造，所以用 zod 严格校验长度和格式，并且必须经用户确认才保存，见 [extensions/README.md](../extensions/README.md#安全)。
- **用户资料**：用户名、简介有长度限制，头像只接受 http(s) 地址或空值。
- **公开页面**：个人主页和公开笔记页带 `noindex`，在客户端渲染。

## 检查清单

### 部署前

- [ ] 全站 HTTPS，所有子域名也支持 HTTPS
- [ ] `NODE_ENV` 是 `production`
- [ ] `NEXTAUTH_SECRET`、`DEVICE_SESSION_SECRET`、`VAULT_MASTER_KEY` 都是独立生成的强随机值
- [ ] `VAULT_MASTER_KEY` 已与数据库备份分开备份
- [ ] `TRUST_PROXY_HOPS` 与实际代理层数一致
- [ ] CSP 与实际使用的外部域名一致

### 改代码时

- [ ] 新增携带用户内容的笔记字段已在 `noteStoreSchema` 中标为 `secret`，`test/encryption-at-rest.test.ts` 通过
- [ ] 新增会修改状态的 Next API 路由已用 `withCsrfProtection` 包装
- [ ] 新增的外部输入（URL 参数、hash、导入文件）有校验
- [ ] 修改 Service Worker 缓存策略时递增了 `CACHE_VERSION`

### 定期

- [ ] `npm audit` 无高危（CI 会检查前后端）
- [ ] 新增第三方脚本或域名时更新 CSP
- [ ] 检查 HSTS 预加载状态

## 报告安全问题

请发邮件到 yours@girl.cat，不要在公开的 Issue 里披露细节。

如需加密通信，请使用下面的 OpenPGP 公钥：

- 持有者：NENWA618 <yours@girl.cat>
- 指纹：`D7F3 DC46 0FB4 8157 A16E 0D37 786A 2F50 8A54 AFD1`
- 密钥 ID：`0x786A2F508A54AFD1`
- 有效期：2026-10-20 至 2029-10-19
- 公钥文件：[`public/.well-known/pgp-key.asc`](../public/.well-known/pgp-key.asc)（站点：`https://www.qcnote.com/.well-known/pgp-key.asc`）
- 获取：[keys.openpgp.org](https://keys.openpgp.org/vks/v1/by-fingerprint/D7F3DC460FB48157A16E0D37786A2F508A54AFD1)，也可通过 `gpg --keyserver keys.openpgp.org --recv-keys D7F3DC460FB48157A16E0D37786A2F508A54AFD1` 导入

导入后请核对指纹与上面一致，再发送加密邮件。

参考：[MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)、[HSTS Preload](https://hstspreload.org/)、[OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)、[MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)。
