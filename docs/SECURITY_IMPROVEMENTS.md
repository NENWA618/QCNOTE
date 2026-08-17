# 安全性改进文档

## 1. SRI (Subresource Integrity) 实现

### 概述

所有外部脚本已配置 SHA-384 哈希验证，防止脚本被篡改。

### 配置位置

文件: `pages/_app.tsx` - `LIVE2D_SCRIPTS` 配置

### 脚本哈希值

```
- jquery.min.js: sha384-8tYNOTebnBsu2uJVL89aGq4s0p73VUEaMvb3UQfF9BGauCt8ily7xALBZZDhBkIq
- jquery-ui.min.js: sha384-oKkTl2UWSGSDmIdF+GN3eHs+wOECTTceypjA+YqGPihcGrunduu8bSi4x5mZUzhx
- live2d.min.js: sha384-/twJSH1D7X7bd6Lv/j6n5sZNemnl0t/uymDkaQgnKK9y34ktwVvG+VQIzOt81HQf
- waifu-tips.min.js: sha384-xYwKAXPtOWVhbSC3GpxeM13RuX5UEt9lehsWIud4k791FOjxAgthgFPg6KigGvqU
- waifu.js: sha384-w7BTgyFulOnNNbf5FHggbGHiNt32hxgwQKpCdLT0Ar2BW78s7Mbiieyxw0j2oga/
```

### 工作原理

1. 浏览器下载脚本后计算其 SHA-384 哈希值
2. 与标签中的 `integrity` 属性进行比较
3. 若哈希不匹配，浏览器拒绝执行脚本（防止 CDN 被黑客入侵）

### 更新脚本哈希值

运行以下命令生成新的哈希值：

```bash
node -e "
const fs = require('fs');
const crypto = require('crypto');
const files = ['public/js/jquery.min.js', 'public/js/jquery-ui.min.js', 'public/js/live2d.min.js', 'public/js/waifu-tips.min.js', 'public/js/waifu.js'];
files.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file);
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    console.log(\`\${file}: sha384-\${hash}\`);
  }
});
"
```

---

## 2. HSTS (HTTP Strict Transport Security) 配置

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

## 3. Cookie 安全配置

### 已配置的安全属性

文件: `lib/auth-config.ts`

| 属性       | 值                | 说明                             |
| ---------- | ----------------- | -------------------------------- |
| `httpOnly` | `true`            | 防止 JavaScript 访问（XSS 防护） |
| `secure`   | `true` (生产环境) | 仅在 HTTPS 上传输                |
| `sameSite` | `strict/lax`      | 防止 CSRF 攻击                   |
| `maxAge`   | 30 天             | Cookie 有效期                    |

### Cookie 类型详情

#### sessionToken

- **用途**: 用户会话令牌
- **sameSite**: `strict` - 最严格的 CSRF 防护
- **maxAge**: 30 天

#### callbackUrl / csrfToken

- **用途**: OAuth 回调和 CSRF 防护
- **sameSite**: `lax` - 平衡安全与 OAuth 流程
- **maxAge**: 会话级别

#### pkceCodeVerifier

- **用途**: PKCE 安全流程的临时令牌
- **maxAge**: 15 分钟

---

## 4. 其他安全头部

### Content Security Policy (CSP)

阻止未授权的脚本、样式和资源加载。

```
default-src 'self'
script-src 'self' 'unsafe-eval' https://live2d.fghrsh.net https://vercel.live https://*.vercel.live
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self' data:
connect-src 'self' https://live2d.fghrsh.net https://lwl12.com https://jinrishici.com https://hitokoto.cn https://vercel.live https://*.vercel.live
frame-src 'self' https://vercel.live https://*.vercel.live
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
upgrade-insecure-requests
```

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

### Permissions-Policy

限制危险的浏览器 API 使用

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 5. 安全检查清单

### 部署前检查

- [ ] 所有脚本配置了 SRI 哈希值
- [ ] HSTS 头部已配置 (max-age ≥ 1 年)
- [ ] 所有 Cookie 配置了 HttpOnly 和 Secure 标志
- [ ] HTTPS 在生产环境启用
- [ ] CSP 策略已适当配置
- [ ] 所有子域名支持 HTTPS

### 定期维护

- [ ] 每季度运行安全审计
- [ ] 脚本更新后重新生成 SRI 哈希值
- [ ] 监控 CSP 违规日志
- [ ] 检查 HSTS 预加载列表状态

---

## 6. 参考资源

- [MDN: Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [MDN: HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [HSTS Preload](https://hstspreload.org/)
- [OWASP: Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN: HTTP Headers Security](https://developer.mozilla.org/en-US/docs/Glossary/Security_header)
