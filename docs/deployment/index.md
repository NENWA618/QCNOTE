# 🚀 部署指南

本指南提供了 QCNOTE 的完整部署解决方案，涵盖从开发环境到生产环境的各种部署方式。无论你是个人开发者还是企业用户，都能找到适合的部署方案。

---

## 🎯 部署概览

### 支持的部署方式

| 部署方式 | 适用场景 | 复杂度 | 成本 | 维护难度 |
|---------|---------|--------|------|----------|
| **Vercel** | 前端应用 | ⭐⭐ | 💰💰 | ⭐ |
| **Netlify** | 前端应用 | ⭐⭐ | 💰💰 | ⭐ |
| **Docker** | 全栈应用 | ⭐⭐⭐ | 💰 | ⭐⭐ |
| **AWS** | 企业应用 | ⭐⭐⭐⭐ | 💰💰💰 | ⭐⭐⭐ |
| **Google Cloud** | 企业应用 | ⭐⭐⭐⭐ | 💰💰💰 | ⭐⭐⭐ |
| **自建服务器** | 私有部署 | ⭐⭐⭐⭐⭐ | 💰💰 | ⭐⭐⭐⭐ |

### 部署架构

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │
│   (Next.js)     │◄──►│   (Node.js)     │
│   Vercel/Netlify│    │   Railway/Render│
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
                 │
        ┌─────────────────┐
        │   Database      │
        │   PostgreSQL    │
        │   Supabase      │
        └─────────────────┘
```

---

## ⚡ 快速部署

### Vercel + Render (推荐组合)

#### 部署架构

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

#### 部署清单

在部署前检查以下项：

- [ ] **代码审查** - 所有 PR 已 approved
- [ ] **安全检查** - 无硬编码密钥或凭证
- [ ] **测试通过** - `npm test` 100% 通过
- [ ] **性能基准** - Lighthouse 分数 > 85
- [ ] **环境变量** - 所有必需变量已准备
- [ ] **数据备份** - 已备份旧数据（如升级）
- [ ] **监控配置** - 日志和告警已设置
- [ ] **降级计划** - 故障回退方案已准备

#### 前端部署（Vercel）

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "Add New..." → "Project"
3. 导入 GitHub 仓库 `NENWA618/NOTE`
4. 选择 Framework: **Next.js**
5. 点击 "Import"

**环境变量配置：**

在 **Project Settings → Environment Variables** 中添加：

| 变量 | 值 | 说明 |
|------|---|----|
| `BACKEND_URL` | `https://your-backend.onrender.com` | 后端服务地址，前端将通过本地 `/api/ai/*` 代理到此地址 |
| `NEXT_PUBLIC_CHARACTER_SERVER_URL` | `https://your-backend.onrender.com` | 可选：客户端直接访问后端的备用地址 |
| `NEXT_PUBLIC_VAPID_PUBLIC` | `BMxxxx...` | Web Push 公钥 |

**构建设置：**

在 **Settings → Build & Development** 中：
- Build Command: `npm ci && npm run build`
- Output Directory: `.next`
- Install Command: `npm ci`

#### 后端部署（Render）

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

**创建 Redis：**

1. 点击 "+ New" → **Key Value (Redis)**
2. **Name:** `note-redis` 或自定义
3. **Advanced Option:** 选择 **Persistent** （推荐）
4. 创建后复制 **Internal Connection URL**

**后端环境变量：**

| 变量 | 值 | 说明 |
|------|---|-----|
| `REDIS_URL` | `redis://<internal-url>` | Redis 连接 URL |
| `VAPID_PUBLIC` | `BMxxxx...` | Web Push 公钥 |
| `VAPID_PRIVATE` | `Kpyyy...` | Web Push 私钥 |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API 密钥 |
| `NODE_ENV` | `production` | 环境标志 |
| `LOG_LEVEL` | `info` | 日志级别 |

#### 验证部署

```bash
# 测试后端可用性
curl https://note-api.onrender.com/health

# 应返回 200 OK
```

### Vercel (推荐新手)

#### 自动部署
1. 连接 GitHub 仓库
2. 自动检测 Next.js 项目
3. 一键部署完成

#### 手动部署
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录账户
vercel login

# 部署项目
vercel

# 添加自定义域名
vercel domains add yourdomain.com
```

#### 环境变量配置
```bash
vercel env add DATABASE_URL
vercel env add OPENAI_API_KEY
```

### Netlify

```bash
# 安装 Netlify CLI
npm install -g netlify-cli

# 登录并部署
netlify login
netlify init
netlify deploy --prod
```

### Railway

```bash
# 连接 GitHub
# 自动检测并部署
# 配置环境变量
```

---

## 🐳 Docker 部署

### 使用 Docker Compose

本项目的 `docker-compose.yml` 现在包含三个服务：
- `app`：Next.js 前端应用
- `server`：独立后端 API 服务
- `redis`：缓存服务

前端通过 `BACKEND_URL=http://server:10000` 转发 AI 请求到后端。

#### 完整栈部署

本项目的 `docker-compose.yml` 现在包含三个服务：
- `app`：Next.js 前端应用
- `server`：独立后端 API 服务
- `redis`：缓存服务

