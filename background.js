import { fetchProviderModels, runProviderChat, streamProviderChat } from "./providers.js";

const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEY = "lycheeSettings";
const SECRETS_KEY = "lycheeSecrets";

const DEMO_PROVIDER = {
  id: "demo",
  name: "Lychee Demo",
  baseUrl: "",
  format: "demo",
  local: false,
  selectedModel: "lychee-demo-vision",
  models: [
    { id: "lychee-demo-vision", label: "Lychee Demo Vision", vision: true, contextWindow: 32000 }
  ]
};

const DEMO_REPLY_TEXT =
  "（演示模式）我看到了当前页面的截图。\n\n" +
  "- 页面主路径是清楚的，但顶部信息的权重偏平均。\n" +
  "- 可以把主操作按钮的对比度再提高一级，并让次级操作更安静。\n" +
  "- 表单区域可以沿用 8pt 间距，卡片内边距再增加 4px。\n\n" +
  "配置真实模型后，我会基于你的实际页面给出更具体的建议。";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text) {
  const chunks = [];
  const size = text.length > 300 ? 18 : 12;
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

ext.runtime.onInstalled.addListener(async (details) => {
  try {
    const stored = await ext.storage.local.get(SETTINGS_KEY);
    if (!stored[SETTINGS_KEY]) {
      await ext.storage.local.set({
        [SETTINGS_KEY]: {
          activeProviderId: "demo",
          providers: { demo: DEMO_PROVIDER }
        },
        [SECRETS_KEY]: { providers: {} },
        lycheePrefs: {
          screenshotOn: true,
          autoCompress: true,
          threshold: 70,
          strategy: "摘要较早消息"
        }
      });
    }
  } catch {}
  if (details.reason === "install") {
    ext.runtime.openOptionsPage();
  }
});

ext.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await ext.tabs.sendMessage(tab.id, { type: "LYCHEE_TOGGLE" });
    return;
  } catch {
    // The content script is not on this page yet.
  }

  try {
    await ext.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await ext.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch (error) {
    console.warn("Lychee-Chat could not be injected:", error);
    await flashBadge(tab.id);
    try {
      await ext.action.setTitle({
        tabId: tab.id,
        title: "Lychee-Chat 无法在此页面打开，点击查看原因"
      });
      setTimeout(() => {
        ext.action.setTitle({ tabId: tab.id, title: "打开 Lychee-Chat" }).catch(() => {});
      }, 5000);
    } catch {}
    ext.windows.create({
      url: ext.runtime.getURL(
        `fallback.html?reason=${encodeURIComponent(error?.message || "注入失败")}&url=${encodeURIComponent(tab.url || "")}`
      ),
      type: "popup",
      width: 480,
      height: 520,
      focused: true
    }).catch(() => {});
  }
});

async function flashBadge(tabId) {
  try {
    await ext.action.setBadgeBackgroundColor({ tabId, color: "#b5432d" });
    await ext.action.setBadgeText({ tabId, text: "!" });
    setTimeout(() => ext.action.setBadgeText({ tabId, text: "" }).catch(() => {}), 1800);
  } catch {}
}

function hostPatternFor(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Base URL 格式不正确");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Base URL 只支持 http/https");
  }
  return `${url.protocol}//${url.hostname}/*`;
}

async function assertHostPermission(baseUrl) {
  const pattern = hostPatternFor(baseUrl);
  const granted = await ext.permissions.contains({ origins: [pattern] });
  if (!granted) {
    throw new Error("扩展还没有访问该接口域名的权限，请在设置页保存并允许访问。");
  }
}

function providerNeedsApiKey(provider) {
  return provider.format !== "demo" && !provider.local && provider.format !== "ollama";
}

