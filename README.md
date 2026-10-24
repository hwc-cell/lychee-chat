# Lychee-Chat

<p align="center">
  <img src="assets/icon-128.png" width="96" height="96" alt="Lychee-Chat">
</p>

Lychee-Chat 是一个面向网页阅读与设计评审的 Chrome AI 助手。点击工具栏图标后，它会在当前网页右上角打开一个可拖动的聊天窗，让你与支持视觉能力的模型讨论当前页面，并可选择在每轮对话中附带页面截图。

- 当前版本：`0.2.0`
- 运行环境：Chrome 116 及以上
- 模型模式：自带 API Key（BYOK）或本地模型
- 许可证：[MIT](LICENSE)

## 功能

### 会看页面的聊天窗口

- 发送消息时按需截取当前可见标签页，并在截图前隐藏聊天浮窗
- 也可手动附上最多 4 张图片，与截图一起发送
- 流式输出，生成过程中可随时停止
- Markdown 渲染：标题、列表、引用、表格、链接与代码块，代码可一键复制
- 支持浅色、深色和跟随系统三种主题

### 只使用视觉模型

- 每个模型都需要明确勾选“支持视觉”后才能参与对话
- 设置页与后台请求会双重检查模型视觉能力
- 可预置模型、手动添加模型 ID，或从提供商接口获取模型列表

### 模型与提供商

内置 15 家真实提供商：

- 月之暗面、DeepSeek、通义千问、智谱、豆包、MiniMax、MiMo、硅基流动
- Claude、GPT、Gemini、Grok、OpenRouter
- Ollama、LM Studio

另有无需 API Key 的 **Lychee Demo** 离线演示模式，以及可配置的 OpenAI、Anthropic、Gemini、Ollama 兼容自定义接口。

每个模型都有预设上下文窗口，也可以在设置页按模型调整，用于本地用量估算和自动压缩。

### 会话与上下文

- 新建、搜索、置顶、重命名和删除会话
- 会话与配置仅保存在本机
- 本地估算上下文用量
- 达到阈值后自动摘要较早消息，也可手动压缩
- 支持“摘要较早消息”“只保留最近 10 轮”“摘要 + 保留关键代码”三种策略

### 界面与交互

- 聊天窗固定在页面右上角，可按住标题栏拖动
- 窗口位置会保存，并在不同页面间恢复
- 可隐藏页面上的荔枝悬浮按钮，之后仍可通过工具栏图标打开聊天
- 设置页与聊天窗保持主题同步

## 安装

### 从源码加载

1. 克隆或下载本仓库：

   ```bash
   git clone https://github.com/hwc-cell/lychee-chat.git
   ```

2. 打开 Chrome 的 `chrome://extensions`。
3. 打开右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的仓库目录。
5. 首次安装会自动打开设置页；也可以点击工具栏中的 Lychee-Chat 图标，再进入“设置”。

### 快速试用

1. 在设置页选择 **Lychee Demo**，无需 API Key。
2. 确认模型带有“视觉”标记，点击“保存更改”。
3. 打开任意普通网页，点击工具栏中的 Lychee-Chat 图标。
4. 输入问题并发送，即可看到演示回复。

Demo 模式只返回本地预设内容，不会请求外部接口。

### 连接真实模型

1. 在设置页选择一个提供商。
2. 填写 API Key；本地 Ollama / LM Studio 通常无需 Key。
3. 如有需要，修改 Base URL。
4. 点击“获取列表”同步模型，或手动填写模型 ID。
5. 确认模型的视觉能力，选择当前模型并保存。
6. 使用自定义接口时，Chrome 会请求对应接口域名的访问权限。

不同提供商的模型 ID、Base URL、图片格式与计费方式可能变化，请以对应官方文档为准。

## 使用

- **截图**：默认每轮附带当前标签页截图，可在输入框下方关闭。
- **附件**：点击输入框右侧的回形针添加图片。
- **Markdown**：模型返回的标题、表格、列表、链接和代码块会自动渲染；代码块右上角可复制。
- **上下文**：点击聊天窗顶部的“上下文”条查看用量、调整压缩设置。
- **上下文窗口**：在设置页右侧“视觉能力确认”卡片中修改当前模型的窗口大小。
- **移动窗口**：按住聊天窗标题栏或六点拖柄拖动。
- **隐藏页面入口**：设置页 →“页面入口”→关闭“在页面上显示荔枝按钮”。隐藏后仍可通过 Chrome 工具栏图标打开聊天。
- **发送**：`Enter` 发送，`Shift + Enter` 换行。

## 隐私与数据

Lychee-Chat 不运营中转服务器，也不包含分析或广告 SDK。

- API Key、模型配置、界面偏好和会话记录保存在 `chrome.storage.local`
- 页面截图和上传图片仅在发送请求时短暂存在，并直接发送给你选择的模型提供商
- 聊天内容直接发送给对应提供商 API，不经过 Lychee 的服务器
- 扩展的全部运行代码都打包在安装包内，不使用远程代码

发送截图前请确认页面不包含不希望交给第三方的敏感信息。第三方提供商的数据处理受其各自隐私政策约束。

完整说明：[隐私政策](privacy.html)

## 项目结构

```text
manifest.json          Chrome Manifest V3 配置
background.js          Service Worker、截图、提供商请求与流式转发
content.js             页面内的 Shadow DOM 浮窗、截图桥接与窗口拖动
chat.html / chat.js    聊天界面、会话、Markdown 与上下文管理
markdown.js            无远程依赖的安全 Markdown 渲染器
model-context.js       模型上下文窗口预设与格式化
providers.js           OpenAI / Anthropic / Gemini / Ollama 适配器
options.html / options.js  提供商、模型与页面入口设置
theme.js / themes.css  主题与共享样式
privacy.html           隐私政策
PUBLISHING.md          Chrome Web Store 发布指南
DISCLAIMER.md          免责声明
LICENSE                MIT 许可证
```

项目不需要构建步骤，所有代码均为原生 HTML、CSS 与 JavaScript 模块。

## 已知限制

- Chrome 不允许扩展注入 `chrome://`、Chrome Web Store 等受保护页面。
- 部分站点的安全策略可能影响扩展界面或截图流程。
- 未连接的提供商、失效的模型 ID、网络问题和额度限制都会导致请求失败，错误会显示在聊天窗中。
- 会话目前仅保存在当前浏览器配置中，不会跨设备同步。
- AI 输出可能有误，请自行核验重要信息。

## 反馈

- 邮箱：help@lycheeledger.cn
- 问题反馈：https://github.com/hwc-cell/lychee-chat/issues

## 免责声明

本项目按“现状”提供，不对模型输出、第三方服务可用性或数据准确性作保证。页面截图可能包含敏感信息，使用前请阅读完整[免责声明](DISCLAIMER.md)。

## 许可证

[MIT License](LICENSE) © 2026 Lychee
