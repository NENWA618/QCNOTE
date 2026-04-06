# 🛠️ 环境搭建指南

快速配置 QCNOTE 开发环境。

---

## 📋 系统要求

### 最低配置
- **操作系统**: Windows 10+ / macOS 10.15+ / Ubuntu 18.04+
- **内存**: 8GB RAM
- **存储**: 5GB 可用空间
- **网络**: 稳定的互联网连接

### 推荐配置
- **操作系统**: Windows 11 / macOS 12+ / Ubuntu 20.04+
- **内存**: 16GB RAM
- **存储**: SSD 存储
- **处理器**: Intel i5 / AMD Ryzen 5 或更高

---

## 🔧 安装依赖

### Node.js 安装

#### Windows
1. 下载 [Node.js 18 LTS](https://nodejs.org/)
2. 运行安装程序
3. 验证安装：
```bash
node --version  # 应显示 v18.x.x
npm --version   # 应显示 8.x.x
```

#### macOS
```bash
# 使用 Homebrew
brew install node@18

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Linux (Ubuntu/Debian)
```bash
# 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### Git 安装

#### Windows
1. 下载 [Git for Windows](https://gitforwindows.org/)
2. 运行安装程序，选择默认选项

#### macOS
```bash
brew install git
# 或从 Xcode Command Line Tools
xcode-select --install
```

#### Linux
```bash
sudo apt update
sudo apt install git
```

### Docker (可选，用于完整环境)

#### Windows
1. 下载 [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. 安装并启动 Docker Desktop

#### macOS
```bash
brew install --cask docker
# 或下载 Docker Desktop
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
```

---

## 📥 项目克隆

```bash
# 克隆项目
git clone https://github.com/your-org/qcnote.git
cd qcnote

# 如果是贡献者，使用 SSH
git clone git@github.com:your-org/qcnote.git
cd qcnote
```

---

## 📦 依赖安装

### 前端依赖
```bash
# 安装主项目依赖
npm install

# 如果网络慢，使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 后端依赖
```bash
# 进入服务端目录
cd server

# 安装后端依赖
npm install
```

### 可选依赖
```bash
# 如果需要 Python 脚本支持
pip install -r scripts/requirements.txt

# 如果需要额外的开发工具
npm install -g typescript @types/node eslint prettier
```

---

## ⚙️ 环境配置

### 环境变量设置

创建 `.env.local` 文件：
```bash
# 复制环境变量模板
cp .env.example .env.local
```

编辑 `.env.local`：
```env
# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

# 数据库配置 (如果使用)
DATABASE_URL="postgresql://user:password@localhost:5432/qcnote"

# AI 服务配置
OPENAI_API_KEY=your-openai-api-key

# 其他服务
REDIS_URL=redis://localhost:6379
```

### 数据库设置 (可选)

如果需要完整功能：

```bash
# 使用 Docker 启动 PostgreSQL
docker run --name qcnote-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:14

# 创建数据库
docker exec -it qcnote-postgres createdb -U postgres qcnote
```

---

## 🚀 启动开发服务器

### 前端开发服务器
```bash
# 在项目根目录
npm run dev
# 或
yarn dev
```

访问 http://localhost:3000

### 后端服务
```bash
# 在新终端窗口
cd server
npm run dev
```

后端服务将在 http://localhost:3001 启动

### 完整环境 (使用 Docker)
```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 🧪 验证安装

### 运行测试
```bash
# 运行前端测试
npm run test

# 运行后端测试
cd server && npm run test

# 运行 E2E 测试
npm run test:e2e
```

### 检查应用状态
```bash
# 检查前端构建
npm run build

# 检查后端构建
cd server && npm run build
```

### 浏览器访问
- 前端应用: http://localhost:3000
- API 文档: http://localhost:3001/docs (如果配置了)

---

## 🔧 开发工具配置

### VS Code 插件推荐
- TypeScript and JavaScript Language Features
- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- Auto Rename Tag
- Bracket Pair Colorizer

### VS Code 设置
创建 `.vscode/settings.json`：
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

---

## 🚨 常见问题

### 端口占用
```bash
# 检查端口占用
netstat -ano | findstr :3000

# 杀死进程 (Windows)
taskkill /PID <PID> /F

# 杀死进程 (macOS/Linux)
kill -9 <PID>
```

### 依赖安装失败
```bash
# 清理缓存
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# 使用不同镜像
npm config set registry https://registry.npmjs.org/
```

### 权限问题
```bash
# macOS/Linux 权限修复
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

### 内存不足
```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm run dev
```

---

## 📞 获取帮助

如果遇到问题：

1. 检查 [故障排除文档](../troubleshooting.md)
2. 查看 [GitHub Issues](https://github.com/your-org/qcnote/issues)
3. 加入 [开发者社区](https://github.com/your-org/qcnote/discussions)
4. 发送邮件至 dev@qcnote.app

---

## 🎯 下一步

环境搭建完成后，你可以：

- [查看项目架构](architecture.md)
- [开始编写代码](contributing.md)
- [运行测试](testing.md)
- [部署应用](deployment.md)

祝你开发愉快！ 🚀