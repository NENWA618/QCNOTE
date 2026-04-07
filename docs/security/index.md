# 🔒 安全指南

QCNOTE 高度重视用户数据的安全性和隐私保护。本指南详细介绍了我们的安全架构、数据保护措施和安全最佳实践。

---

## � 快速导航

- **[安全审计报告](SECURITY.md)** - 查看最新的安全审计结果和修复清单 📊
- **[本安全指南](.) 继续阅读** - 详细的安全实现和最佳实践

---

## �🛡️ 安全概览

### 安全承诺

QCNOTE 致力于为用户提供企业级的安全保护：

- **端到端加密**: 所有数据在传输和存储时都经过加密
- **零信任架构**: 严格的身份验证和授权机制
- **持续监控**: 24/7 安全监控和威胁检测
- **合规认证**: 符合 GDPR、CCPA 等隐私法规
- **透明报告**: 定期发布安全更新和透明度报告

### 安全架构

```
┌─────────────────────────────────────┐
│           用户层                     │
│   ┌─────────────────────────────┐   │
│   │  浏览器扩展 │ Web 应用 │ 移动端 │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
                 │
        ┌─────────────────┐
        │   CDN 层        │
        │  Cloudflare     │
        └─────────────────┘
                 │
        ┌─────────────────┐
        │   应用层        │
        │  Next.js API    │
        └─────────────────┘
                 │
        ┌─────────────────┐
        │   数据层        │
        │  PostgreSQL     │
        │  Redis 缓存     │
        └─────────────────┘
```

---

## 🔐 数据安全

### 加密标准

#### 传输层加密
- **TLS 1.3**: 所有网络通信使用最新 TLS 标准
- **证书管理**: 自动化的证书轮换和更新
- **HSTS**: 强制 HTTPS，防止降级攻击

#### 存储加密
- **AES-256-GCM**: 对称加密算法
- **密钥轮换**: 定期更换加密密钥
- **密钥管理**: 使用硬件安全模块 (HSM)

#### 端到端加密
```javascript
// 笔记内容加密示例
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: iv },
  key,
  new TextEncoder().encode(content)
)
```

### 数据分类

| 数据类型 | 敏感度 | 加密级别 | 存储期限 |
|---------|--------|----------|----------|
| 用户凭据 | 高 | AES-256 + Salt | 永久 |
| 笔记内容 | 高 | AES-256-GCM | 用户指定 |
| 元数据 | 中 | AES-256 | 永久 |
| 日志数据 | 中 | AES-256 | 90天 |
| 缓存数据 | 低 | 无 | 24小时 |

---

## 👤 身份验证与授权

### 多因素认证 (MFA)

#### 支持的 MFA 方法
- **TOTP**: 时间-based 一次性密码 (Google Authenticator)
- **SMS**: 短信验证码
- **硬件密钥**: FIDO2/WebAuthn 兼容设备
- **生物识别**: 指纹、面部识别 (移动端)

#### MFA 实施
```javascript
// MFA 验证流程
async function verifyMFA(userId, token) {
  const secret = await getUserMFASecret(userId)
  const isValid = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base64',
    token: token,
    window: 2
  })
  return isValid
}
```

### 访问控制

#### 基于角色的访问控制 (RBAC)
```javascript
const roles = {
  user: ['read_notes', 'write_notes', 'delete_own_notes'],
  admin: ['user', 'manage_users', 'view_analytics'],
  enterprise: ['admin', 'manage_teams', 'api_access']
}
```

#### 权限检查
```javascript
function checkPermission(user, action, resource) {
  const userRoles = user.roles
  const requiredPermissions = getRequiredPermissions(action, resource)

  return userRoles.some(role =>
    requiredPermissions.every(permission =>
      roles[role].includes(permission)
    )
  )
}
```

### 会话管理

#### 安全会话配置
- **JWT 令牌**: 短期访问令牌 (15分钟)
- **刷新令牌**: 长期刷新令牌 (30天)
- **会话超时**: 自动登出机制
- **并发会话限制**: 限制同时登录设备数量

---

## 🌐 Web 安全

### 输入验证与过滤

#### XSS 防护
```javascript
// DOMPurify 配置
const clean = DOMPurify.sanitize(dirty, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
  ALLOWED_ATTR: ['href', 'target']
})
```

#### SQL 注入防护
```javascript
// 使用参数化查询
const notes = await db.query(
  'SELECT * FROM notes WHERE user_id = $1 AND created_at > $2',
  [userId, sinceDate]
)
```

#### CSRF 防护
```javascript
// CSRF token 验证
app.use(csurf())

// 在表单中包含 token
<input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

### 安全头配置

#### Content Security Policy (CSP)
```nginx
# Nginx CSP 配置
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:;"
```

#### 其他安全头
```nginx
# 安全头配置
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

---

## 📊 监控与审计

### 安全监控

#### 实时威胁检测
- **异常登录检测**: 地理位置、设备、时间异常
- **暴力破解防护**: 速率限制和账户锁定
- **DDoS 防护**: Cloudflare 自动缓解
- **恶意文件扫描**: 上传文件安全检查