async function probeProviderEndpoint(provider) {
  const base = String(provider.baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("请填写 Base URL");
  const endpoint = provider.format === "ollama"
    ? `${base.replace(/\/v1$/i, "")}/api/tags`
    : `${base}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("连接测试超时，请检查网络或接口地址");
    throw new Error(`网络连接失败：${error.message || "未知错误"}`);
  } finally {
    clearTimeout(timer);
  }

  const status = Number(response.status) || 0;
  try { await response.body?.cancel(); } catch {}
  const authRequired = status === 401 || status === 403;
  const warning = !authRequired && !response.ok;
  let message = "接口可达";
  if (status >= 500) {
    message = `接口可达，但服务返回 HTTP ${status}`;
  } else if (status === 404 || status === 405) {
    message = `接口可达，但模型接口返回 HTTP ${status}，请检查 Base URL`;
  } else if (!response.ok && !authRequired) {
    message = `接口可达，但返回 HTTP ${status}`;
  }
  return { probe: true, reachable: true, status, authRequired, warning, message };
}

function sanitizeProviderDraft(input) {
  if (!input || typeof input !== "object") throw new Error("提供商配置无效");
  const format = ["openai", "anthropic", "gemini", "ollama", "demo"].includes(input.format)
    ? input.format
    : "openai";
  return {
    id: String(input.id || "custom").slice(0, 80),
    name: String(input.name || "").slice(0, 80),
    format,
    baseUrl: String(input.baseUrl || "").trim().slice(0, 2048),
    apiKey: String(input.apiKey || "").trim().slice(0, 500),
    local: Boolean(input.local)
  };
}

async function getActiveProvider() {
  const { lycheeSettings, lycheeSecrets } = await ext.storage.local.get([
    SETTINGS_KEY,
    SECRETS_KEY
  ]);
  const providerId = lycheeSettings?.activeProviderId;
  const provider = providerId ? lycheeSettings?.providers?.[providerId] : null;
  if (!provider) throw new Error("还没有配置模型，请先打开设置页完成配置。");
  return {
    ...provider,
    apiKey: lycheeSecrets?.providers?.[providerId]?.apiKey || ""
  };
}

async function prepareChatRequest(message) {
  const provider = await getActiveProvider();
  if (provider.format === "demo") {
    return { provider, demo: true, model: provider.selectedModel };
  }
  await assertHostPermission(provider.baseUrl);
  if (!provider.selectedModel) throw new Error("还没有选择模型");
  const modelInfo = (provider.models || []).find((model) => model.id === provider.selectedModel);
  if (!modelInfo || modelInfo.vision !== true) {
    throw new Error("当前模型尚未确认支持视觉，请在设置中重新选择。");
  }
  if (!Array.isArray(message.messages) || !message.messages.length) {
    throw new Error("没有可发送的消息");
  }
  if (typeof message.screenshotDataUrl === "string" && message.screenshotDataUrl.length > 6_000_000) {
    throw new Error("截图过大，请降低截图质量后重试");
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 4) : [];
  for (const attachment of attachments) {
    if (typeof attachment !== "string" || !attachment.startsWith("data:image/")) {
      throw new Error("附件必须是图片 data URL");
    }
  }
  if (attachments.reduce((total, item) => total + item.length, 0) > 10_000_000) {
    throw new Error("附件总大小过大，请减少图片数量");
  }
  const contextSummary = typeof message.contextSummary === "string"
    ? message.contextSummary.trim().slice(0, 8000)
    : "";
  return {
    provider,
    demo: false,
    model: provider.selectedModel,
    messages: message.messages,
    screenshotDataUrl: message.screenshotDataUrl || null,
    attachments,
    contextSummary
  };
}

async function handleCapture(sender) {
  if (!sender.tab?.windowId) throw new Error("无法确定当前标签页");
  const dataUrl = await ext.tabs.captureVisibleTab(sender.tab.windowId, {
    format: "jpeg",
    quality: 72
  });
  if (!dataUrl) throw new Error("没有拿到截图");
  return { dataUrl };
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "LYCHEE_CAPTURE") {
    handleCapture(sender)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "LYCHEE_OPEN_OPTIONS") {
    ext.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "LYCHEE_FETCH_MODELS") {
    (async () => {
      const provider = sanitizeProviderDraft(message.provider);
      if (provider.format === "demo") {
        return { models: [{ id: "lychee-demo-vision", label: "Lychee Demo Vision", vision: true, contextWindow: 32000 }] };
      }
      await assertHostPermission(provider.baseUrl);
      const models = await fetchProviderModels(provider);
      return { models };
    })()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "LYCHEE_TEST_PROVIDER") {
    (async () => {
      const provider = sanitizeProviderDraft(message.provider);
      if (provider.format === "demo") return { text: "演示模式可用" };
      await assertHostPermission(provider.baseUrl);
      const model = String(message.model || "").trim();
      const hasKey = Boolean(provider.apiKey);
      if (message.probeOnly || !model || (providerNeedsApiKey(provider) && !hasKey)) {
        return probeProviderEndpoint(provider);
      }
      const text = await runProviderChat({
        provider,
        model,
        messages: [{ role: "user", text: "请只回复 OK" }],
        maxTokens: 16
      });
      return { text: String(text).slice(0, 200) };
    })()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "LYCHEE_SEND_CHAT") {
    (async () => {
      const prepared = await prepareChatRequest(message);
      if (prepared.demo) {
        await delay(650);
        return {
          text: DEMO_REPLY_TEXT,
          model: prepared.provider.selectedModel,
          providerName: prepared.provider.name || "Lychee Demo"
        };
      }
      const text = await runProviderChat({
        provider: prepared.provider,
        model: prepared.model,
        messages: prepared.messages,
        screenshotDataUrl: prepared.screenshotDataUrl,
        attachments: prepared.attachments,
        maxTokens: 1600
      });
      return {
        text,
        model: prepared.model,
        providerName: prepared.provider.name || ""
      };
    })()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
});

ext.runtime.onConnect.addListener((port) => {
  if (port.name !== "lychee-chat-stream") return;
  let controller = null;
  let started = false;
  let closed = false;

  const post = (message) => {
    if (closed) return;
    try {
      port.postMessage(message);
    } catch {}
  };

  port.onDisconnect.addListener(() => {
    closed = true;
    controller?.abort();
  });

  port.onMessage.addListener(async (message) => {
    if (closed || !message || typeof message.type !== "string") return;
    if (message.type === "abort") {
      controller?.abort();
      return;
    }
    if (message.type !== "start" || started) return;
    started = true;
    controller = new AbortController();

    try {
      const prepared = await prepareChatRequest(message);
      if (prepared.demo) {
        for (const chunk of chunkText(DEMO_REPLY_TEXT)) {
          if (closed || controller.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          await delay(28);
          post({ type: "delta", text: chunk });
        }
        post({ type: "done", text: DEMO_REPLY_TEXT });
      } else {
        const text = await streamProviderChat({
          provider: prepared.provider,
          model: prepared.model,
          messages: prepared.messages,
          screenshotDataUrl: prepared.screenshotDataUrl,
          attachments: prepared.attachments,
          contextSummary: prepared.contextSummary,
          maxTokens: 1600,
          signal: controller.signal,
          onDelta: (delta) => post({ type: "delta", text: delta })
        });
        post({ type: "done", text });
      }
    } catch (error) {
      if (!closed) {
        if (controller.signal.aborted || error.name === "AbortError") {
          post({ type: "aborted" });
        } else {
          post({ type: "error", error: error.message || String(error) });
        }
      }
    } finally {
      setTimeout(() => {
        if (!closed) {
          try {
            port.disconnect();
          } catch {}
        }
      }, 200);
    }
  });
});
