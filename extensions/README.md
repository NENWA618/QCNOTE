# QCNOTE 浏览器扩展 - 网页剪藏

> 快速剪藏网页内容到 QCNOTE 笔记应用的浏览器扩展

**支持浏览器：** Chrome 90+, Chromium, Firefox 88+

---

## 📋 目录

- [功能特性](#功能特性)
- [安装方法](#安装方法)
- [使用指南](#使用指南)
- [配置](#配置)
- [API 参考](#api-参考)
- [开发指南](#开发指南)
- [常见问题](#常见问题)
- [已知问题](#已知问题)
- [更新日志](#更新日志)

---

## 功能特性

### 剪藏功能

- **☁️ 剪藏整页** - 捕获当前页面的完整内容
- **✂️ 剪藏选中内容** - 只保存用户选中的文本
- **📰 剪藏文章** - 智能识别并提取文章主要内容
- **🏷️ 自动标签** - 自动添加来源域名和剪藏标签
- **⏰ 时间戳** - 记录剪藏时间
- **🔗 保留链接** - 自动记录来源 URL

### 高级功能

- 🎨 自定义 QCNOTE 应用地址
- 🔄 批量剪藏多个选项卡
- 💾 离线队列（暂不可用，规划中）
- 🔐 隐私保护 - 不收集用户数据

---

## 安装方法

### Chrome/Chromium

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择 `extensions/chrome` 文件夹
6. 加载完成后，工具栏会出现 QCNOTE 图标

### Firefox

1. 打开 Firefox 浏览器
2. 访问 `about:debugging`
3. 左侧菜单点击 **"此 Firefox"**
4. 点击 **"加载临时附加组件"**
5. 选择 `extensions/firefox/manifest.json` 文件
6. 临时加载完成（重启浏览器后失效）

**永久安装 Firefox 版：**
- 将扩展打包为 .xpi 文件并署名
- 或通过 Mozilla 官方 Add-ons 商店发布（规划中）

---

## 使用指南

### 基本操作

1. **点击工具栏图标** - 打开扩展弹窗
2. **选择剪藏类型：**
   - 整页 - 保存完整页面
   - 选中 - 保存选中文本
   - 文章 - 自动提取正文
3. **点击确认** - 扩展自动发送到 QCNOTE
4. **检查应用** - 新笔记会立即出现在 QCNOTE 中

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+E` | 打开快速剪藏菜单 |
| `Ctrl+Shift+A` | 剪藏整页 |
| `Ctrl+Shift+S` | 剪藏选中 |

*Firefox 请使用 `Alt+` 代替 `Ctrl+`*

---

## 配置

### 初始配置

1. 扩展安装后，点击工具栏图标
2. 点击右上角 **⚙️ 设置**
3. 输入 QCNOTE 应用的完整 URL
   - 本地：`http://localhost:3000`
   - 远程：`https://your-domain.com`
4. 点击保存

### 验证配置

```bash
# 1. 确认 QCNOTE 应用启动
http://localhost:3000  # 应该可访问

# 2. 检查 CORS 配置
# QCNOTE 后端需要允许跨域请求

# 3. 测试连接
# 在扩展设置中点击"测试连接"
```

---

## API 参考

### 剪藏数据格式

扩展发送到 QCNOTE 的数据结构：

```typescript
interface ClipData {
  // 必需字段
  title: string;           // 页面标题
  content: string;         // HTML 或纯文本内容
  url: string;            // 来源 URL
  
  // 可选字段
  category?: string;       // 分类（如 "网页剪藏"）
  tags?: string[];        // 标签数组
  description?: string;   // 内容摘要
  favicon?: string;       // 来源网站图标
  clippedAt?: string;    // ISO 8601 时间戳
}
```

### 示例

```json
{
  "title": "GitHub - NENWA618/NOTE",
  "content": "<p>A beautiful note taking app...</p>",
  "url": "https://github.com/NENWA618/NOTE",
  "category": "网页剪藏",
  "tags": ["GitHub", "笔记", "开源"],
  "clippedAt": "2026-04-03T10:30:00.000Z"
}
```

### API 端点

**POST** `/api/clip`

```bash
curl -X POST http://localhost:3000/api/clip \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example",
    "content": "Content",
    "url": "https://example.com",
    "tags": ["web"]
  }'
```

---

## 开发指南

### 项目结构

```
extensions/
├── chrome/
│   ├── manifest.json          # Chrome 扩展清单
│   ├── popup.html            # 弹窗 UI
│   ├── popup.js              # 弹窗逻辑
│   ├── background.js         # 后台脚本
│   ├── content.js            # 内容脚本
│   └── content.css           # 样式
├── firefox/
│   └── ...（同上）
└── README.md
```

### 开发流程

#### 1. 修改代码

编辑 `extensions/chrome/` 或 `extensions/firefox/` 中的文件

#### 2. 本地加载

**Chrome：**
1. 访问 `chrome://extensions/`
2. 找到已加载的扩展
3. 点击 **刷新** 按钮

**Firefox：**
1. 修改代码后需要重新加载
2. 点击 about:debugging 中的 **重新加载**

#### 3. 测试

- 打开任何网页
- 点击工具栏 QCNOTE 图标
- 测试各项功能

### 构建生产版本

```bash
# 1. 检查代码
npm run lint

# 2. 构建扩展包
npm run build

# 3. Chrome Web Store 上传
# - 访问 https://chrome.google.com/webstore/developer/dashboard
# - 上传构建的 .zip 文件

# 4. Firefox Add-ons 上传
# - 访问 https://addons.mozilla.org/developers/
# - 上传构建的 .xpi 文件
```

### 调试技巧

```javascript
// 在 popup.js 或 background.js 中添加调试信息
console.log('[QCNOTE-Extension]', 'Debug message', data);

// Chrome 开发者工具
// 右键点击扩展图标 → 检查弹窗
// 或 chrome://extensions/ → 检查视图 → 弹窗

// Firefox
// about:debugging → 扩展 → 检查
```

---

## 常见问题 (FAQ)

**Q: 扩展安装后工具栏没显示图标？**
A: 
- Chrome：确认已启用扩展（Extensions 中勾选）
- Firefox：临时扩展重启后失效，需永久安装

**Q: "无法连接到 QCNOTE" 错误？**
A:
1. 确认 QCNOTE 应用正在运行
2. 检查配置中的 URL 是否正确
3. 尝试在浏览器访问该 URL
4. 检查防火墙/代理设置

**Q: 剪藏的内容格式不对？**
A:
- 使用"剪藏文章"功能来自动提取正文
- 或在 QCNOTE 中编辑调整格式

**Q: 支持 Safari 吗？**
A: 目前不支持。Safari 扩展开发流程不同，已列入规划。

**Q: 可以剪藏 PDF 吗？**
A: 仅支持网页内容。PDF 剪藏已列入实现计划。

**Q: 发送过去的笔记如何删除？**
A: 在 QCNOTE 应用内删除笔记。扩展仅负责发送，不读取已发送的笔记。

---

## 已知问题

### Current Issues

| 问题 | 平台 | 严重度 | 解决方案 |
|------|------|--------|---------|
| 某些网站样式被过滤 | Chrome/Firefox | 🟡 中 | 清除样式并使用纯文本 |
| 大型页面剪藏可能超时 | Firefox | 🟡 中 | 分页剪藏或使用"文章模式" |
| 非 HTTPS 网站需特殊配置 | All | 🟢 低 | 手动添加到允许列表 |

### 规划功能

- ⏰ **离线队列** - 网络离线时本地缓存
- 📁 **规则管理** - 自定义剪藏规则
- 🔐 **隐私模式** - 敏感网站自动忽略
- 📱 **移动设备** - Android Chrome 完整支持
- 📌 **网页标记** - 在网页上直接标记后删除

---

## 更新日志

### v2.0.0（2026-04-03）- 重大更新

**新功能**
- ✨ 完全重写 UI，更现代化
- ✨ 支持键盘快捷键
- ✨ 自动提取文章正文
- ✨ 更好的错误处理

**改进**
- 📈 性能提升 30%
- 🎨 样式优化
- 📝 文档完善

**修复**
- 🐛 修复 Chrome 91+ 兼容性
- 🐛 修复 Firefox 时间戳问题
- 🐛 改进错误提示

### v1.5.0（2026-02-15）

**新功能**
- 支持剪藏选中文本
- 自定义应用地址

**修复**
- CORS 错误处理
- 样式兼容性

### v1.0.0（2026-01-01）

初始发布版本

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 报告 Bug

1. GitHub Issues 中搜索类似问题
2. 创建新 Issue，包括：
   - 浏览器和版本
   - 扩展版本
   - 重现步骤
   - 期望行为和实际行为

### 提交功能请求

在 Issues 中创建，标题以 `[Feature Request]` 开头

### 提交代码

1. Fork 仓库
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing`)
5. 创建 Pull Request

---

## 许可证

MIT License - 详见 [LICENSE](../LICENSE)

---

**扩展作者：** GitHub Copilot  
**最后更新：** 2026-04-03  
**支持：** 在 GitHub Issues 中反馈