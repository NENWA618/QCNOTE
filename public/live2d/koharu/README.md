此目录用于本地 Live2D 模型资源，已配置为不再依赖外部 API。

请将模型文件放置为：
- koharu.model3.json
- 相关纹理图片（如 koharu_01.png 等）

然后在 `public/js/waifu.js` 中
`config.waifu.localModels[0].modelUrl` 指向该模型文件路径。

可使用 `live2d-widget-model-koharu` 提供的开源模型，或你自己的 Live2D 模型。
