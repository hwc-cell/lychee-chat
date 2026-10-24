import { inferContextWindow } from "./model-context.js";

const SYSTEM_PROMPT =
  "你是 Lychee-Chat，一个带视觉能力的浏览器助手。你能看到用户随消息附上的当前浏览器页面截图。" +
  "请优先结合截图回答，给出具体、可执行的结论；不要复述截图中已经显而易见的内容。" +
  "默认使用用户正在使用的语言，保持简洁。";

function normalizeBase(baseUrl) {
  const value = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!value) throw new Error("请先填写 Base URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Base URL 格式不正确");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Base URL 只支持 http/https");
  }
  return value;
}

function readApiKey(provider) {
  const key = String(provider.apiKey || "").trim();
  if (!key && !provider.local && provider.format !== "ollama") {
    throw new Error("请先填写 API Key");
  }
  return key;
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const timeout = timeoutSignal(timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: timeout.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，请检查网络或接口地址");
    throw new Error(`网络请求失败：${error.message || "未知错误"}`);
  } finally {
    timeout.clear();
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      raw.slice(0, 300) ||
      `HTTP ${response.status}`;
    throw new Error(`服务返回 ${response.status}：${String(message).slice(0, 400)}`);
  }
  if (!data) throw new Error("服务返回了无法解析的内容");
  return data;
}

function inferVision(provider, modelId, raw) {
  if (provider.format === "anthropic" || provider.format === "gemini") return true;
  const modalities = raw?.architecture?.input_modalities || raw?.input_modalities;
  if (Array.isArray(modalities)) return modalities.includes("image");
  if (raw?.supports_vision === true || raw?.vision === true) return true;
  if (raw?.supports_vision === false || raw?.vision === false) return false;
  if (/(vision|vl|llava|minicpm|gemma3|moondream|pixtral|qwen\d*-vl)/i.test(modelId)) return true;
  return null;
}

function uniqueModels(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const id = String(item?.id || item?.name || item?.model || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      label: String(item.label || item.display_name || item.name || id),
      vision: item.vision,
      contextWindow: inferContextWindow(item)
    });
  }
  return result;
}

export async function fetchProviderModels(provider) {
  const base = normalizeBase(provider.baseUrl);
  const format = provider.format || "openai";

  if (format === "anthropic") {
    const key = readApiKey(provider);
    const data = await fetchJson(`${base}/models?limit=100`, {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      }
    });
    const models = uniqueModels(
      (data.data || []).map((model) => ({
        id: model.id,
        label: model.display_name || model.id,
        vision: true,
        contextWindow: inferContextWindow(model)
      }))
    );
    if (!models.length) throw new Error("没有获取到模型");
    return models.slice(0, 120);
  }

  if (format === "gemini") {
    const key = readApiKey(provider);
    const data = await fetchJson(`${base}/models?pageSize=1000`, {
      headers: { "x-goog-api-key": key }
    });
    const models = uniqueModels(
      (data.models || [])
        .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
        .map((model) => ({
          id: String(model.name || "").replace(/^models\//, ""),
          label: model.displayName || String(model.name || "").replace(/^models\//, ""),
          vision: true,
          contextWindow: inferContextWindow(model)
        }))
    );
    if (!models.length) throw new Error("没有获取到模型");
    return models.slice(0, 120);
  }

  if (format === "ollama") {
    const root = base.replace(/\/v1$/i, "");
    const data = await fetchJson(`${root}/api/tags`, {}, 15000);
    const models = uniqueModels(
      (data.models || []).map((model) => ({
        id: model.name,
        label: model.name,
        vision: inferVision(provider, model.name, model),
        contextWindow: inferContextWindow(model)
      }))
    );
    if (!models.length) throw new Error("Ollama 里还没有已下载的模型");
    return models.slice(0, 120);
  }

  const key = readApiKey(provider);
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const data = await fetchJson(`${base}/models`, { headers });
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
  const models = uniqueModels(
    rows.map((model) => {
      const id = model.id || model.name;
      return {
        id,
        label: model.name || model.display_name || id,
        vision: inferVision(provider, String(id || ""), model),
        contextWindow: inferContextWindow(model)
      };
    })
  );
  if (!models.length) throw new Error("没有获取到模型");
  return models.slice(0, 120);
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  return { mimeType, data: match[2] };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error("没有可发送的消息");
  if (messages.length > 80) throw new Error("消息过多，请先压缩上下文");
  const normalized = messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    text: String(message.text || "").slice(0, 20000)
  }));
  if (normalized[normalized.length - 1].role !== "user") {
    throw new Error("最后一条消息必须来自用户");
  }
  return normalized;
}

