# 安全性改进文档

> **2026-09-19 更新**：Live2D 看板娘模块已整体移除，原第 1 节记录的外部脚本 SRI 哈希配置随之失效并删除
> （`pages/_app.tsx` 的 `LIVE2D_SCRIPTS`、`scripts/generate-sri-hashes.mjs`、`.script-hashes.json` 均已删除）。
> CSP 的 `script-src` 也已同步移除 `'unsafe-eval'`（生产环境）与 `live2d.fghrsh.net`，见第 3 节。

## 1. HSTS (HTTP Strict Transport Security) 配置

### 概述

HSTS 强制浏览器始终通过 HTTPS 连接到网站，防止中间人攻击（MITM）。

### 当前配置

文件: `next.config.mjs` - 安全头部配置

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 配置参数说明

| 参数                | 值         | 说明                                  |
| ------------------- | ---------- | ------------------------------------- |
| `max-age`           | `63072000` | 2年（秒数），浏览器记住该策略的时间   |
| `includeSubDomains` | 开启       | 应用于所有子域名（如 `*.qcnote.com`） |
| `preload`           | 开启       | 允许将域名加入浏览器 HSTS 预加载列表  |

### HSTS 预加载列表

#### 什么是 HSTS 预加载列表？

HSTS 预加载列表是浏览器厂商维护的一个列表，包含应该强制使用 HTTPS 的域名。即使是用户首次访问网站，浏览器也会遵守该策略。

#### 如何添加到预加载列表？

1. **访问 HSTS 预加载提交网站**
   - https://hstspreload.org/

2. **验证要求**

   ```
   ✓ Serve a valid HSTS header (至少1年, includeSubDomains, preload)
   ✓ Redirect HTTP to HTTPS
   ✓ Serve all subdomains over HTTPS
   ✓ Avoid HSTS header errors
   ```

3. **提交域名**
   - 在 https://hstspreload.org/ 输入域名
   - 点击"Submit domain"
   - 等待审批（通常需要数周）

4. **验证提交**
   ```bash
   curl -I https://www.qcnote.com
   # 检查响应头中是否包含:
   # Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
   ```

#### 预加载列表的好处

- ✅ 防止首次访问时的 HTTPS 降级攻击
- ✅ 避免用户输入 `http://` 时的不安全连接
- ✅ 提升用户隐私和安全性
- ✅ 改善 SEO（Google 对安全网站有优先级）

#### 相关风险

- ⚠️ 一旦加入预加载列表，移除需要数月
- ⚠️ 如果 HTTPS 配置失败，用户无法访问网站
- ⚠️ 所有子域名必须支持 HTTPS

---

## 2. Cookie 安全配置

### 已配置的安全属性

文件: `pages/api/auth/authConfig.ts`

| 属性       | 值                | 说明                             |
| ---------- | ----------------- | -------------------------------- |
| `httpOnly` | `true`            | 防止 JavaScript 访问（XSS 防护） |
| `secure`   | `true` (生产环境) | 仅在 HTTPS 上传输                |
| `sameSite` | `lax`             | 防止 CSRF 攻击                   |
| `maxAge`   | 30 天             | Cookie 有效期                    |

### Cookie 类型详情

#### sessionToken

- **用途**: 用户会话令牌
- **sameSite**: `lax` - 不使用 `strict`：OAuth 回调和外链进入均为跨站顶层跳转，Strict 会导致首个请求读不到会话
- **maxAge**: 30 天

#### callbackUrl

- **用途**: OAuth 登录后的回跳地址
- **sameSite**: `lax` - 平衡安全与 OAuth 流程
- **maxAge**: 15 分钟

#### csrfToken

- **用途**: NextAuth 的 CSRF 防护令牌
- **sameSite**: `lax`
- **maxAge**: 未设置（会话级别，关闭浏览器即失效）

> `authConfig.ts` 只显式配置了以上三个 Cookie；PKCE 等其余 Cookie 使用 NextAuth 默认值。

### 开发用测试登录

`authConfig.ts` 中有一个 `test` Credentials 提供者，仅当 `NODE_ENV === 'development'` 时才会通过 `authorize`，其他环境一律返回 `null`。它用于在没有配置 OAuth 时本地登录，**不要在生产环境把 `NODE_ENV` 设为 `development`**。

---

## 3. 其他安全头部

### Content Security Policy (CSP)

阻止未授权的脚本、样式和资源加载。

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

`blob:` 和 `'wasm-unsafe-eval'` 是本地语义搜索（onnxruntime-web WASM 推理运行时）需要的：WASM 胶水代码通过
`blob:` URL 加载，且该运行时的 WebAssembly 编译在 Chromium 下需要显式的 `wasm-unsafe-eval` 授权——
它只放开 WASM 编译，不像 `'unsafe-eval'` 那样允许任意 JS 字符串求值，攻击面小得多。

### X-Content-Type-Options

防止 MIME 嗅探攻击

```
X-Content-Type-Options: nosniff
```

### X-Frame-Options

防止点击劫持（Clickjacking）

```
X-Frame-Options: DENY
```

### Referrer-Policy

控制 Referer 头部信息泄露

```
Referrer-Policy: strict-origin-when-cross-origin
```

### X-XSS-Protection

旧版浏览器的 XSS 过滤器（现代浏览器已忽略，主要防护依赖 CSP）

```
X-XSS-Protection: 1; mode=block
```

### Permissions-Policy

限制危险的浏览器 API 使用

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 4. 安全检查清单

### 部署前检查

- [ ] HSTS 头部已配置 (max-age ≥ 1 年)
- [ ] 所有 Cookie 配置了 HttpOnly 和 Secure 标志
- [ ] HTTPS 在生产环境启用
- [ ] CSP 策略已适当配置
- [ ] 所有子域名支持 HTTPS

### 定期维护

- [ ] 每季度运行安全审计
- [ ] 新增外部脚本或第三方域名时，同步收紧或更新 CSP（当前仅 `vercel.live` 为外部脚本来源）
- [ ] 监控 CSP 违规日志
- [ ] 检查 HSTS 预加载列表状态

---

## 5. 参考资源

- [MDN: HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP: Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN: HTTP Headers Security](https://developer.mozilla.org/en-US/docs/Glossary/Security_header)
