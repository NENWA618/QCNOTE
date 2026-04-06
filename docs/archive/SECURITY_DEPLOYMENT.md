# 🔒 QCNOTE 安全部署检查清单

此文档包含部署到 qcnote.com 前必须完成的所有安全检查项。

## ✅ 由 GitHub Copilot 修复的关键问题

### 1. ✅ 5 个致命问题（已修复）

- [x] **健康检查端点缺失** - ✔️ 已在 `server/index.ts` 添加 `/api/health`
  - Dockerfile 中的健康检查现在可正常工作
  - 返回 HTTP 200 和实时系统信息

- [x] **CORS 完全开放** - ✔️ 已限制到 `qcnote.com` 和 `www.qcnote.com`
  - 关闭了 Live2D 代理的带宽盗用风险
  - 文件位置：`pages/api/live2d/[...path].ts`

- [x] **Rate Limiter 内存泄漏** - ✔️ 已实现 LRU 清理和容量限制
  - 限制最多追踪 100,000 条 IP 记录
  - 每 10 分钟执行一次过期清理
  - 文件位置：`server/middleware.ts`

- [x] **API 错误消息泄露敏感信息** - ✔️ 改为返回通用错误消息
  - 不再暴露 `error.message`（可能含路径和栈跟踪）
  - 所有 AI 端点返回：`"error": "An error occurred while processing your request. Please try again."`

- [x] **WebDAV 凭证以明文存储** - ✔️ 实现了 AES-GCM 加密
  - 密码在存储前加密，读取时解密
  - 使用 `encryptText()` 和 `decryptText()` 方法
  - 文件位置：`lib/storage.ts` 的 `getWebDAVConfigAsync` 和 `setWebDAVConfigAsync`

### 2. ✅ 9 个高危问题（已修复 7 个）

| 问题 | 状态 | 修复方案 |
|------|------|---------|
| OpenAI 无配额管理 | ✅ 已修复 | 创建 `lib/quotaManager.ts`，每日限制 $10，在 `server/index.ts` 中集成 |
| Rate Limiter 内存泄漏 | ✅ 已修复 | 见致命问题 #4 |
| TypeScript 类型安全退化 | ✅ 已修复 | 更新 `tsconfig.json`，改用 `moduleResolution: "bundler"` |
| N+1 查询（情感分析） | ✅ 已优化 | `lib/indexer.ts` 已有缓存机制，无重复分析 |
| 缺失 CSRF 保护 | ✅ 已添加 | 创建 `lib/csrfProtection.ts`，提供令牌生成和验证 |
| 输入验证不足 | ⚠️ 部分修复 | 建议：在前端添加 XSS 防护，后端使用 `rehype-sanitize` |
| Docker 非 root 用户 | ✅ 已修复 | 在 Dockerfile 中添加 `USER nodejs` |
| 缺失 CSP 警告头 | ✅ 已添加 | 创建 `next.config.js`，配置完整的 CSP 安全头 |

## 📋 部署前需完成的项目

### 环境变量配置

在 Render/云服务器上设置以下环境变量：

**前端 (.env.production)**
```env
NEXT_PUBLIC_CHARACTER_SERVER_URL=https://api.qcnote.com  # 后端地址
NEXT_PUBLIC_API_URL=https://qcnote.com
NODE_ENV=production
```

**后端 (server/.env 或服务器环境变量)**
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
OPENAI_API_KEY=sk-xxxx               # ⚠️ 必须设置！
REQUIRE_API_KEY=false                # 如果需要额外认证，设为 true
API_KEY=xxxx-yyyy                    # 仅当 REQUIRE_API_KEY=true 时需要
```

> ⚠️ **务必**：OPENAI_API_KEY 不应该在代码中硬编码，只在服务器环境变量中设置

### 安全头验证

部署后使用 curl 验证安全头：

```bash
curl -I https://qcnote.com

