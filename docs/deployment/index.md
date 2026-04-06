# 🚀 部署指南

QCNOTE 的部署和运维文档。

---

## 📚 文档导航

### 快速部署
- [Vercel 部署](vercel.md) - 前端快速部署
- [Docker 部署](docker.md) - 容器化部署
- [传统部署](traditional.md) - 服务器部署

### 云服务部署
- [AWS 部署](aws.md) - Amazon Web Services
- [Google Cloud](gcp.md) - Google Cloud Platform
- [Azure 部署](azure.md) - Microsoft Azure
- [Railway 部署](railway.md) - Railway 平台

### 基础设施
- [数据库配置](database.md) - PostgreSQL/Redis 设置
- [CDN 配置](cdn.md) - 静态资源分发
- [监控告警](monitoring.md) - 性能监控和日志
- [备份策略](backup.md) - 数据备份和恢复

### 安全与合规
- [安全加固](security.md) - 安全最佳实践
- [SSL 配置](ssl.md) - HTTPS 证书配置
- [防火墙设置](firewall.md) - 网络安全配置

---

## 🚀 快速开始

### 一键部署 (推荐新手)

#### Vercel (前端)
```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel

# 添加自定义域名
vercel domains add yourdomain.com
```

#### Railway (全栈)
```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 登录并部署
railway login
railway deploy
```

### Docker 部署

#### 使用 Docker Compose
```yaml
version: '3.8'
services:
  qcnote:
    image: qcnote/qcnote:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://...
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=qcnote
      - POSTGRES_USER=qcnote
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
```

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 🏗️ 架构概览

### 系统架构
```
┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   CDN (CloudFlare│
│   (nginx/caddy) │    │   /Fastly/AWS)   │
└─────────────────┘    └─────────────────┘
          │                       │
          ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Web Server    │    │   Static Assets │
│   (Next.js)     │    │   (Images/CSS/JS)│
└─────────────────┘    └─────────────────┘
          │
          ▼
┌─────────────────┐    ┌─────────────────┐
│   API Server    │───▶│   Database      │
│   (Node.js)     │    │   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘
          │
          ▼
┌─────────────────┐    ┌─────────────────┐
│   Cache Layer   │    │   File Storage  │
│   (Redis)       │    │   (S3/MinIO)    │
└─────────────────┘    └─────────────────┘
```

### 部署模式

#### 单体部署
- 前后端部署在一起
- 适合小型应用
- 简化运维

#### 微服务部署
- 前后端分离部署
- API 独立扩展
- 适合大型应用

#### Serverless 部署
- 无服务器架构
- 自动扩缩容
- 按需付费

---

## 📊 性能优化

### 前端优化
- **代码分割**: 按路由分割代码块
- **资源压缩**: Gzip/Brotli 压缩
- **缓存策略**: HTTP 缓存头设置
- **CDN 分发**: 全球 CDN 加速

### 后端优化
- **连接池**: 数据库连接复用
- **缓存策略**: Redis 缓存热点数据
- **异步处理**: 队列处理耗时任务
- **负载均衡**: 多实例水平扩展

### 数据库优化
- **索引优化**: 合理创建索引
- **查询优化**: 避免 N+1 查询
- **读写分离**: 主从复制架构
- **分库分表**: 数据水平拆分

---

## 🔒 安全配置

### 网络安全
```nginx
# nginx 配置示例
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 配置
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # CSP 头
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 应用安全
- **环境变量**: 敏感信息不硬编码
- **输入验证**: 所有输入数据验证
- **SQL 注入防护**: 使用参数化查询
- **XSS 防护**: 输出编码和 CSP

### 数据安全
- **加密传输**: 强制 HTTPS
- **数据加密**: 敏感数据加密存储
- **访问控制**: 基于角色的权限管理
- **审计日志**: 操作日志记录

---

## 📈 监控告警

### 应用监控
- **性能指标**: 响应时间、吞吐量、错误率
- **系统指标**: CPU、内存、磁盘使用率
- **业务指标**: 用户活跃度、功能使用情况

### 日志管理
```bash
# 使用 PM2 管理日志
pm2 start ecosystem.config.js
pm2 logs

# 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 告警配置
- **阈值告警**: 性能指标异常告警
- **错误告警**: 应用错误自动通知
- **可用性监控**: 服务状态监控

---

## 🔄 CI/CD 流水线

### GitHub Actions 示例
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: echo "Deploy to production"
```

### 部署策略
- **蓝绿部署**: 无 downtime 部署
- **金丝雀部署**: 渐进式流量切换
- **回滚策略**: 快速回滚机制

---

## 🛠️ 故障排除

### 常见问题
- **内存泄漏**: 使用 clinic.js 诊断
- **性能问题**: 使用 Artillery 压测
- **数据库连接**: 检查连接池配置
- **缓存失效**: 验证 Redis 配置

### 调试工具
- **应用调试**: 使用 ndb 或 node --inspect
- **数据库调试**: pgBadger 日志分析
- **网络调试**: Wireshark 抓包分析

---

## 📞 支持

部署过程中遇到问题：

- 查看具体平台的部署文档
- 检查 [故障排除指南](../troubleshooting.md)
- 提交 [GitHub Issue](https://github.com/your-org/qcnote/issues)
- 联系技术支持 dev@qcnote.app

---

*选择适合你的部署方式，让 QCNOTE 稳定运行！* 🚀