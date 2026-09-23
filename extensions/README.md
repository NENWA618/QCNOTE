# QCNOTE 网页剪藏扩展

把网页内容剪藏到 QCNOTE 的浏览器扩展，支持 Chrome / Chromium（Manifest V3）和 Firefox（Manifest V2）。

## 工作原理

QCNOTE 是本地优先的：笔记存在浏览器 IndexedDB 中（见 [ARCHITECTURE.md](../docs/ARCHITECTURE.md)），服务器上没有可写的笔记库。因此扩展不会把内容 POST 到服务器，而是：

1. 在网页里提取内容（整页 / 选中文本 / 文章正文）
2. 打开 `<应用地址>/dashboard#qcnote-clip=<base64url(JSON)>`
3. 仪表盘读取 hash（**hash 不会发往服务器**），立即从地址栏清除，然后弹出确认框，显示标题、来源和内容预览
4. 用户点击"保存为笔记"后，才写入当前账号（或访客）的本地存储

任何链接都可以带这个 hash，所以应用把它当作不可信输入处理：严格校验字段（来源只接受 http/https，标题必填，正文最多 100,000 字符，标签最多 20 个），并且**必须经用户确认才会保存**。登录用户要等设备验证完成后才显示确认框，避免笔记误写进访客库。解析逻辑在 [lib/clipImport.ts](../lib/clipImport.ts)，对话框在 [components/ClipImportDialog.tsx](../components/ClipImportDialog.tsx)。

## 加载方式（开发用）

**Chrome / Chromium**

1. 打开 `chrome://extensions/`，开启右上角"开发者模式"
2. 点击"加载已解压的扩展程序"，选择 `extensions/chrome`

**Firefox**

1. 打开 `about:debugging` → "此 Firefox"
2. 点击"加载临时附加组件"，选择 `extensions/firefox/manifest.json`（重启浏览器后失效）

## 使用方法

1. 点击工具栏图标，在弹窗底部的输入框填入 QCNOTE 应用地址（默认 `http://localhost:3000`），点"保存"。地址存放在 `chrome.storage.sync`，只接受 http(s)
2. 打开要剪藏的网页，选择：
   - **剪藏整页**：整个页面的可见文本
   - **剪藏选中内容**：当前选中的文本
   - **剪藏文章**：依次尝试 `article`、`[role="main"]`、`.post-content`、`.entry-content`、`.article-content`、`.content`，找不到则退回整页
3. 扩展会打开（或新开一个标签页到）QCNOTE，确认后保存

## 剪藏数据格式

```typescript
interface ClipData {
  title: string; // 例如 "网页剪藏: <页面标题>"
  content: string; // 纯文本，开头带 "来源: <url>"；超过 100,000 字符会被截断
  url: string; // 来源页面，仅 http(s)
  category?: string; // 默认 "网页剪藏"
  tags?: string[]; // ["网页剪藏", <域名>]，选中剪藏额外带 "选中文本"
  clippedAt?: string; // ISO 8601
}
```

## 文件结构

```
extensions/
├── chrome/            # Manifest V3（permissions: activeTab, storage, scripting）
│   ├── manifest.json
│   ├── popup.html     # 弹窗 UI：三个剪藏按钮 + 应用地址设置
│   ├── popup.js       # 剪藏与打开应用页
│   ├── background.js  # 首次安装时写入默认应用地址
│   └── icons/
├── firefox/           # Manifest V2（permissions: activeTab, storage），文件同上
└── README.md
```

`popup.js` 与 `background.js` 在两个目录里是同一份代码：Chrome 走 `chrome.scripting.executeScript`，Firefox 走 `chrome.tabs.executeScript`（弹窗里做了自动判断）。修改后请同步两份。扩展不需要任何应用域名的 host 权限，也不会向所有网页注入内容脚本。

## 已知限制

- 没有键盘快捷键，也没有打包 / 上架流程（根目录 `npm run build` 只构建 Next.js 应用）
- 图标暂用应用图标缩放，未做专门的 16/48/128 版本
- 只剪藏文本，不保留 HTML 格式，不支持 PDF 和 Safari
- 每次剪藏都会打开应用页并需要手动确认，暂不支持后台静默保存和批量剪藏
- 行为只在开发服务器上验证过一次完整流程（应用页解析、确认、保存）；扩展弹窗本身、Firefox 版尚未在真实浏览器里实测

## 调试

- Chrome：`chrome://extensions/` → 扩展的"检查视图"，或右键工具栏图标 → "检查弹出内容"
- Firefox：`about:debugging` → 扩展 → "检查"
- 不装扩展也能测试应用侧：在浏览器打开 `http://localhost:3000/dashboard#qcnote-clip=<base64url>`（编码方式见 `test/clipImport.test.ts`）

## 许可证

MIT，详见 [LICENSE](../LICENSE)