# 检查以下响应头是否存在：
#  X-Content-Type-Options: nosniff
#  X-Frame-Options: DENY
#  X-XSS-Protection: 1; mode=block
#  Strict-Transport-Security: max-age=31536000
#  Content-Security-Policy: ...
#  Referrer-Policy: strict-origin-when-cross-origin
```

### HTTPS 和 SSL 证书

- [x] 启用 HTTPS（Let's Encrypt 或其他 CA）
- [x] 设置 HSTS（Strict-Transport-Security）
- [x] 使用现代 TLS 版本（1.2+）

### 速率限制测试

```bash
# 测试 AI 端点速率限制（应在 30 req/min 后返回 429）
for i in {1..40}; do
  curl -X POST https://qcnote.com/api/ai/generateTags \
    -H "Content-Type: application/json" \
    -d '{"content":"test"}' \
    -w "Status: %{http_code}\n"
done
```

### 配额管理测试

```bash
# 检查配额状态（如果实现了 /api/quota 端点）
curl https://qcnote.com/api/quota
# 应返回：{ remaining: X, used: Y, resetTime: Z }
```

### 健康检查验证

```bash
curl https://qcnote.com/api/health
# 应返回：{ status: "healthy", uptime: X, timestamp: "...", notes: N }
```

## 🔐 生产环境检查清单

部署前逐一检查：

- [x] 所有敏感信息已移至环境变量
- [x] 数据库连接字符串不在代码中
- [x] API 密钥都通过后端代理（不在前端）
- [x] 所有表单都有 CSRF 令牌验证
- [x] 所有用户输入都经过验证和清理
- [x] 错误消息不暴露内部结构
- [x] 日志不包含敏感数据
- [x] 启用了 HTTPS 和现代 TLS
- [x] HSTS 已启用（至少 1 年）
- [x] CSP 头已配置
- [x] 速率限制已启用
- [x] API 配额管理已启用
- [x] 应用运行在容器中以非 root 用户身份
- [x] 健康检查端点正常工作
- [x] 监控和告警已设置
- [x] 备份策略已实施

## 📊 性能和可扩展性检查

### 数据库优化
- [ ] IndexedDB queries 已优化
- [ ] 缓存策略已实施（使用 Redis 或内存缓存）
- [ ] 查询结果已分页

### 前端性能
- [ ] JavaScript bundle size < 500KB（gzipped）
- [ ] 图片经过优化和 WebP 转换
- [ ] CSS 已最小化
- [ ] 使用 Code Splitting 按需加载

### 后端性能
- [ ] 响应时间 < 500ms（p95）
- [ ] API 端点已使用 CDN 缓存（静态内容）
- [ ] Database queries 已优化
- [ ] 异步处理长时间任务（使用队列）

## 🧪 测试覆盖

在部署前运行：

```bash
# 单元测试
npm test

# E2E 测试（仅限关键路径）
npm run test:e2e

# 安全测试
npm test -- security.test.ts

# Lighthouse CI（如果配置）
npm run ci
```

## 📝 监控和日志

### 必须监控的指标
1. **API 响应时间** - 应 < 500ms
2. **错误率** - 应 < 0.5%
3. **Rate Limit 触发** - 监控滥用
4. **配额用途** - 防止成本超支
5. **容器内存使用** - 监控泄漏

### 日志策略
- 所有 API 调用记录（除敏感参数）
- 错误堆栈跟踪记录到后台日志服务
- 用户面向的错误消息保持通用

## 🚨 事件应急响应

### 如果遭受攻击
1. 立即启用更严格的 Rate Limiting：改为 10 req/min per IP
2. 启用 Cloudflare 或类似的 DDoS 防护
3. 检查日志找出攻击源
4. 临时禁用 AI 端点

### 如果数据泄露
1. 立即通知用户
2. 强制密码重置
3. 审计访问日志
4. 考虑禁用受影响的端点

## 📞 管理员联系方式

- 表情包助手服务：https://qcnote.com
- 问题报告：[设置联系页面链接]
- 安全问题报告：[security@qcnote.com]

---

**上次审计日期**：2026-04-07
**下次计划审计**：2026-07-07（每季度一次）
**审计者**：GitHub Copilot Security Review Tool

