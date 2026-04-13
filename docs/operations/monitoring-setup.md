# QCNOTE 监控配置

## 应用监控设置

### 1. 响应时间监控
在 `pages/_app.tsx` 中添加性能监控：

```typescript
// 添加到 _app.tsx
import { useEffect } from 'react';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // 监控页面加载性能
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'navigation') {
          console.log('Page load time:', entry.loadEventEnd - entry.loadEventStart);
        }
      }
    });
    observer.observe({ entryTypes: ['navigation'] });

    return () => observer.disconnect();
  }, []);

  // ... 其他代码
}
```

### 2. 错误监控
在 `pages/_app.tsx` 中添加全局错误处理：

```typescript
// 添加到 _app.tsx
import ErrorBoundary from '../components/ErrorBoundary';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // 全局错误监听
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      // 发送到监控服务
      // sendToMonitoring(event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      // 发送到监控服务
      // sendToMonitoring(event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
      {/* 应用内容 */}
    </ErrorBoundary>
  );
}
```

### 3. API 响应监控
在 `server/index.ts` 中添加中间件：

```typescript
// 添加到 server/index.ts
import fastify from 'fastify';

const app = fastify();

// 请求日志中间件
app.addHook('onRequest', (request, reply, done) => {
  request.startTime = Date.now();
  console.log(`${request.method} ${request.url} - Start`);
  done();
});

app.addHook('onResponse', (request, reply, done) => {
  const duration = Date.now() - (request.startTime || 0);
  console.log(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
  done();
});

// ... 其他代码
```

### 4. 数据库查询监控
在 `server/postgres-client.ts` 中添加查询日志：

```typescript
// 添加到 postgres-client.ts
import { Pool } from 'pg';

const pool = new Pool({
  // ... 配置
});

// 查询监控
pool.on('connect', (client) => {
  client.on('notice', (notice) => {
    console.log('PostgreSQL notice:', notice.message);
  });
});

// 包装查询方法
const originalQuery = pool.query;
pool.query = function(...args) {
  const start = Date.now();
  return originalQuery.apply(this, args).then((result) => {
    const duration = Date.now() - start;
    console.log(`Query executed in ${duration}ms:`, args[0]);
    return result;
  });
};

export { pool };
```

### 5. Redis 监控
在 `server/redis-client.ts` 中添加监控：

```typescript
// 添加到 redis-client.ts
import { Redis } from 'ioredis';

const redis = new Redis({
  // ... 配置
});

// 连接监控
redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('close', () => {
  console.log('Redis connection closed');
});

// 命令监控（开发环境）
if (process.env.NODE_ENV === 'development') {
  redis.on('command', (command) => {
    console.log('Redis command:', command);
  });
}

export { redis };
```

### 6. 健康检查端点
在 `server/index.ts` 中添加健康检查：

```typescript
// 添加到 server/index.ts
app.get('/api/health', async (request, reply) => {
  try {
    // 检查数据库连接
    await pool.query('SELECT 1');

    // 检查Redis连接
    await redis.ping();

    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
        redis: 'ok'
      }
    });
  } catch (error) {
    reply.status(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});
```

### 7. 指标收集
考虑添加 Prometheus 客户端：

```bash
npm install prom-client
```

然后在代码中添加指标收集。

### 8. 日志聚合
设置结构化日志：

```typescript
// lib/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    // 添加文件传输用于生产
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

// 使用示例
logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
logger.error('Database connection failed', { error: err.message });
```

### 9. 警报设置
设置关键指标警报：
- API 响应时间 > 2秒
- 错误率 > 5%
- 数据库连接失败
- Redis 连接失败
- 磁盘空间 < 10%

### 10. 部署监控
在生产环境中：
- 设置 ELK Stack (Elasticsearch, Logstash, Kibana)
- 配置 Grafana 仪表板
- 设置 PagerDuty 或类似服务用于警报

---

实施这些监控后，应用将具有基本的可观察性能力。