import { inferContextWindow } from "./model-context.js";

const SYSTEM_PROMPT =
  "你是 Lychee-Chat，一个浏览器 AI 助手。" +
  "默认使用用户正在使用的语言，保持简洁。";

const IMAGE_PROMPT =
  "用户可能随消息附上当前页面截图和/或图片附件。" +
  "请优先结合可见图片回答，给出具体、可执行的结论；不要复述图片中已经显而易见的内容，也不要臆测图片中不存在的信息。";

const NO_IMAGE_PROMPT =
  "本轮没有附带页面截图或图片。如果用户询问当前页面，请不要假装能看到页面内容，" +
  "应明确说明本轮没有可用截图，并建议用户开启截图或上传图片。";

const WEB_SEARCH_PROMPT =
  "本轮已由用户开启联网搜索。遇到需要最新信息、实时数据、新闻、价格、版本、政策或事实核验的问题时，" +
  "请通过已声明的 deepseek_web_search 服务端工具检索后再回答，不要仅凭训练记忆编造最新信息，也不要声称无法联网。" +
  "服务端工具会自动执行；不要在正文中描述、伪造或自行编造工具调用。" +
  "如果问题只依赖本轮截图或常识，可以直接回答。";

function currentDateLabel() {
  return new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

function buildSystemPrompt(images, contextSummary = "", webSearch = false) {
  const parts = [SYSTEM_PROMPT, images.length ? IMAGE_PROMPT : NO_IMAGE_PROMPT];
  if (webSearch) parts.push(`当前日期是 ${currentDateLabel()}。`, WEB_SEARCH_PROMPT);
  const summary = String(contextSummary || "").trim().slice(0, 8000);
  if (summary) {
    parts.push(
      "本次会话较早的内容已被压缩为以下摘要。请把它当作已经发生的上下文继续对话，不要直接复述摘要：\n" +
      summary
    );
  }
  return parts.join("\n\n");
}

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
        vision: null,
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
          vision: null,
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
    text: String(message.text || "").slice(0, 20000),
    serverToolCalls: message.role === "assistant" && Array.isArray(message.serverToolCalls)
      ? message.serverToolCalls
      : null
  }));
  const merged = [];
  for (const message of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      previous.text = `${previous.text}\n\n${message.text}`.slice(0, 40000);
      if (message.serverToolCalls?.length) {
        previous.serverToolCalls = [...(previous.serverToolCalls || []), ...message.serverToolCalls];
      }
    } else {
      merged.push({ ...message });
    }
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  if (!merged.length || merged[merged.length - 1].role !== "user") {
    throw new Error("最后一条消息必须来自用户");
  }
  return merged;
}

