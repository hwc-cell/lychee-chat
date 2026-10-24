# Lychee-Chat · Chrome Web Store 发布指南

本文对应版本 `0.2.0`，目标是发布一个 Chrome Manifest V3 扩展。

## 1. 本地安装与验收

1. 打开 Chrome 的 `chrome://extensions`。
2. 打开右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录（`lychee-chat`）。
4. 随便打开一个普通网页（例如 `https://example.com`），点击工具栏里的 Lychee-Chat 图标。
5. 首次安装会自动打开设置页；选择 **Lychee Demo**（无需 API Key），确认模型显示“视觉”，点击“保存更改”。
6. 回到网页，再点一次扩展图标，输入一句话发送。应能看到：
   - 右上角浮窗，可拖动标题栏移动并记住位置
   - 发送时自动截取当前标签页（浮窗不会出现在截图里）
   - 演示模式回复，支持安全 Markdown、表格、代码块和复制代码
   - 会话列表、重命名、置顶、删除
   - 按当前模型上下文窗口计算的用量与压缩面板

### 验收重点

- [ ] 工具栏图标在浅色和深色主题下清晰可见
- [ ] 普通 http/https 页面能打开浮窗
- [ ] 发送时截图可以成功捕获，且截图不含浮窗
- [ ] Markdown 表格、列表、代码块和链接能正常渲染；原始 HTML 不会执行
- [ ] 每个预设模型显示上下文窗口，设置页可修改并保存
- [ ] 聊天窗拖动后位置保留，窗口始终限制在视口内
- [ ] 关闭“页面入口”后悬浮按钮消失，工具栏图标仍能打开聊天
- [ ] 会话刷新页面后仍然存在
- [ ] 切换真实提供商时，API Key、Base URL、模型能保存并读取
- [ ] 自定义提供商保存时会触发域名权限请求
- [ ] `chrome://` 页面不工作属于预期（Chrome 禁止注入）
- [ ] 在设置页和聊天页控制台没有未捕获异常

> 提示：真实模型请求需要你自己的 API Key。先用 Demo 模式验证界面与截图链路。

## 2. 发布前准备

### 2.1 注册开发者账号

1. 打开 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)。
2. 使用 Google 账号登录，接受开发者协议。
3. 支付 **一次性 5 美元** 注册费（同一账号可发布多个扩展）。
4. 完成邮箱验证，并开启 Google 账号的两步验证（2SV）。Chrome Web Store 目前要求开发者账号启用 2SV。

### 2.2 隐私政策必须有一个公开 URL

Chrome Web Store 的隐私标签页要求填写可公开访问的隐私政策 URL。可以：

- 把 `privacy.html` 上传到 GitHub Pages、Cloudflare Pages、Netlify 或自己的静态站点；
- 注意：该页面必须能脱离扩展直接打开（不要依赖 `chrome.*` API）；
- 隐私政策已经填入工作室名称 **Lychee** 和支持邮箱 **help@lycheeledger.cn**，只需完成公开托管；
- 在商店后台填入公开 URL，例如 `https://yourname.github.io/lychee-chat/privacy.html`。

公开免责声明已经托管在：

`https://lycheeledger.cn/web/lychee-chat-disclaimer`

注意：免责声明不能替代 Chrome Web Store 要求的隐私政策 URL，两者都需要可公开访问。商店后台的隐私政策字段请填写独立隐私政策页面的地址。

GitHub Pages 示例：

1. 新建一个公开仓库，放入 `privacy.html`；
2. Settings → Pages → Source 选择 `main` 分支根目录，保存；
3. 等 Pages 构建完成，用生成的 URL 填入商店后台。

### 2.3 商店素材

- 扩展图标：`assets/icon-128.png`（128×128 PNG）
- 至少 1 张截图：建议 1280×800 或 640×400，最多 5 张
- 可选小宣传图 440×280
- 可选大型宣传图 1400×560
- 建议截图内容：
  1. 设置页：17 个提供商入口（含演示与自定义）与模型上下文窗口
  2. 聊天窗：右上角浮窗、Markdown 表格/代码与页面截图
  3. 暗色主题下的聊天窗
  4. 会话管理抽屉
  5. 上下文压缩与模型窗口设置

`store/` 目录提供了由当前界面生成的 1280×800 参考图；正式发布前最好在安装扩展后重新截取真实运行画面，尤其是 0.2.0 新增的 Markdown 和上下文窗口界面。

