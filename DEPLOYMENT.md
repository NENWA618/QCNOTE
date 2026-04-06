# 完整部署与配置指南

> 从本地开发到生产环境的完整步骤指南

## 📋 目录
1. [本地开发](#本地开发)
2. [生产部署](#生产部署)
3. [环境变量](#环境变量详解)
4. [故障排查](#故障排查)
5. [性能优化](#性能优化)
6. [监控和日志](#监控和日志)
7. [数据备份](#数据备份)
8. [灾难恢复](#灾难恢复)

---

## 本地开发

### 前提条件
- **Node.js 18+** （推荐 18 LTS 或 20+）
- **npm 9+** 或 **yarn 3+**
- **Git** （克隆仓库）
- **Docker** （可选，用于本地 Redis）
- **4GB+ RAM** 和 **2GB 空闲磁盘** （最小要求）

### 快速启动（5 分钟）

#### 1. 克隆并安装

```bash
# 克隆项目
git clone https://github.com/NENWA618/NOTE.git
cd QCNOTE

# 安装依赖
npm install

# 可选：运行测试验证环境正常
npm test
```

#### 2. 生成 VAPID 密钥（推送功能必需）

```bash
# 生成新的 VAPID 密钥对
npx web-push generate-vapid-keys --json

# 输出示例：
# {
#   "publicKey": "BMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
#   "privateKey": "Kpyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
# }
```

**⚠️ 重要：** 保存好这两个密钥，后续配置会用到。

#### 3. 创建本地配置文件

在项目根目录创建 `.env.local`：

```env
# 前端配置
NEXT_PUBLIC_CHARACTER_SERVER_URL=http://localhost:10000
NEXT_PUBLIC_VAPID_PUBLIC=<上面生成的 publicKey>

# 开发模式下可选
DEBUG=*
```

#### 4. 启动前端开发服务器

```bash
npm run dev
```

✅ 访问 http://localhost:3000

### 可选：启动本地后端

如果需要测试高级功能（AI、推送等），启动后端服务：

#### 4.1 启动本地 Redis

```bash
# 使用 Docker（推荐）
docker run -p 6379:6379 -d redis:latest

# 或使用本地 Redis（需要先安装）
redis-server

# 或在 WSL 中
wsl -d Ubuntu redis-server
```

✅ 验证 Redis 运行：
```bash
redis-cli ping
# 应返回 PONG
```

#### 4.2 配置并启动后端

在 `server/` 目录：

```bash
# 安装后端依赖
cd server
npm install

# 创建后端配置
# 在项目根或 server/ 中设置环境变量
$env:PORT = "10000"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:VAPID_PUBLIC = "<上面生成的 publicKey>"
$env:VAPID_PRIVATE = "<上面生成的 privateKey>"

# 启动
npm start
```

✅ 后端监听 http://localhost:10000

### 常用开发命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 生产模式运行
npm start

# 代码检查和格式化
npm run lint
npm run format

# 运行测试
npm test

# 生成 API 文档
npm run docs
```

---

## 生产部署

## 生产部署

### 部署架构

推荐架构：**Vercel（前端）+ Render（后端）**

```
┌─────────────────────────────────────────────────┐
│ 用户浏览器                                       │
└────────────────┬────────────────────────────────┘
                 │
          ┌──────▼──────┬───────────────┐
          │             │               │
     [Vercel]      [CDN]           [其他]
      (前端)       (缓存)          (可选)
          │             │
          └──────┬──────┘
                 │
          ┌──────▼──────┐
          │ Render      │
          │ (后端 API)  │
          └──────┬──────┘
                 │
          ┌──────▼──────┐
          │ Redis       │
          │ (缓存/队列) │
          └─────────────┘
```

### 部署清单

在部署前检查以下项：

- [ ] **代码审查** - 所有 PR 已 approved
- [ ] **安全检查** - 无硬编码密钥或凭证
- [ ] **测试通过** - `npm test` 100% 通过
- [ ] **性能基准** - Lighthouse 分数 > 85
- [ ] **环境变量** - 所有必需变量已准备
- [ ] **数据备份** - 已备份旧数据（如升级）
- [ ] **监控配置** - 日志和告警已设置
- [ ] **降级计划** - 故障回退方案已准备

### 前端部署（Vercel）

#### 步骤 1：连接 GitHub

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New..." → "Project"
3. 导入 GitHub 仓库 `NENWA618/NOTE`
4. 选择 Framework: **Next.js**
5. 点击 "Import"

#### 步骤 2：配置环境变量

在 **Project Settings → Environment Variables** 中添加：

| 变量 | 值 | 说明 |
|------|---|----|
| `NEXT_PUBLIC_CHARACTER_SERVER_URL` | `https://your-backend.onrender.com` | 后端 API 地址 |
| `NEXT_PUBLIC_VAPID_PUBLIC` | `BMxxxx...` | Web Push 公钥 |

#### 步骤 3：配置构建设置

在 **Settings → Build & Development** 中：

- Build Command: `npm ci && npm run build`
- Output Directory: `.next`
- Install Command: `npm ci`

#### 步骤 4：部署

1. 返回 **Deployments** 选项卡
2. 点击 "Deploy" 或推送代码到 main 分支自动部署
3. 等待构建完成（通常 2-5 分钟）

✅ 访问 https://<your-project>.vercel.app

**性能优化建议：**
```json
// vercel.json 中的配置
{
  "buildCommand": "npm run build",
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 0 * * *"
  }],
  "env": {
    "NEXT_PUBLIC_CHARACTER_SERVER_URL": "@character_server_url"
  }
}
```

### 后端部署（Render）

#### 步骤 1：创建 Web Service

1. 访问 [Render Dashboard](https://dashboard.render.com)
2. 点击 "+ New" → **Web Service**
3. 连接 GitHub 仓库
4. 配置：
   - **Name:** `note-api` 或自定义
   - **Root Directory:** `server`
   - **Environment:** `Node`
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Instance Type:** 选择合适规格

#### 步骤 2：创建 Redis

1. 点击 "+ New" → **Key Value (Redis)**
2. **Name:** `note-redis` 或自定义
3. **Advanced Option:** 选择 **Persistent** （推荐）
4. 创建后复制 **Internal Connection URL**

#### 步骤 3：配置后端环境变量

在 Web Service 的 **Environment** 中添加：

| 变量 | 值 | 说明 |
|------|---|-----|
| `REDIS_URL` | `redis://<internal-url>` | Redis 连接 URL |
| `VAPID_PUBLIC` | `BMxxxx...` | Web Push 公钥 |
| `VAPID_PRIVATE` | `Kpyyy...` | Web Push 私钥 |
| `NODE_ENV` | `production` | 环境标志 |
| `LOG_LEVEL` | `info` | 日志级别 |

#### 步骤 4：部署

1. 保存环境变量，Render 自动重新部署
2. 监控 **Logs** 选项卡查看启动日志
3. 等待状态变为绿色 "Running"

✅ 后端 URL：https://note-api.onrender.com

#### 步骤 5：验证连接

```bash
# 测试后端可用性
curl https://note-api.onrender.com/health

# 应返回 200 OK
```

**可选：启动单独的 Worker 进程**

如果需要专门处理后台任务，创建第二个 Web Service：

- **Start Command:** `npm run worker`
- **Same Environment Variables**
- 后端会自动检测并分配任务

---

---

## 环境变量详解

### 前端环境变量

| 变量 | 必需 | 描述 | 示例 |
|------|------|------|------|
| `NEXT_PUBLIC_CHARACTER_SERVER_URL` | ❌ 可选 | 后端 API 地址 | `https://api.example.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC` | ✅ 是 | Web Push 公钥 | `BMxxxx...` |
| `DEBUG` | ❌ 可选 | 调试模式（开发用） | `*` 或 `app:*` |

### 后端环境变量

| 变量 | 必需 | 描述 | 默认值 |
|------|------|------|--------|
| `PORT` | ❌ 可选 | 服务器端口 | `10000` |
| `REDIS_URL` | ✅ 是 | Redis 连接字符串 | 无 |
| `VAPID_PUBLIC` | ✅ 是 | Web Push 公钥 | 无 |
| `VAPID_PRIVATE` | ✅ 是 | Web Push 私钥 | 无 |
| `NODE_ENV` | ❌ 可选 | 运行环境 | `production` |
| `LOG_LEVEL` | ❌ 可选 | 日志级别 | `info` |
| `CORS_ORIGIN` | ❌ 可选 | CORS 允许的源 | `*` |

---

## 故障排查

### 快速检查清单

- [ ] 访问应用首页（检查基本连接）
- [ ] 打开浏览器开发者工具（F12）检查控制台错误
- [ ] 查看网络请求（Network 标签）
- [ ] 检查所有环境变量是否正确设置
- [ ] 确认后端服务运行中
- [ ] 验证 Redis 连接状态

### 常见错误和解决

#### 1. "ENOENT: no such file or directory"
```
原因：构建文件丢失或 node_modules 损坏
解决：
  rm -rf node_modules package-lock.json
  npm ci
  npm run build
```

#### 2. "Cannot find module"
```
原因：依赖安装不完整
解决：
  npm ci        # 使用精确版本重新安装
  npm run build  # 重新构建
```

#### 3. "Redis connection refused"
```
原因：Redis 未运行或 URL 错误
解决：
  # 启动 Redis
  docker run -p 6379:6379 -d redis
  
  # 验证
  redis-cli ping
```

#### 4. "看板娘未显示"
```
原因：脚本加载失败或权限问题
解决：
  # 检查浏览器控制台是否有错误
  # 确保 public/js/waifu.js 存在
  # 尝试无痕窗口
```

---

## 性能优化

### Lighthouse 优化目标

| 指标 | 目标 | 优化方案 |
|-----|------|---------|
| Performance | > 85 | 图片优化、代码分割、缓存 |
| Accessibility | > 90 | 完善 ARIA 标签 |
| Best Practices | > 90 | 移除过期脚本、更新依赖 |
| SEO | > 85 | 添加 meta 标签、sitemap |

### 实施优化

```bash
# 1. 分析包体积
npm run build:analyze

# 2. 启用 SWC 编译（更快）
# next.config.js
module.exports = { swcMinify: true }

# 3. 图片优化
# 使用 next/image 组件

# 4. 启用 Gzip
# Vercel 和 Render 自动启用
```

---

## 监控和日志

### 关键指标

监控以下指标：
- **响应时间** < 200ms
- **错误率** < 0.1%
- **可用性** > 99.9%
- **CPU 使用率** < 70%
- **内存使用率** < 80%

### 日志配置

```typescript
// 在应用中添加结构化日志
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: "INFO",
  message: "Event occurred",
  data: { userId: "123" }
}));
```

---

## 数据备份和恢复

### 备份策略

```bash
# 每日备份
redis-cli BGSAVE

# 验证备份
ls -la dump.rdb

# 恢复备份
redis-cli SHUTDOWN NOSAVE
# 替换 dump.rdb 文件
redis-server
```

### 用户数据导出

支持在 QCNOTE 应用中手动导出数据为 JSON 格式。

---

## 常见问题 (FAQ)

**Q: 部署后无法访问后端？**
A: 检查环境变量是否正确，尤其是 `REDIS_URL`。Render 自动部署后需要等待服务启动。

**Q: 生产环境看板娘有延迟？**
A: 属于正常现象。优化方案：启用 CDN、压缩脚本、使用 WebP 格式图片。

**Q: 如何零停机更新？**
A: 使用蓝绿部署。先部署到新实例验证，再切换流量。

---

**最后更新：** 2026-04-03  
**文档版本：** 2.0（扩展版）
