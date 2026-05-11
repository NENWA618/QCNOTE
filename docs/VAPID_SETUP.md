# Web Push Notification Setup Guide

## 生成 VAPID 密钥

Web Push 通知需要 VAPID（Voluntary Application Server Identification）密钥对来进行身份验证。

### 步骤 1: 本地生成 VAPID 密钥

在你的本地机器上运行以下命令（需要 Node.js）：

```bash
npx web-push generate-vapid-keys
```

输出示例：
```
Public Key: BHl2qWcz2Z4k...（一长串字符，约88字符）
Private Key: wM0R7qJ2kN5p...（一长串字符，约43字符）
```

### 步骤 2: 配置 Vercel 环境变量

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择你的 QCNOTE 项目
3. 进入 **Settings** → **Environment Variables**
4. 添加以下变量：

| 名称 | 值 | 
|------|-----|
| `NEXT_PUBLIC_VAPID_PUBLIC` | 你的 Public Key |
| `BACKEND_URL` | 你的 Render 后端 URL（例如 `https://qcnote-backend.onrender.com`） |
| `ADMIN_TOKEN` | 随机生成的管理员令牌（建议 32+ 字符） |

### 步骤 3: 配置 Render 环境变量

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 选择 **QCNOTE-server** 服务
3. 进入 **Environment**
4. 添加以下变量：

| 名称 | 值 | 
|------|-----|
| `VAPID_PUBLIC` | 与 Vercel 相同的 Public Key |
| `VAPID_PRIVATE` | 你的 Private Key |
| `ADMIN_TOKEN` | 与 Vercel 相同的令牌 |

### 步骤 4: 重新部署

1. **Render**：保存环境变量后会自动重新部署
2. **Vercel**：保存环境变量后会自动重新部署

## 验证部署

### 检查后端是否正确配置

访问以下 URL（用你的实际值替换）：

```
https://your-render-backend.onrender.com/api/push/stats?adminToken=YOUR_ADMIN_TOKEN
```

应该返回：
```json
{
  "success": true,
  "totalSubscriptions": 0,
  "timestamp": "2026-05-10T..."
}
```

如果返回错误或显示"Push service not configured"，说明 VAPID 密钥配置有问题。

### 检查前端是否能订阅

1. 访问前端应用
2. 应该在右下角看到"🔔 订阅通知"的弹窗
3. 点击"订阅"，浏览器会请求通知权限
4. 允许权限后，再次检查 `/api/push/stats` 接口，`totalSubscriptions` 应该变为 1

## 生成管理员令牌

建议使用强随机字符串作为 ADMIN_TOKEN：

```bash
# 使用 OpenSSL（macOS/Linux）
openssl rand -base64 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 常见问题

**Q: 重新部署后仍然显示"Push service not configured"？**
- 确认 VAPID_PUBLIC 和 VAPID_PRIVATE 都已设置
- 确保值没有多余空格
- 检查私钥格式是否正确（应该以 `-----BEGIN PRIVATE KEY-----` 开头）

**Q: 生成的 VAPID 密钥为什么这么长？**
- VAPID 使用 ECDSA P-256 椭圆曲线，Public Key 应约 88 字符，Private Key 约 43 字符
- 这是标准长度，无需修改

**Q: 可以共用不同应用的 VAPID 密钥吗？**
- 可以，但不推荐
- 为了安全起见，每个应用应该使用独立的 VAPID 密钥对

**Q: 如何重新生成 VAPID 密钥？**
- 再次运行 `npx web-push generate-vapid-keys`
- 然后更新所有环境变量
- 旧的订阅仍然有效，但无法发送新通知（直到用户重新订阅）