### 2.4 打包 ZIP

在 `lychee-chat` 目录中执行（不要把整个外层文件夹打进去）：

```bash
cd ~/Documents/lychee-chat
rm -f ../lychee-chat-0.2.0.zip
zip -r ../lychee-chat-0.2.0.zip . \
  -x "dev-*" "preview-*" "store/*" "PUBLISHING.md" "*.zip" ".DS_Store" "dev-chrome-mock.js"
```

检查 ZIP 根目录必须直接看到 `manifest.json`：

```bash
unzip -l ../lychee-chat-0.2.0.zip | head -30
```

不要把以下内容发布出去：

- `dev-options-test.html`、`dev-chat-test.html`、`dev-chrome-mock.js`
- `preview-*.png`
- `PUBLISHING.md`
- 任何本地 API Key、测试账号或私密测试数据

## 3. 创建商店条目

1. Developer Dashboard → “新增项目” / “New item”。
2. 上传 ZIP。
3. 填写商店信息：

### 建议文案

**名称**：Lychee-Chat

**开发者 / 发布者**：Lychee

**支持邮箱**：help@lycheeledger.cn

**简短说明（Summary）**：
在浏览器右上角与视觉模型聊天，每轮自动附带当前页面截图。

**详细说明**：

> Lychee-Chat 是一个面向网页阅读与设计评审的浏览器 AI 助手。
>
> 点击工具栏图标，在当前网页右上角打开一个小聊天窗。你可以让支持视觉能力的模型一起看当前页面，并在每轮对话中附上截图。
>
> 主要功能：
> - 15 家预置提供商：月之暗面、DeepSeek、通义千问、智谱、豆包、MiniMax、MiMo、硅基流动、Claude、GPT、Gemini、Grok、OpenRouter、Ollama、LM Studio
> - 自定义 OpenAI / Anthropic / Gemini / Ollama 兼容接口
> - 每个模型单独确认视觉能力，非视觉模型不会进入聊天
> - 会话搜索、置顶、重命名、删除
> - 安全 Markdown 渲染：标题、列表、表格、引用、代码块，代码可一键复制
> - 每个模型预设上下文窗口，并可在设置中调整用量估算窗口
> - 浮窗可拖动，位置自动记忆；页面悬浮入口可隐藏
> - 本地上下文用量估算与压缩
> - 浅色 / 深色 / 跟随系统主题，可随时切换
> - 流式输出，生成过程中可随时停止
> - 每轮自动附带页面截图，并支持最多 4 张图片附件
> - 截图与附件开关、发送记录与本地会话存储
>
> 自带密钥（BYOK）：API Key 只保存在本机 chrome.storage.local，请求直接发往你选择的模型提供商。开发者不运营中转服务器，不收集你的对话或截图。
>
> 初次使用可选择“Lychee Demo”离线演示模式，无需 API Key 即可体验浮窗、截图和会话流程。

**类别**：Productivity（生产力）

**语言**：中文（简体）；如有精力可再加英文。

**价格**：免费。

**可见性**：先选 **Unlisted（不列出）** 自测，确认稳定后再改 Public。

### 商店图标与截图

- 图标：上传 `assets/icon-128.png`
- 截图：上传 `store/store-*.png` 或你重新截取的真实运行图
- 不要使用带 API Key、个人聊天或真实用户数据的截图

## 4. 隐私标签页怎么填

这是审核最容易卡住的部分。

### 4.1 单一用途说明

> Lychee-Chat 让用户与支持视觉能力的 AI 模型讨论当前打开的网页，并在每轮消息中按需附带当前页面截图。

### 4.2 权限用途说明

- **activeTab**：用户点击扩展图标后访问当前标签页，仅在用户发送消息时捕获当前可见页面截图；不读取所有网站或浏览历史。
- **scripting**：在当前页面注入右上角浮动聊天界面。
- **storage**：在本机保存模型配置、API Key、聊天文本和会话记录。
- **host permissions（特定 API 域名）**：连接用户选择的 AI 提供商 API。
- **optional_host_permissions（任意 https/http）**：仅在用户配置自定义提供商时，按实际域名请求访问权限。
- **web_accessible_resources（<all_urls>）**：为了让聊天 iframe 与图标资源能在用户打开的普通网页上显示。

### 4.3 数据使用披露

按实际行为诚实勾选/填写：

