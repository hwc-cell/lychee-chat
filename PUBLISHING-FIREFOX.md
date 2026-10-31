# Lychee-Chat · Firefox AMO 发布指南

本文对应 Firefox 版本 `0.3.0`，目标是把扩展发布到 [Add-ons for Firefox（AMO）](https://addons.mozilla.org/developers/)。

## 1. 发布前确认

- Firefox 最低版本：**142**
- 扩展 ID：`lychee-chat@lycheeledger.cn`
- 扩展包：`lychee-chat-firefox-0.3.0.zip`
- 隐私政策：https://lycheeledger.cn/web/lychee-chat-privacy
- 支持邮箱：help@lycheeledger.cn
- 许可证：MIT
- 主页与源码：https://github.com/hwc-cell/lychee-chat

AMO 注册和发布不收取费用。

## 2. 数据采集声明

从 2025 年 11 月起，Firefox 新扩展必须在 `manifest.json` 中声明数据采集和传输权限。本项目已声明：

```json
"browser_specific_settings": {
  "gecko": {
    "id": "lychee-chat@lycheeledger.cn",
    "strict_min_version": "142.0",
    "data_collection_permissions": {
      "required": [
        "websiteContent",
        "personalCommunications",
        "authenticationInfo"
      ]
    }
  }
}
```

对应行为：

- `websiteContent`：用户发送消息时按需捕获当前页面截图，并发送给用户选择的 AI 提供商。
- `personalCommunications`：用户输入的聊天文本和模型返回内容会发送给所选提供商。
- `authenticationInfo`：用户配置的 API Key 会随请求发送给所选提供商，仅保存在本机扩展存储中。

Lychee 不运营中转服务器，不接收、不存储这些数据。第三方提供商按自己的隐私政策处理数据。

用户安装时 Firefox 会展示这些必需数据权限；不接受则不会安装。Demo 模式不会请求任何外部接口。

## 3. 注册开发者账号

1. 打开 https://addons.mozilla.org/developers/
2. 使用 Mozilla Account 登录。
3. 创建或补全开发者资料。
4. 在账号安全设置中建议开启两步验证。

## 4. 构建上传包

在项目根目录执行：

```bash
rm -f ../lychee-chat-firefox-0.3.0.zip
zip -r ../lychee-chat-firefox-0.3.0.zip . \
  -x "store/*" "PUBLISHING*.md" "*.zip" ".DS_Store"
```

ZIP 根目录必须直接包含 `manifest.json`。AMO 支持 ZIP 和 XPI，上传 ZIP 后会由 AMO 完成签名。

可在上传前运行：

```bash
npx web-ext lint --source-dir .
```

`background.service_worker` 在 Firefox 中会被忽略，这是为兼容 Chrome 同时声明后台脚本造成的预期警告。Firefox 实际使用 `background.scripts`。

## 5. 创建 AMO 条目

1. 进入 Developer Hub，点击 **Submit a New Add-on**。
2. 上传 ZIP。
3. 选择分发方式：
   - **On this site（listed）**：公开发布到 AMO，用户可搜索和安装。适合正式发布。
   - **On your own（unlisted）**：不在 AMO 公开列出，只提供签名后的 XPI，适合自托管或内部使用。
4. 等待自动验证完成。

要公开上架，直接选择 **On this site**（listed）。如果只做内部测试或自托管，选择 **On your own**（unlisted）；之后仍可用同一个扩展 ID 上传更高版本的 listed 渠道。

## 6. 填写商店信息

- **名称**：Lychee-Chat
- **摘要**：在浏览器右上角与视觉模型聊天，每轮自动附带当前页面截图。
- **分类**：Productivity
- **语言**：中文（简体）
- **许可证**：MIT
- **隐私政策 URL**：https://lycheeledger.cn/web/lychee-chat-privacy
- **主页**：https://github.com/hwc-cell/lychee-chat
- **支持邮箱**：help@lycheeledger.cn
- **图标**：`store/store-icon-128.png`
- **截图**：上传 0.3.0 当前界面的 1280×800 截图，至少包含设置页、聊天窗和深色模式；不要沿用旧版本界面截图

详细说明可参考 [README.md](README.md) 与 [PUBLISHING.md](PUBLISHING.md) 的功能描述。不要使用包含 API Key、真实聊天记录或个人数据的截图。

## 7. 审核说明

在 Notes for Reviewers 中写明：

> Lychee-Chat requires a user-provided API key for real AI providers. Please test with the built-in **Lychee Demo** provider, which requires no API key and does not make external requests.
>
> Suggested test flow:
> 1. Open a normal web page such as https://example.com.
> 2. Click the Lychee-Chat toolbar button to open the floating chat.
> 3. Select Lychee Demo in settings if it is not already active.
> 4. Send a message. Screenshot capture, streaming reply, Markdown rendering, session history, and context controls can be tested without an API key.
>
> Data transmission to third-party AI providers only occurs when the user configures and sends to a real provider. Demo mode is fully local. Protected browser pages such as about: pages cannot be injected by any extension.
>
> About the `UNSAFE_VAR_ASSIGNMENT / innerHTML` validator warnings:
> The flagged `innerHTML` assignments render this extension's own local UI templates. Dynamic values (provider labels, model IDs, session titles, user messages, and error text) are escaped through the local `esc()` helper before insertion. Assistant content is rendered by the bundled `markdown.js` sanitizer, which escapes all raw HTML and allows only http/https links. Page data, API responses, and remote HTML are never inserted as HTML. The extension does not use `eval`, `new Function`, remote scripts, or dynamically fetched code. The warnings are generic static-analysis notices, not a demonstrated injection path.
>
> The manifest includes both `background.service_worker` and `background.scripts` so that the same package supports Chrome and Firefox. Firefox ignores `service_worker` and runs `background.scripts` as its event page.

如果选择 listed，AMO 会进行人工审核。审核期间请保持隐私政策 URL 可访问，并留意开发者邮箱。

## 8. 签名与发布

- **Unlisted**：自动验证和审核完成后，Developer Hub 会提供签名后的 `.xpi`。可自行托管，用户下载后安装。签名 XPI 在普通 Firefox 中可以持久安装。
- **Listed**：审核通过后扩展会出现在 AMO，用户可直接安装，Firefox 后续会自动更新。

本地临时加载不需要 AMO 签名，但 Firefox 退出后扩展会被移除。

## 9. 从 0.2.0 更新到 0.3.0

AMO 用扩展 ID 识别同一个扩展，本项目始终使用：

```text
lychee-chat@lycheeledger.cn
```

不要删除旧条目，也不要为 0.3.0 改用新的扩展 ID，否则 Firefox 不会把新版本识别为升级。

### 9.1 已在 AMO 公开列表

1. 登录 [Developer Hub](https://addons.mozilla.org/developers/)。
2. 进入 **My Add-ons → Lychee-Chat**。
3. 点击 **Upload New Version**。
4. 上传 `lychee-chat-firefox-0.3.0.zip`。
5. 确认版本渠道为 **On this site**（listed），并按页面提示提交审核。
6. 在版本说明中填写：

   ```text
   Lychee-Chat 0.3.0
   - 全新的 Lychee 视觉系统与更舒适的聊天阅读体验
   - 重新设计设置页、提供商卡片、空状态和消息气泡
   - 优化深色模式、移动端和 680px 小窗布局
   - 功能与本地隐私行为保持不变
   ```

7. 审核通过后，AMO 会发布新版本，已安装用户会在 Firefox 中自动收到更新。

同一个版本号不能重复上传。如果 0.3.0 的审核被拒绝并需要重新提交，请先把 `manifest.json` 提升到 `0.3.1`，再重新打包上传。

### 9.2 之前是 On your own / Unlisted

如果开发者后台里有 Lychee-Chat，但 AMO 公开搜索找不到它，通常说明之前选择的是 **On your own**（自我分发、unlisted）。这种版本只有签名，不会出现在商店。

要公开上架：

1. 仍然进入现有 Lychee-Chat 条目的 **Upload New Version**。
2. 在上传流程的版本渠道中优先选择 **On this site**。AMO 允许同一个扩展 ID 同时存在 listed 与 unlisted 渠道，公开版本号要高于此前的自我分发版本。
3. 如果现有条目没有渠道选择，不要新建一个不同 ID 的扩展。先在 Developer Hub 检查该条目的分发设置；仍无 listed 选项时联系 AMO 支持，说明希望保留同一个 add-on ID 并添加公开渠道。
4. 公开版本审核通过后，在 AMO 搜索检查一次；搜索不到就继续在开发者后台查看条目状态，而不是重复创建扩展。

如果只需要一个新的私人签名 XPI、不要求出现在商店，选择 **On your own** 上传 0.3.0；签名完成后下载 XPI 自行分发即可。

### 9.3 更新后的检查

- AMO 版本号显示 `0.3.0`
- 文件状态为已签名或已公开
- 隐私政策链接可访问
- 扩展管理页显示 Lychee-Chat，且扩展 ID 未改变
- 已安装 0.2.0 的 Firefox 能检测到 0.3.0 更新

## 10. 常见审核问题

- 缺少 `data_collection_permissions`：新扩展必须声明数据采集，不能省略。
- 数据声明与隐私政策不一致：本项目声明网站内容、聊天内容和认证信息会发送给用户自选的第三方提供商。
- 无法测试：必须在审核说明中强调使用 Lychee Demo，无需 API Key。
- 远程代码：本项目不加载远程脚本；所有代码随扩展打包。
- 权限说明不清：`activeTab` 用于用户主动打开聊天后截取当前页；`scripting` 用于注入浮窗；`storage` 保存本地配置和会话；host 权限只用于用户选择的 AI 接口。

## 参考

- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Firefox built-in consent for data collection and transmission](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Developer Hub](https://addons.mozilla.org/developers/)
