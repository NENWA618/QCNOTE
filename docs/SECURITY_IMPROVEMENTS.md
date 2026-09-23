# 安全性改进文档

记录 QCNOTE 在传输安全、Cookie、CSP 等方面的具体配置及其原因，供部署与安全审计时参考。

> **2026-09-19 更新**：Live2D 看板娘模块已整体移除，原先为其配置的外部脚本 SRI 哈希也随之删除
> （`pages/_app.tsx` 的 `LIVE2D_SCRIPTS`、`scripts/generate-sri-hashes.mjs`、`.script-hashes.json` 均已删除）。
> CSP 的 `script-src` 同步移除了生产环境下的 `'unsafe-eval'` 与 `live2d.fghrsh.net`，详见第 3 节。

## 1. HSTS（HTTP Strict Transport Security）

HSTS 强制浏览器始终通过 HTTPS 连接到网站，防止中间人攻击（MITM）。

**当前配置**（`next.config.mjs`）：

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

| 参数                | 值         | 说明                                  |
| ------------------- | ---------- | ------------------------------------- |
| `max-age`           | `63072000` | 2 年（秒数），浏览器记住该策略的时间  |
| `includeSubDomains` | 开启       | 应用于所有子域名（如 `*.qcnote.com`） |
| `preload`           | 开启       | 允许将域名加入浏览器 HSTS 预加载列表  |

### 加入 HSTS 预加载列表