- **网站内容 / 页面截图**：用户发送消息时捕获，并直接发送给用户配置的 AI 提供商。用户主动上传的图片附件同样只用于该次请求。
- **个人通信 / 聊天文本**：直接发送给用户配置的 AI 提供商。
- **图片附件**：最多 4 张，仅随当前请求发送，不持久化到本地。
- **身份验证信息 / API Key**：仅保存在本机，用于向用户选择的提供商发起请求。
- **不出售数据**。
- **不用于广告、画像或与核心功能无关的用途**。
- **不用于信用评估或借贷**。
- **无远程代码**：所有逻辑打包在扩展内。
- **无开发者服务器**：开发者不接收用户数据。

说明：用户选择的第三方模型提供商会对收到的数据按自己的隐私政策处理；这一点要写进隐私政策和商店说明。

### 4.4 数据删除

- 用户可在会话列表逐个删除会话；
- 卸载扩展会移除 `chrome.storage.local` 中的本地配置、API Key 和会话；
- 截图不持久化到本地；
- 提供商侧的数据保留由提供商决定。

## 5. 审核测试说明

在“给审核员的说明”中填写（非常重要，避免因无法测试被拒）：

1. 安装扩展后，打开任意普通网页（如 `https://example.com`），点击 Lychee-Chat 工具栏图标。
2. 打开设置，选择 **Lychee Demo（无需 API Key）**，确认模型为 `Lychee Demo Vision`，保存。
3. 回到网页，再次点击扩展图标，输入任意消息并发送。
4. 可测试流式输出、Markdown 渲染与代码复制、上下文窗口调整、拖动浮窗、隐藏页面入口、截图附带、图片附件上传、主题切换、会话管理、上下文压缩。Demo 模式不会连接任何外部接口。
5. 如需测试真实提供商，请在设置页填入对应提供商的 API Key；审核环境没有开发者密钥，请优先使用 Demo 模式。
6. 注意：`chrome://`、Web Store 页面等受保护页面无法注入聊天窗，这是 Chrome 限制。

## 6. 提交与审核

1. 上传 ZIP。
2. 填写商店信息、隐私标签、分发区域、审核说明。
3. 点击“提交审核”。
4. 审核时间通常为几个工作日，也可能更长；请留意开发者账号邮箱和后台状态。
5. 如被拒绝，逐条对应政策要求修改；常见原因：
   - 没有可公开访问的隐私政策；
   - 权限用途写得过于笼统；
   - 实际行为与隐私披露不一致（截图 / API Key）；
   - 使用远程代码；
   - 审核员无法测试；
   - 描述中声称了不存在的功能。
6. 审核通过后手动点击“发布”。

## 7. 更新版本

1. 修改 `manifest.json` 的 `version`（例如 `0.2.1`）。
2. 重新打包 ZIP。
3. 在 Dashboard 上传新版本，填写更新说明，重新提交审核。
4. 不要直接修改已发布包；所有更新都要走审核。

## 8. 发布后

- 保持隐私政策 URL 可访问；
- 使用支持邮箱 **help@lycheeledger.cn** 接收用户反馈与隐私请求；
- 在更新日志中说明模型/提供商变化；
- 如果某些提供商接口变更，优先修复并尽快发版；
- 用户 API Key 由用户自行管理，不要在任何渠道索取。

## 9. 已知限制（建议写入支持文档）

- 部分网站通过 CSP 禁止扩展 iframe，聊天窗可能无法显示；`chrome://`、Chrome Web Store 页面属于不可注入页面。
- 提供商 API 的模型列表、模型 ID 和图片输入格式可能变化，扩展已尽量兼容但需以官方文档为准。
- 豆包、智谱等部分服务对模型 ID / 部署 ID 有额外要求，建议使用“获取列表”或手动填写正确的部署 ID。
- 截图会发送给你选择的提供商；处理敏感页面时请关闭截图。
- 截图只在发送时捕获；不会后台持续录屏。
- Demo 模式只返回预设回复，不调用模型。

## 10. 参考链接

- [注册 Chrome Web Store 开发者账号](https://developer.chrome.com/docs/webstore/register)
- [Chrome Web Store 开发者后台](https://chrome.google.com/webstore/devconsole)
- [Chrome Web Store 计划政策](https://developer.chrome.com/docs/webstore/program-policies)
- [Chrome Web Store 2026 隐私政策更新](https://developer.chrome.com/blog/cws-policy-updates-2026)
- [Manifest V3 文档](https://developer.chrome.com/docs/extensions/develop)
