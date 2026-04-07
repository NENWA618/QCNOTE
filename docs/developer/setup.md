# 🛠️ 环境搭建指南

本指南将帮助你快速搭建 QCNOTE 的开发环境。无论你是新手还是有经验的开发者，都能按照这些步骤完成环境配置。

---

## 📋 系统要求

### 最低要求
- **操作系统**: Windows 10+ / macOS 10.15+ / Ubuntu 18.04+
- **Node.js**: 18.0 或更高版本
- **内存**: 至少 4GB RAM
- **存储**: 至少 2GB 可用空间

### 推荐配置
- **操作系统**: Windows 11 / macOS 12+ / Ubuntu 20.04+
- **Node.js**: 20.0 LTS
- **内存**: 8GB RAM 或更多
- **存储**: SSD 存储，10GB+ 可用空间

### 必需工具
- **Git**: 2.30+
- **包管理器**: npm 8+ 或 yarn 1.22+
- **代码编辑器**: VS Code (推荐) 或其他现代编辑器

---

## 🚀 快速开始

### 1. 克隆项目

```bash
# 使用 HTTPS
git clone https://github.com/your-org/qcnote.git

# 或使用 SSH (需要配置 SSH 密钥)
git clone git@github.com:your-org/qcnote.git

# 进入项目目录
cd qcnote
```

### 2. 安装依赖

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install

# 或使用 pnpm
pnpm install
```

### 3. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑环境变量 (可选，开发环境可以使用默认值)
# nano .env.local
```

### 4. 启动开发服务器

```bash
# 前端开发服务器
npm run dev

# 后端服务 (新终端)
npm run server:dev
```

### 5. 访问应用

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

---

## 🐳 Docker 方式 (推荐)

### 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 单独构建

```bash
# 构建前端镜像
docker build -t qcnote-frontend .

# 构建后端镜像
docker build -t qcnote-backend ./server

# 运行服务
docker run -p 3000:3000 qcnote-frontend
docker run -p 8000:8000 qcnote-backend
```

---

## 🔧 详细配置

### Node.js 安装

#### Windows
1. 下载 [Node.js LTS](https://nodejs.org/)
2. 运行安装程序
3. 验证安装: `node --version` 和 `npm --version`

#### macOS
```bash
# 使用 Homebrew
brew install node

# 或使用 nvm (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

#### Linux (Ubuntu/Debian)
```bash
# 使用包管理器
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

### Git 配置

```bash
# 设置用户信息
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# 生成 SSH 密钥 (可选)
ssh-keygen -t ed25519 -C "your.email@example.com"
```

### VS Code 插件 (推荐)

安装以下 VS Code 插件以获得最佳开发体验：

- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **TypeScript Importer** - 自动导入
- **Tailwind CSS IntelliSense** - Tailwind 提示
- **GitLens** - Git 增强功能

---

## ⚙️ 环境变量配置

### 必需变量

```env
# 数据库配置
DATABASE_URL="postgresql://user:password@localhost:5432/qcnote"

# Redis 配置
REDIS_URL="redis://localhost:6379"

# OpenAI API
OPENAI_API_KEY="your-openai-api-key"

# JWT 密钥
JWT_SECRET="your-jwt-secret"
```

### 可选变量

```env
# 开发环境
NODE_ENV="development"
PORT=3000

# 日志级别
LOG_LEVEL="debug"

# 文件上传
MAX_FILE_SIZE="10mb"
UPLOAD_PATH="./uploads"
```

---

## 🏗️ 项目结构

```
qcnote/
├── components/          # React 组件
├── pages/              # Next.js 页面
├── lib/                # 工具库和配置
├── server/             # 后端服务
├── public/             # 静态资源
├── styles/             # 样式文件
├── test/               # 测试文件
├── docs/               # 文档
├── .env.example        # 环境变量模板
├── package.json        # 项目配置
├── tailwind.config.js  # Tailwind 配置
└── next.config.js      # Next.js 配置
```

---

## 🔍 验证安装

### 检查 Node.js 和 npm

```bash
node --version    # 应显示 v18.0.0 或更高
npm --version     # 应显示 8.0.0 或更高
```

### 检查项目依赖

```bash
npm list --depth=0
```

### 运行测试

```bash
# 运行单元测试
npm test

# 运行 E2E 测试
npm run test:e2e
```

### 检查服务状态

```bash
# 检查前端服务
curl http://localhost:3000

# 检查后端服务
curl http://localhost:8000/health
```

---

## 🐛 常见问题

### 端口被占用

```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程 (macOS/Linux)
kill -9 <PID>

# 或使用不同端口
npm run dev -- -p 3001
```

### 依赖安装失败

```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 权限问题

```bash
# macOS/Linux 权限修复
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) .

# 或使用非 root 用户
```

### 内存不足

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm run dev
```

---

## 🚀 高级配置

### 使用 nvm 管理 Node.js 版本

```bash
# 安装特定版本
nvm install 20.0.0
nvm use 20.0.0

# 设置默认版本
nvm alias default 20.0.0
```

### 配置 Git Hooks

```bash
# 安装 husky
npm run prepare

# 或手动安装
npx husky install
```

### 设置 Pre-commit Hooks

项目已配置 ESLint 和 Prettier 检查：

```bash
# 手动运行检查
npm run lint
npm run format
```

---

## 📞 获取帮助

如果在搭建过程中遇到问题：

1. **检查文档**: 重新阅读本指南
2. **查看 Issues**: [GitHub Issues](https://github.com/your-org/qcnote/issues)
3. **社区支持**: [GitHub Discussions](https://github.com/your-org/qcnote/discussions)
4. **邮件支持**: dev-support@qcnote.com

---

## 🎯 下一步

环境搭建完成后，你可以：

- [查看架构文档](architecture.md) 了解系统设计
- [运行测试](testing.md) 验证功能
- [开始贡献](contributing.md) 参与开发
- [部署应用](../deployment/index.md) 发布到生产环境

---

*恭喜！你的开发环境已经搭建完成。现在可以开始探索和贡献 QCNOTE 了！*