function chatUrlFor(provider, base, model, stream = false) {
  if (provider.format === "gemini") {
    const id = String(model).replace(/^models\//, "");
    return `${base}/models/${encodeURIComponent(id)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
  }
  if (provider.format === "anthropic") return `${base}/messages`;
  if (provider.format === "ollama") {
    const root = base.replace(/\/v1$/i, "");
    return `${root}/v1/chat/completions`;
  }
  return `${base}/chat/completions`;
}

function buildRequest(provider, model, normalizedMessages, images = [], maxTokens = 1600, requestOptions = {}) {
  const base = normalizeBase(provider.baseUrl);
  const format = provider.format || "openai";
  const lastIndex = normalizedMessages.length - 1;
  const outputLimit = Math.max(1, Number(maxTokens) || 1600);
  const safeImages = Array.isArray(images) ? images.filter(Boolean).slice(0, 5) : [];
  const stream = Boolean(requestOptions.stream);

  if (format === "anthropic") {
    const key = readApiKey(provider);
    const messages = normalizedMessages.map((message, index) => {
      const content = [];
      if (index === lastIndex) {
        for (const image of safeImages) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: image.mimeType, data: image.data }
          });
        }
      }
      content.push({ type: "text", text: message.text });
      return { role: message.role, content };
    });
    return {
      url: chatUrlFor(provider, base, model),
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model,
          max_tokens: outputLimit,
          stream,
          system: SYSTEM_PROMPT,
          messages
        })
      }
    };
  }

  if (format === "gemini") {
    const key = readApiKey(provider);
    const contents = normalizedMessages.map((message, index) => {
      const parts = [{ text: message.text }];
      if (index === lastIndex) {
        for (const image of safeImages) {
          parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
        }
      }
      return { role: message.role === "assistant" ? "model" : "user", parts };
    });
    return {
      url: chatUrlFor(provider, base, model, stream),
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: outputLimit }
        })
      }
    };
  }

  const key = readApiKey(provider);
  const headers = { "content-type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const messages = normalizedMessages.map((message, index) => {
    if (index === lastIndex && safeImages.length) {
      return {
        role: message.role,
        content: [
          { type: "text", text: message.text },
          ...safeImages.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mimeType};base64,${image.data}` }
          }))
        ]
      };
    }
    return { role: message.role, content: message.text };
  });
  return {
    url: chatUrlFor(provider, base, model),
    options: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages]
      })
    }
  };
}

function extractText(format, data) {
  if (format === "anthropic") {
    const blocks = Array.isArray(data.content) ? data.content : [];
    return blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  }
  if (format === "gemini") {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n");
    if (!text && data.promptFeedback?.blockReason) {
      throw new Error(`请求被模型拦截：${data.promptFeedback.blockReason}`);
    }
    return text;
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").filter(Boolean).join("\n");
  }
  return data.choices?.[0]?.text || "";
}

export async function runProviderChat({ provider, model, messages, screenshotDataUrl, attachments = [], maxTokens = 1600 }) {
  if (!model) throw new Error("还没有选择模型");
  const normalizedMessages = normalizeMessages(messages);
  const images = [];
  const screenshot = parseDataUrl(screenshotDataUrl);
  if (screenshot) images.push(screenshot);
  for (const attachment of Array.isArray(attachments) ? attachments.slice(0, 4) : []) {
    const image = parseDataUrl(attachment);
    if (image) images.push(image);
  }
  const { url, options } = buildRequest(provider, model, normalizedMessages, images, maxTokens);
  const data = await fetchJson(url, options, 90000);
  if (data.error) {
    throw new Error(data.error.message || "模型请求失败");
  }
  const text = extractText(provider.format || "openai", data).trim();
  if (!text) throw new Error("模型返回了空内容");
  return text;
}

async function* readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload) yield payload;
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

async function throwResponseError(response) {
  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}
  const message =
    data?.error?.message ||
    data?.message ||
    (typeof data?.error === "string" ? data.error : null) ||
    raw.slice(0, 300) ||
    `HTTP ${response.status}`;
  throw new Error(`服务返回 ${response.status}：${String(message).slice(0, 400)}`);
}

export async function streamProviderChat({
  provider,
  model,
  messages,
  screenshotDataUrl,
  attachments = [],
  maxTokens = 1600,
  onDelta,
  signal
}) {
  if (!model) throw new Error("还没有选择模型");
  const format = provider.format || "openai";
  const normalizedMessages = normalizeMessages(messages);
  const images = [];
  const screenshot = parseDataUrl(screenshotDataUrl);
  if (screenshot) images.push(screenshot);
  for (const attachment of Array.isArray(attachments) ? attachments.slice(0, 4) : []) {
    const image = parseDataUrl(attachment);
    if (image) images.push(image);
  }

  const { url, options } = buildRequest(
    provider,
    model,
    normalizedMessages,
    images,
    maxTokens,
    { stream: true }
  );
  const response = await fetch(url, { ...options, signal });
  if (!response.ok) await throwResponseError(response);

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "模型请求失败");
    const text = extractText(format, data).trim();
    if (!text) throw new Error("模型返回了空内容");
    onDelta?.(text);
    return text;
  }

  if (!response.body) throw new Error("当前环境不支持读取流式响应");
  let fullText = "";

  for await (const payload of readSse(response)) {
    if (payload === "[DONE]") break;
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      continue;
    }
    if (Array.isArray(data)) data = data[0];
    if (!data) continue;

    if (data.error) {
      throw new Error(data.error.message || data.error.type || "流式请求失败");
    }
    if (data.type === "error") {
      throw new Error(data.error?.message || "流式请求失败");
    }
    if (data.promptFeedback?.blockReason) {
      throw new Error(`请求被模型拦截：${data.promptFeedback.blockReason}`);
    }

    let delta = "";
    if (format === "anthropic") {
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
        delta = data.delta.text || "";
      }
    } else if (format === "gemini") {
      const parts = data.candidates?.[0]?.content?.parts || [];
      delta = parts.map((part) => part?.text || "").join("");
    } else {
      const choice = data.choices?.[0];
      const content = choice?.delta?.content ?? choice?.text;
      if (typeof content === "string") delta = content;
      else if (Array.isArray(content)) delta = content.map((part) => part?.text || "").join("");
    }

    if (delta) {
      fullText += delta;
      onDelta?.(delta);
    }
  }

  fullText = fullText.trim();
  if (!fullText) throw new Error("模型没有返回内容");
  return fullText;
}

export { normalizeBase, parseDataUrl, buildRequest };