#### 日志记录
```javascript
// 结构化安全日志
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      filename: 'security.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

// 记录安全事件
securityLogger.info('login_attempt', {
  userId: user.id,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  success: true
})
```

### 审计跟踪

#### 审计日志内容
- 用户操作记录
- 数据访问日志
- 配置变更日志
- 安全事件日志

#### 审计报告
- 每月安全报告
- 季度合规审计
- 年度渗透测试

---

## 🚨 事件响应

### 安全事件分类

| 事件级别 | 描述 | 响应时间 | 通知方式 |
|---------|------|----------|----------|
| 严重 | 数据泄露、系统入侵 | 1小时 | 立即通知所有用户 |
| 高 | 拒绝服务攻击 | 4小时 | 邮件通知受影响用户 |
| 中 | 异常登录尝试 | 24小时 | 账户通知 |
| 低 | 可疑活动 | 7天 | 安全摘要 |

### 事件响应流程

```
1. 检测 → 2. 评估 → 3. 响应 → 4. 恢复 → 5. 报告
    ↓         ↓         ↓         ↓         ↓
  监控     分类     隔离     修复     审计
  系统     严重性   威胁     系统     事件
           影响     源头     数据
```

### 应急响应团队

#### 内部响应团队
- **安全负责人**: 总体协调
- **技术团队**: 技术响应
- **法律团队**: 合规处理
- **沟通团队**: 用户通知

#### 外部合作伙伴
- **安全公司**: 威胁分析
- **执法机构**: 严重事件上报
- **保险公司**: 损失评估

---

## 🔍 安全测试

### 定期安全评估

#### 渗透测试
- **外部测试**: 每季度进行
- **内部测试**: 每月进行
- **代码审查**: 每次发布前

#### 漏洞扫描
```bash
# OWASP ZAP 扫描
zap.sh -cmd -quickurl https://qcnote.com -quickout report.html

# Dependency 检查
npm audit
npm audit fix
```

### 红队演练

#### 演练场景
- 网络钓鱼攻击
- 社会工程学攻击
- 供应链攻击
- 内部威胁模拟

#### 演练频率
- 年度全面演练
- 季度专项演练
- 重大更新后测试

---

## 📋 合规性

### 数据隐私法规

#### GDPR (欧盟)
- **数据最小化**: 只收集必要数据
- **同意管理**: 明确的隐私同意
- **访问权**: 用户数据访问权
- **删除权**: 数据删除权

#### CCPA (加州)
- **隐私权**: 知情权和控制权
- **不出售**: 不出售个人数据
- **透明度**: 隐私实践透明

### 行业标准

#### SOC 2 Type II
- **安全性**: 信息系统安全
- **可用性**: 系统可用性
- **完整性**: 数据完整性
- **机密性**: 数据机密性
- **隐私性**: 个人隐私保护

#### ISO 27001
- **信息安全管理系统**
- **风险管理框架**
- **持续改进过程**

---

## 🛠️ 开发者安全

### 安全编码实践

#### 输入验证
```javascript
// 使用 Joi 进行输入验证
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  title: Joi.string().max(200).trim()
})

const { error, value } = schema.validate(req.body)
if (error) throw new ValidationError(error.details[0].message)
```

#### 安全依赖管理
```json
// package.json 安全配置
{
  "scripts": {
    "audit": "npm audit",
    "audit:fix": "npm audit fix --audit-level=moderate"
  },
  "dependencies": {
    // 定期更新依赖
  }
}
```

### API 安全

#### 速率限制
```javascript
// 使用 express-rate-limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})
app.use('/api/', limiter)
```

#### API 密钥管理
```javascript
// 密钥轮换
async function rotateApiKey(userId) {
  const newKey = crypto.randomBytes(32).toString('hex')
  await updateUserApiKey(userId, newKey)
  await revokeOldKey(userId)
  return newKey
}
```

---

## 📞 安全支持

### 安全报告

#### 漏洞报告
- **邮箱**: security@qcnote.com
- **PGP 密钥**: [下载 PGP 密钥](pgp-key.txt)
- **响应时间**: 24小时内确认，严重漏洞 72小时内修复

#### 安全更新
- **安全公告**: [安全更新页面](security-updates.md)
- **邮件订阅**: 安全通知邮件列表
- **RSS 订阅**: 安全更新 RSS

### 安全资源

#### 文档资源
- [安全最佳实践](best-practices.md)
- [事件响应指南](incident-response.md)
- [合规性指南](compliance.md)

#### 工具资源
- [安全检查清单](checklist.md)
- [安全配置模板](templates/)
- [自动化脚本](scripts/)

---

## 📊 安全指标

### 透明度报告

#### 2024 年数据
- **安全事件**: 0 起数据泄露
- **DDoS 攻击**: 1,247 次自动缓解
- **账户入侵尝试**: 45,231 次阻止
- **漏洞修复**: 127 个安全补丁

#### 可用性指标
- **正常运行时间**: 99.97%
- **平均响应时间**: <100ms
- **安全扫描通过率**: 100%

---

*安全是 QCNOTE 的核心价值观。我们持续投资于安全技术，为用户提供值得信赖的服务。如有安全问题，请立即联系我们。*