前端通过 `BACKEND_URL=http://server:10000` 转发 AI 请求到后端。

#### 完整栈部署
```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}

  backend:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  database:
    image: postgres:15
    environment:
      - POSTGRES_DB=qcnote
      - POSTGRES_USER=qcnote
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

#### 启动服务
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 单容器部署

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# 构建镜像
docker build -t qcnote .

# 运行容器
docker run -p 3000:3000 qcnote
```

---

## ☁️ 云服务部署

### AWS

#### 使用 Elastic Beanstalk
```bash
# 安装 EB CLI
pip install awsebcli

# 初始化项目
eb init

# 创建环境
eb create production-env

# 部署更新
eb deploy
```

#### 使用 ECS (容器)
```bash
# 创建集群
aws ecs create-cluster --cluster-name qcnote-cluster

# 注册任务定义
aws ecs register-task-definition --cli-input-json file://task-definition.json

# 创建服务
aws ecs create-service --cluster qcnote-cluster --service-name qcnote-service --task-definition qcnote-task
```

### Google Cloud

#### 使用 Cloud Run
```bash
# 构建镜像
gcloud builds submit --tag gcr.io/PROJECT-ID/qcnote

# 部署到 Cloud Run
gcloud run deploy qcnote --image gcr.io/PROJECT-ID/qcnote --platform managed
```

#### 使用 App Engine
```yaml
# app.yaml
runtime: nodejs18
env_variables:
  DATABASE_URL: "..."
  OPENAI_API_KEY: "..."
```

```bash
gcloud app deploy
```

### Azure

#### 使用 App Service
```bash
# 创建资源组
az group create --name qcnote-rg --location eastus

# 创建 App Service 计划
az appservice plan create --name qcnote-plan --resource-group qcnote-rg --sku B1

# 创建 Web App
az webapp create --name qcnote --resource-group qcnote-rg --plan qcnote-plan
```

---

## 🖥️ 自建服务器部署

### Linux 服务器

#### 使用 Nginx + PM2

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 部署应用
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Nginx 配置

```nginx
# /etc/nginx/sites-available/qcnote
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### Windows 服务器

#### 使用 IIS

```xml
<!-- web.config -->
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="app.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="DynamicContent">
          <match url="/*" />
          <action type="Rewrite" url="app.js"/>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

---

## 🔧 配置管理

### 环境变量

#### 前端环境变量

| 变量 | 必需 | 描述 | 示例 |
|------|------|------|------|
| `BACKEND_URL` | ✅ 是 | 后端服务地址，用于前端代理 `/api/ai/*` | `https://api.example.com` |
| `NEXT_PUBLIC_CHARACTER_SERVER_URL` | ❌ 可选 | 后端 API 地址 | `https://api.example.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC` | ✅ 是 | Web Push 公钥 | `BMxxxx...` |

#### 后端环境变量

| 变量 | 必需 | 描述 | 默认值 |
|------|------|------|--------|
| `PORT` | ❌ 可选 | 服务器端口 | `10000` |
| `REDIS_URL` | ✅ 是 | Redis 连接字符串 | 无 |
| `VAPID_PUBLIC` | ✅ 是 | Web Push 公钥 | 无 |
| `VAPID_PRIVATE` | ✅ 是 | Web Push 私钥 | 无 |
| `NODE_ENV` | ❌ 可选 | 运行环境 | `production` |
| `LOG_LEVEL` | ❌ 可选 | 日志级别 | `info` |
| `CORS_ORIGIN` | ❌ 可选 | CORS 允许的源 | `*` |

#### 必需变量
```env
# 数据库
DATABASE_URL=postgresql://user:pass@host:5432/db

# AI 服务
OPENAI_API_KEY=sk-...

# 认证
JWT_SECRET=your-secret-key
NEXTAUTH_SECRET=your-secret

# 文件存储
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
```

#### 环境特定配置
```env
# 生产环境
NODE_ENV=production
PORT=3000

# 开发环境
NODE_ENV=development
DEBUG=*

# 测试环境
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/test
```

### 域名配置

#### HTTPS 证书 (Let's Encrypt)

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

---

## 📊 监控运维

### 应用监控

#### 使用 PM2
```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart qcnote

# 监控资源
pm2 monit
```

#### 使用 Docker
```bash
# 查看容器状态
docker ps

# 查看资源使用
docker stats

# 查看日志
docker logs -f container_name
```

### 性能监控

#### Lighthouse 优化目标

| 指标 | 目标 | 优化方案 |
|-----|------|---------|
| Performance | > 85 | 图片优化、代码分割、缓存 |
| Accessibility | > 90 | 完善 ARIA 标签 |
| Best Practices | > 90 | 移除过期脚本、更新依赖 |
| SEO | > 85 | 添加 meta 标签、sitemap |

#### 实施优化

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

#### 使用 Lighthouse
```bash
# 安装 Lighthouse
npm install -g lighthouse

# 运行性能测试
lighthouse http://localhost:3000 --output html
```

