# NOTE 浏览器扩展 - 网页剪藏

这个扩展允许你从任何网页快速剪藏内容到你的 NOTE 应用中。

## 功能特性

- **剪藏整页**: 剪藏当前页面的完整内容
- **剪藏选中内容**: 只剪藏你选中的文本
- **剪藏文章**: 智能识别并剪藏文章主要内容

## 安装方法

### Chrome/Chromium

1. 打开 Chrome 浏览器
2. 在地址栏输入 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extensions/chrome` 文件夹

### Firefox

1. 打开 Firefox 浏览器
2. 在地址栏输入 `about:debugging`
3. 点击"此 Firefox"侧边栏
4. 点击"加载临时附加组件"
5. 选择 `extensions/firefox/manifest.json` 文件

## 配置

1. 安装扩展后，点击扩展图标
2. 如果你的 NOTE 应用不在 `http://localhost:3000`，可以修改存储的 URL
3. 确保 NOTE 应用正在运行并且启用了 CORS

## API 端点

扩展会向你的 NOTE 应用发送 POST 请求到 `/api/clip` 端点，数据格式如下：

```json
{
  "title": "剪藏的标题",
  "content": "剪藏的内容",
  "category": "网页剪藏",
  "tags": ["网页剪藏", "来源域名"],
  "url": "来源URL",
  "clippedAt": "2024-01-01T00:00:00.000Z"
}
```

## 开发

要修改扩展：

1. 编辑 `extensions/chrome/` 或 `extensions/firefox/` 中的文件
2. 重新加载扩展（Chrome: 扩展页面点击刷新；Firefox: 重新加载临时附加组件）

## 注意事项

- 确保 NOTE 应用支持 CORS 以接受来自扩展的请求
- 扩展需要 `activeTab` 权限来访问当前页面内容
- 剪藏的内容会自动添加来源 URL 和剪藏时间戳