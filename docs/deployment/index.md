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