#### 使用 Web Vitals
```javascript
// 在 _app.js 中添加
import { reportWebVitals } from '../utils/web-vitals'

export { reportWebVitals }
```

### 日志管理

#### 关键指标

监控以下指标：
- **响应时间** < 200ms
- **错误率** < 0.1%
- **可用性** > 99.9%
- **CPU 使用率** < 70%
- **内存使用率** < 80%

#### 结构化日志配置

```javascript
// 在应用中添加结构化日志
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: "INFO",
  message: "Event occurred",
  data: { userId: "123" }
}));
```

#### 结构化日志
```javascript
// 使用 Winston
const winston = require('winston')

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
})
```

---

## 🔒 安全配置

### 网络安全

#### 防火墙配置
```bash
# UFW (Ubuntu)
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 仅允许特定 IP
sudo ufw allow from 192.168.1.0/24
```

#### SSL/TLS 配置
```nginx
# Nginx SSL 配置
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
}
```

### 应用安全

#### 环境变量安全
```bash
# 使用 .env 文件
# 不要提交到版本控制
echo '.env*' >> .gitignore

# 使用密钥管理服务
# AWS Secrets Manager, Azure Key Vault, etc.
```

#### API 安全
```javascript
// Helmet.js 配置
const helmet = require('helmet')
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}))
```

---

## 🚨 故障排除

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

### 常见问题

#### 部署失败
```bash
# 检查构建日志
npm run build 2>&1 | tee build.log

# 检查环境变量
env | grep -E "(DATABASE|OPENAI|JWT)"

# 验证配置文件
node -c next.config.js
```

#### 性能问题
```bash
# 检查内存使用
free -h
top -p $(pgrep node)

# 检查磁盘空间
df -h

# 检查网络连接
ping -c 4 google.com
```

#### 数据库连接问题
```bash
# 测试数据库连接
psql "postgresql://user:pass@host:5432/db" -c "SELECT 1"

# 检查连接池配置
# 调整连接池大小
```

### 回滚策略

#### 数据备份和恢复

##### 备份策略

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

##### 用户数据导出

支持在 QCNOTE 应用中手动导出数据为 JSON 格式。

#### 快速回滚
```bash
# Git 回滚
git log --oneline -10
git revert HEAD

# Docker 回滚
docker tag old-image:latest
docker-compose up -d

# 云服务回滚
# 使用蓝绿部署或金丝雀部署
```

---

## 📈 扩展与优化

### 水平扩展

#### 负载均衡
```nginx
# Nginx 负载均衡
upstream qcnote_backend {
    server backend1:8000;
    server backend2:8000;
    server backend3:8000;
}

server {
    location /api {
        proxy_pass http://qcnote_backend;
    }
}
```

#### 数据库扩展
```sql
-- 读写分离
-- 主库: 写入操作
-- 从库: 读取操作

-- 分库分表
-- 按用户 ID 分表
-- 按时间分表
```

### 性能优化

#### 前端优化
```javascript
// Next.js 优化
// 1. 静态生成
export async function getStaticProps() { ... }

// 2. 服务端渲染
export async function getServerSideProps() { ... }

// 3. API 路由优化
export default function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400')
  // ...
}
```

#### 后端优化
```javascript
// 缓存策略
const cache = require('memory-cache')

app.use((req, res, next) => {
  const key = req.originalUrl
  const cached = cache.get(key)
  if (cached) {
    return res.send(cached)
  }
  // ... 处理请求
  cache.put(key, result, 300000) // 5分钟缓存
  res.send(result)
})
```

---

## 📞 支持与帮助

### 部署支持
- **文档**: [详细部署指南](detailed-deployment.md)
- **社区**: [GitHub Discussions](https://github.com/your-org/qcnote/discussions)
- **专业服务**: enterprise@qcnote.com

### 监控服务
- **状态页面**: [status.qcnote.com](https://status.qcnote.com)
- **SLA**: 99.9% 可用性保证
- **支持时间**: 24/7 技术支持

---

## ❓ 常见问题 (FAQ)

**Q: 部署后无法访问后端？**
A: 检查环境变量是否正确，尤其是 `REDIS_URL`。Render 自动部署后需要等待服务启动。

**Q: 生产环境看板娘有延迟？**
A: 属于正常现象。优化方案：启用 CDN、压缩脚本、使用 WebP 格式图片。

**Q: 如何零停机更新？**
A: 使用蓝绿部署。先部署到新实例验证，再切换流量。

---

## 📋 检查清单

### 部署前检查
- [ ] 环境变量配置完成
- [ ] 数据库连接正常
- [ ] 域名 DNS 配置
- [ ] SSL 证书安装
- [ ] 防火墙配置

### 部署后验证
- [ ] 应用正常启动
- [ ] 数据库迁移完成
- [ ] API 接口可访问
- [ ] 前端页面正常加载
- [ ] 用户注册登录功能正常

### 监控配置
- [ ] 日志收集系统
- [ ] 性能监控
- [ ] 告警通知
- [ ] 备份策略

---

*选择合适的部署方式，配置好监控和安全措施，你的 QCNOTE 应用就能稳定运行，为用户提供优质的服务！*