1. 确认已满足要求：Serve a valid HSTS header（至少 1 年、`includeSubDomains`、`preload`）、Redirect HTTP to HTTPS、Serve all subdomains over HTTPS
2. 在 [hstspreload.org](https://hstspreload.org/) 提交域名，等待审批（通常需数周）
3. 提交后可用 `curl -I https://www.qcnote.com` 检查响应头是否包含上述 `Strict-Transport-Security` 值

**收益**：防止首次访问时的 HTTPS 降级攻击、避免用户输入 `http://` 时的不安全连接、提升 SEO。

**风险**：一旦加入需数月才能移除；如果 HTTPS 配置失败，用户将完全无法访问网站；所有子域名都必须支持 HTTPS。

---

## 2. Cookie 安全配置

配置文件：`pages/api/auth/authConfig.ts`。三个 NextAuth Cookie（`sessionToken`、`callbackUrl`、`csrfToken`）都设置了：

| 属性       | 值                 | 说明                             |
| ---------- | ------------------ | -------------------------------- |
| `httpOnly` | `true`             | 防止 JavaScript 访问（XSS 防护） |
| `secure`   | `true`（生产环境） | 仅在 HTTPS 上传输                |
| `sameSite` | `lax`              | 防止 CSRF 攻击                   |

> `authConfig.ts` 只显式配置了这三个 Cookie；PKCE 等其余 Cookie 使用 NextAuth 默认值。

### 各 Cookie 详情

| Cookie         | 用途                      | `sameSite` 选择原因                                                                    | `maxAge`                     |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| `sessionToken` | 用户会话令牌              | 不用 `strict`：OAuth 回调和外链进入都是跨站顶层跳转，`strict` 会导致首个请求读不到会话 | 30 天                        |
| `callbackUrl`  | OAuth 登录后的回跳地址    | `lax` 平衡安全与 OAuth 流程                                                            | 15 分钟                      |
| `csrfToken`    | NextAuth 的 CSRF 防护令牌 | `lax`                                                                                  | 会话级别（关闭浏览器即失效） |

### Cookie 名称前缀

生产环境下三个 Cookie 使用浏览器强制识别的前缀（定义在 `lib/authCookies.ts`，前端与 Fastify 后端共用同一套逻辑）：

| Cookie         | 生产环境名称                       | 前缀含义                                                            |
| -------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `sessionToken` | `__Secure-next-auth.session-token` | 必须带 `Secure` 且经 HTTPS 设置，无法被明文连接覆盖                 |
| `callbackUrl`  | `__Secure-next-auth.callback-url`  | 同上                                                                |
| `csrfToken`    | `__Host-next-auth.csrf-token`      | 额外要求不带 `Domain`、`Path=/`，同主域的其他子域名无法写入或覆盖它 |

开发环境（`http://localhost`）不加前缀，否则浏览器会拒收。**首次上线带前缀的版本时，所有用户会被登出一次**（旧名称的 Cookie 不再被识别），重新登录即可恢复。

### CSRF 防护

`lib/csrfProtection.ts` 提供两层防护：

- **同源校验（已接入）**：所有会修改状态的 Next API 路由（`/api/proxy`、`/api/admin/set-admin`、`/api/device/*`、`/api/push/*`、`/api/vault/key`、`/api/ugc/maze/submit`）都用 `withCsrfProtection` 包装。浏览器发起的跨站请求会被 `Sec-Fetch-Site`（旧浏览器退回到 `Origin`/`Referer`）识别并以 403 拒绝；不带这些头的非浏览器客户端不属于 CSRF 攻击面，直接放行，前端无需改动。
- **无状态令牌（可选叠加）**：`generateCSRFToken` / `validateCSRFToken` 生成与会话绑定的 HMAC 令牌，不依赖进程内存，多实例部署下也能校验。

NextAuth 自己的 `/api/auth/*` 端点使用其内置的 CSRF 令牌，不经过该包装器。

### 开发用测试登录

`authConfig.ts` 中有一个 `test` Credentials 提供者，仅当 `NODE_ENV === 'development'` 时 `authorize` 才会通过，其他环境一律返回 `null`，用于在没有配置 OAuth 时本地登录。**不要在生产环境把 `NODE_ENV` 设为 `development`**，否则这条后门登录会被启用。

---

## 3. 其他安全头部

### Content Security Policy（CSP）

```
default-src 'self'
script-src 'self' blob: 'wasm-unsafe-eval' https://vercel.live https://*.vercel.live   # 开发环境额外包含 'unsafe-eval'（Next.js HMR 需要）
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self' https:   # 放开到任意 https 目标，供 /models 页面里用户自行配置的 AI 服务调用
frame-src 'self' https://vercel.live https://*.vercel.live
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

`blob:` 和 `'wasm-unsafe-eval'` 是本地语义搜索（onnxruntime-web 的 WASM 推理运行时）需要的：WASM 胶水代码通过 `blob:` URL 加载，且该运行时的 `WebAssembly.instantiate` 在 Chromium 下需要显式的 `wasm-unsafe-eval` 授权——它只放开 WASM 编译，不像 `'unsafe-eval'` 那样允许任意 JS 字符串求值，攻击面小得多。

### 其余头部

| 头部                     | 值                                         | 作用                         |
| ------------------------ | ------------------------------------------ | ---------------------------- |
| `X-Content-Type-Options` | `nosniff`                                  | 防止 MIME 嗅探攻击           |
| `X-Frame-Options`        | `DENY`                                     | 防止点击劫持（Clickjacking） |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`          | 控制 Referer 头泄露          |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=()` | 禁用危险的浏览器 API         |

---

## 4. 安全检查清单

### 部署前

- [ ] HSTS 头部已配置（`max-age` ≥ 1 年）
- [ ] 所有 Cookie 配置了 `HttpOnly` 和 `Secure`
- [ ] 生产环境已启用 HTTPS
- [ ] CSP 策略已适当配置
- [ ] 所有子域名都支持 HTTPS

### 定期维护

- [ ] 每季度运行一次安全审计
- [ ] 新增外部脚本或第三方域名时同步收紧或更新 CSP（当前仅 `vercel.live` 为外部脚本来源）
- [ ] 监控 CSP 违规日志
- [ ] 检查 HSTS 预加载列表状态

---

## 5. 参考资源

- [MDN: HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP: Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN: HTTP Headers Security](https://developer.mozilla.org/en-US/docs/Glossary/Security_header)