function supportsDeepSeekWebSearch(provider, model) {
  return provider?.id === "deepseek" &&
    (provider.format || "openai") === "openai" &&
    /^deepseek-flash(?:$|[-.])/i.test(String(model || ""));
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
  const webSearch = Boolean(requestOptions.webSearch) && supportsDeepSeekWebSearch(provider, model);
  const systemPrompt = buildSystemPrompt(safeImages, requestOptions.contextSummary, webSearch);

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
          system: systemPrompt,
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
          systemInstruction: { parts: [{ text: systemPrompt }] },
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
    const entry = { role: message.role, content: message.text };
    if (provider.id === "deepseek" && message.role === "assistant" && message.serverToolCalls?.length) {
      entry.server_tool_calls = message.serverToolCalls;
    }
    return entry;
  });
  const body = {
    model,
    stream,
    messages: [{ role: "system", content: systemPrompt }, ...messages]
  };
  if (provider.id === "deepseek" && typeof requestOptions.thinking === "boolean") {
    body.thinking = { type: requestOptions.thinking ? "enabled" : "disabled" };
  } else if (provider.id === "deepseek" && webSearch) {
    body.thinking = { type: "disabled" };
  }
  if (webSearch) {
    body.tools = [{ type: "deepseek_web_search" }];
  }
  return {
    url: chatUrlFor(provider, base, model),
    options: {
      method: "POST",
      headers,
      body: JSON.stringify(body)
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

export async function runProviderChat({ provider, model, messages, screenshotDataUrl, attachments = [], maxTokens = 1600, webSearch = false, thinking = null, timeoutMs = 90000 }) {
  if (!model) throw new Error("还没有选择模型");
  const normalizedMessages = normalizeMessages(messages);
  const images = [];
  const screenshot = parseDataUrl(screenshotDataUrl);
  if (screenshot) images.push(screenshot);
  for (const attachment of Array.isArray(attachments) ? attachments.slice(0, 4) : []) {
    const image = parseDataUrl(attachment);
    if (image) images.push(image);
  }
  const { url, options } = buildRequest(provider, model, normalizedMessages, images, maxTokens, { webSearch, thinking });
  const data = await fetchJson(url, options, timeoutMs);
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

function sourceFromRaw(raw) {
  const candidate = raw?.url_citation && typeof raw.url_citation === "object" ? raw.url_citation : raw;
  if (!candidate || typeof candidate.url !== "string") return null;
  let url;
  try {
    url = new URL(candidate.url);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  return {
    url: url.href,
    title: String(candidate.title || "").trim().slice(0, 160) || url.hostname
  };
}

function addSource(map, raw) {
  const source = sourceFromRaw(raw);
  if (source && !map.has(source.url)) map.set(source.url, source);
}

function collectOpenAiSources(choice, cited, found) {
  if (!choice) return;
  const annotations = [
    ...(Array.isArray(choice.delta?.annotations) ? choice.delta.annotations : []),
    ...(Array.isArray(choice.annotations) ? choice.annotations : []),
    ...(Array.isArray(choice.message?.annotations) ? choice.message.annotations : [])
  ];
  for (const annotation of annotations) addSource(cited, annotation?.url_citation || annotation);

  const steps = [
    ...(Array.isArray(choice.delta?.server_tool_calls) ? choice.delta.server_tool_calls : []),
    ...(Array.isArray(choice.server_tool_calls) ? choice.server_tool_calls : []),
    ...(Array.isArray(choice.message?.server_tool_calls) ? choice.message.server_tool_calls : [])
  ];
  for (const step of steps) {
    for (const call of Array.isArray(step?.calls) ? step.calls : []) {
      for (const source of Array.isArray(call?.sources) ? call.sources : []) addSource(found, source);
    }
  }

  const eventCall = choice.server_tool_event?.call;
  if (eventCall) {
    for (const source of Array.isArray(eventCall.sources) ? eventCall.sources : []) addSource(found, source);
  }
}

function selectedSources(cited, found) {
  return (cited.size ? [...cited.values()] : [...found.values()]).slice(0, 8);
}

export async function streamProviderChat({
  provider,
  model,
  messages,
  screenshotDataUrl,
  attachments = [],
  maxTokens = 1600,
  contextSummary = "",
  webSearch = false,
  thinking = null,
  onDelta,
  onReasoningDelta,
  onSources,
  onServerToolCalls,
  onSearchStart,
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
    { stream: true, contextSummary, webSearch, thinking }
  );
  const response = await fetch(url, { ...options, signal });
  if (!response.ok) await throwResponseError(response);

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "模型请求失败");
    const text = extractText(format, data).trim();
    if (!text) throw new Error("模型返回了空内容");
    const cited = new Map();
    const found = new Map();
    if (format === "openai") {
      const reasoning = data.choices?.[0]?.message?.reasoning_content;
      if (typeof reasoning === "string" && reasoning) onReasoningDelta?.(reasoning);
      collectOpenAiSources(data.choices?.[0], cited, found);
      const sources = selectedSources(cited, found);
      if (sources.length) onSources?.(sources);
      const calls = data.choices?.[0]?.message?.server_tool_calls;
      if (Array.isArray(calls) && calls.length) onServerToolCalls?.(calls);
    }
    onDelta?.(text);
    return text;
  }

  if (!response.body) throw new Error("当前环境不支持读取流式响应");
  let fullText = "";
  let searchStarted = false;
  let serverToolCalls = null;
  const cited = new Map();
  const found = new Map();

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
      if (format === "openai") {
        const toolEvent = choice?.server_tool_event;
        const toolCall = toolEvent?.call;
        if (!searchStarted &&
            toolEvent?.type === "call_started" &&
            (toolCall?.type === "deepseek_web_search" || /search/i.test(String(toolCall?.kind || "")))) {
          searchStarted = true;
          onSearchStart?.();
        }
        collectOpenAiSources(choice, cited, found);
        const calls = choice?.delta?.server_tool_calls || choice?.server_tool_calls;
        if (Array.isArray(calls) && calls.length) serverToolCalls = calls;
        const reasoning = choice?.delta?.reasoning_content;
        if (typeof reasoning === "string" && reasoning) onReasoningDelta?.(reasoning);
      }
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
  if (webSearch && !serverToolCalls && /(^|\n)\s*<tool_call>/i.test(fullText)) {
    throw new Error("DeepSeek 没有执行服务端联网搜索，而是返回了工具调用文本。请重试。");
  }
  if (format === "openai") {
    const sources = selectedSources(cited, found);
    if (sources.length) onSources?.(sources);
    if (serverToolCalls) onServerToolCalls?.(serverToolCalls);
  }
  return fullText;
}

export { normalizeBase, parseDataUrl, buildRequest, supportsDeepSeekWebSearch };
