import {
  DEFAULT_CONTEXT_WINDOW,
  contextWindowForModel,
  formatContextWindow,
  normalizeContextWindow
} from "./model-context.js";
import { providerIcon } from "./provider-icons.js";

const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEY = "lycheeSettings";
const SECRETS_KEY = "lycheeSecrets";
const LAUNCHER_KEY = "lycheeLauncherVisible";

const PROVIDER_ORDER = [
  "moonshot", "deepseek", "qwen", "zhipu", "doubao", "minimax", "mimo", "siliconflow",
  "claude", "openai", "gemini", "grok", "openrouter", "ollama", "lmstudio", "demo", "custom"
];

const KNOWN_HOSTS = new Set([
  "api.moonshot.cn", "api.moonshot.ai", "api.deepseek.com", "api.anthropic.com",
  "api.openai.com", "api.x.ai", "api.xiaomimimo.com", "dashscope.aliyuncs.com",
  "open.bigmodel.cn", "ark.cn-beijing.volces.com", "api.minimax.io", "api.minimaxi.com",
  "api.siliconflow.cn", "openrouter.ai", "generativelanguage.googleapis.com",
  "localhost", "127.0.0.1"
]);

const PRESET_PROVIDERS = [
  {
    id: "moonshot", name: "月之暗面", en: "Kimi", initial: "K",
    logoBg: "#ece8de", logoFg: "#1a1c19",
    baseUrl: "https://api.moonshot.cn/v1", defaultBaseUrl: "https://api.moonshot.cn/v1",
    format: "openai", docs: "https://platform.kimi.com/docs/models",
    selectedModel: "kimi-k3.1-pro",
    models: [
      { id: "kimi-k3.1-pro", label: "Kimi K3.1 Pro", vision: true, recommended: true },
      { id: "kimi-k3", label: "Kimi K3", vision: true },
      { id: "kimi-k2.6", label: "Kimi K2.6", vision: true }
    ]
  },
  {
    id: "deepseek", name: "DeepSeek", en: "DeepSeek", initial: "D",
    logoBg: "#e8f0ff", logoFg: "#2854c7",
    baseUrl: "https://api.deepseek.com", defaultBaseUrl: "https://api.deepseek.com",
    format: "openai", docs: "https://api-docs.deepseek.com/guides/vision",
    selectedModel: "deepseek-flash",
    models: [
      { id: "deepseek-flash", label: "DeepSeek Flash", vision: true, recommended: true },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", vision: false }
    ]
  },
  {
    id: "qwen", name: "通义千问", en: "Alibaba Cloud", initial: "Q",
    logoBg: "#e9f2ff", logoFg: "#2d63d8",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    format: "openai", docs: "https://help.aliyun.com/zh/model-studio/vision",
    selectedModel: "qwen3.8-max",
    models: [
      { id: "qwen3.8-max", label: "Qwen3.8 Max", vision: true, recommended: true },
      { id: "qwen3.7-plus", label: "Qwen3.7 Plus", vision: true },
      { id: "qwen3-vl-plus", label: "Qwen3-VL Plus", vision: true }
    ]
  },
  {
    id: "zhipu", name: "智谱", en: "Zhipu AI", initial: "Z",
    logoBg: "#eceaff", logoFg: "#5048c8",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    format: "openai", docs: "https://docs.bigmodel.cn/cn/guide/start/model-overview",
    selectedModel: "glm-5v-turbo",
    models: [
      { id: "glm-5v-turbo", label: "GLM-5V Turbo", vision: true, recommended: true },
      { id: "glm-5.3-flash", label: "GLM-5.3 Flash", vision: true },
      { id: "glm-4.6v", label: "GLM-4.6V", vision: true }
    ]
  },
  {
    id: "doubao", name: "豆包", en: "ByteDance", initial: "豆",
    logoBg: "#e7f1ff", logoFg: "#2b5dd6",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    format: "openai", docs: "https://www.volcengine.com/docs/ark/model-list",
    selectedModel: "doubao-seed-2-1-lite-260915",
    models: [
      { id: "doubao-seed-2-1-lite-260915", label: "Doubao Seed 2.1 Lite", vision: true, recommended: true }
    ]
  },
  {
    id: "minimax", name: "MiniMax", en: "MiniMax", initial: "MM",
    logoBg: "#ffe9f1", logoFg: "#bd2a5d",
    baseUrl: "https://api.minimax.io/v1", defaultBaseUrl: "https://api.minimax.io/v1",
    format: "openai", docs: "https://platform.minimax.io/docs/guides/models-intro",
    selectedModel: "MiniMax-VL-01",
    models: [
      { id: "MiniMax-VL-01", label: "MiniMax VL 01", vision: true, recommended: true }
    ]
  },
  {
    id: "mimo", name: "MiMo", en: "Xiaomi", initial: "M",
    logoBg: "#ffe8dc", logoFg: "#bd4710",
    baseUrl: "https://api.xiaomimimo.com/v1", defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    format: "openai", docs: "https://mimo.mi.com/docs/quick-start/first-api-call",
    selectedModel: "mimo-v2.6-pro",
    models: [
      { id: "mimo-v2.6-pro", label: "MiMo-V2.6 Pro", vision: true, recommended: true },
      { id: "mimo-v2.6-flash", label: "MiMo-V2.6 Flash", vision: true }
    ]
  },
  {
    id: "siliconflow", name: "硅基流动", en: "SiliconFlow", initial: "S",
    logoBg: "#eef7e4", logoFg: "#3f752b",
    baseUrl: "https://api.siliconflow.cn/v1", defaultBaseUrl: "https://api.siliconflow.cn/v1",
    format: "openai", docs: "https://www.siliconflow.cn/models",
    selectedModel: "Qwen/Qwen3-VL-235B-A22B-Instruct",
    models: [
      { id: "Qwen/Qwen3-VL-235B-A22B-Instruct", label: "Qwen3-VL 235B", vision: true, recommended: true },
      { id: "zai-org/GLM-5.3-Flash", label: "GLM-5.3 Flash", vision: true }
    ]
  },
  {
    id: "claude", name: "Claude", en: "Anthropic", initial: "C",
    logoBg: "#f4e5d6", logoFg: "#9b4f2f",
    baseUrl: "https://api.anthropic.com/v1", defaultBaseUrl: "https://api.anthropic.com/v1",
    format: "anthropic", docs: "https://platform.claude.com/docs/en/models/overview",
    selectedModel: "claude-sonnet-5-5",
    models: [
      { id: "claude-fable-5-1", label: "Claude Fable 5.1", vision: true },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", vision: true },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", vision: true, recommended: true },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", vision: true }
    ]
  },
  {
    id: "openai", name: "GPT", en: "OpenAI", initial: "G",
    logoBg: "#e7f1e9", logoFg: "#1f5b3c",
    baseUrl: "https://api.openai.com/v1", defaultBaseUrl: "https://api.openai.com/v1",
    format: "openai", docs: "https://developers.openai.com/api/docs/models",
    selectedModel: "gpt-6-astra",
    models: [
      { id: "gpt-6-astra", label: "GPT-6 Astra", vision: true, recommended: true },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", vision: true },
      { id: "gpt-6-luna", label: "GPT-6 Luna", vision: true }
    ]
  },
  {
    id: "gemini", name: "Gemini", en: "Google", initial: "✦",
    logoBg: "#e8efff", logoFg: "#2f5bd0",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    format: "gemini", docs: "https://ai.google.dev/gemini-api/docs/models",
    selectedModel: "gemini-3-pro-preview",
    models: [
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", vision: true, recommended: true },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", vision: true },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash-Lite", vision: true }
    ]
  },
  {
    id: "grok", name: "Grok", en: "xAI", initial: "X",
    logoBg: "#ececea", logoFg: "#151515",
    baseUrl: "https://api.x.ai/v1", defaultBaseUrl: "https://api.x.ai/v1",
    format: "openai", docs: "https://docs.x.ai/developers/models",
    selectedModel: "grok-4.7",
    models: [
      { id: "grok-4.7", label: "Grok 4.7", vision: true, recommended: true },
      { id: "grok-4.6", label: "Grok 4.6", vision: true },
      { id: "grok-4.5", label: "Grok 4.5", vision: true }
    ]
  },
  {
    id: "openrouter", name: "OpenRouter", en: "模型聚合", initial: "OR",
    logoBg: "#efeaff", logoFg: "#5a42d2",
    baseUrl: "https://openrouter.ai/api/v1", defaultBaseUrl: "https://openrouter.ai/api/v1",
    format: "openai", docs: "https://openrouter.ai/models",
    selectedModel: "anthropic/claude-sonnet-5.5",
    models: [
      { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", vision: true, recommended: true },
      { id: "openai/gpt-6-astra", label: "GPT-6 Astra", vision: true },
      { id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", vision: true }
    ]
  },
  {
    id: "ollama", name: "Ollama", en: "本地运行", initial: "O",
    logoBg: "#f4efe4", logoFg: "#3b3b35",
    baseUrl: "http://localhost:11434", defaultBaseUrl: "http://localhost:11434",
    format: "ollama", local: true, docs: "https://ollama.com/library",
    selectedModel: "qwen3-vl:8b",
    models: [
      { id: "qwen3-vl:8b", label: "Qwen3-VL 8B", vision: true, recommended: true },
      { id: "qwen3-vl:4b", label: "Qwen3-VL 4B", vision: true },
      { id: "qwen2.5vl:7b", label: "Qwen2.5-VL 7B", vision: true },
      { id: "llava:13b", label: "LLaVA 13B", vision: true },
      { id: "minicpm-v:8b", label: "MiniCPM-V 8B", vision: true }
    ]
  },
  {
    id: "lmstudio", name: "LM Studio", en: "本地运行", initial: "LM",
    logoBg: "#eef0f3", logoFg: "#3d4552",
    baseUrl: "http://localhost:1234/v1", defaultBaseUrl: "http://localhost:1234/v1",
    format: "openai", local: true, docs: "https://lmstudio.ai/docs/app/api",
    selectedModel: "qwen3-vl-8b-instruct",
    models: [
      { id: "qwen3-vl-8b-instruct", label: "Qwen3-VL 8B", vision: true, recommended: true },
      { id: "llava-v1.6-mistral-7b", label: "LLaVA 1.6 7B", vision: true }
    ]
  },
  {
    id: "demo", name: "Lychee Demo", en: "无需 Key · 试用", initial: "L",
    logoBg: "#fff0ef", logoFg: "#c43a35",
    baseUrl: "", defaultBaseUrl: "", format: "demo", docs: "",
    selectedModel: "lychee-demo-vision",
    models: [
      { id: "lychee-demo-vision", label: "Lychee Demo Vision", vision: true, recommended: true }
    ]
  },
  {
    id: "custom", name: "自定义提供商", en: "自定义接口", initial: "+",
    logoBg: "#f1ede3", logoFg: "#6d746a",
    baseUrl: "", defaultBaseUrl: "", format: "openai", docs: "",
    selectedModel: null, models: []
  }
];

const state = {
  providers: [],
  activeProviderId: "claude",
  visionFilter: true,
  dirty: false,
  savedSnapshot: null,
  loading: false,
  showPageLauncher: true
};

for (const provider of PRESET_PROVIDERS) {
  for (const model of provider.models) {
    model.contextWindow = contextWindowForModel(model.id);
  }
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const icons = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.8 12S6.4 6 12 6s9.2 6 9.2 6-3.6 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16.2v.1"/></svg>'
};

let toastTimer = null;

function clone(value) {
  return structuredClone(value);
}

function activeProvider() {
  return state.providers.find((provider) => provider.id === state.activeProviderId);
}

function formatLabel(provider) {
  return {
    openai: "OpenAI 兼容",
    anthropic: "Anthropic 兼容",
    gemini: "Gemini 原生",
    ollama: "Ollama",
    demo: "演示模式"
  }[provider.format] || "OpenAI 兼容";
}

function providerDetail(provider) {
  if (provider.id === "custom") return `${formatLabel(provider)} · 自定义接口`;
  return {
    moonshot: "Kimi · OpenAI 兼容接口",
    deepseek: "DeepSeek · OpenAI 兼容接口",
    qwen: "阿里云百炼 · OpenAI 兼容接口",
    zhipu: "智谱开放平台 · OpenAI 兼容接口",
    doubao: "火山方舟 · OpenAI 兼容接口",
    minimax: "MiniMax · OpenAI 兼容接口",
    mimo: "小米 MiMo · OpenAI 兼容接口",
    siliconflow: "SiliconFlow · 多模型路由",
    claude: "Anthropic · Messages API",
    openai: "OpenAI · 官方接口",
    gemini: "Google · Gemini API",
    grok: "xAI · OpenAI 兼容接口",
    openrouter: "OpenRouter · 多模型聚合",
    ollama: "本地运行 · Ollama 原生接口",
    lmstudio: "本地运行 · OpenAI 兼容接口",
    demo: "离线演示 · 不请求外部接口"
  }[provider.id] || provider.en;
}

function providerStatus(provider) {
  if (provider.format === "demo") return { className: "is-local", label: "演示" };
  if (provider.local) return { className: "is-local", label: "本地" };
  if (provider.apiKey?.trim()) return { className: "is-online", label: "已配置" };
  return { className: "is-offline", label: "待配置" };
}

function keyRequired(provider) {
  return provider.format !== "demo" && !provider.local && provider.format !== "ollama";
}

function showToast(message, warning = false) {
  $("#toastText").textContent = message;
  const toast = $("#toast");
  toast.classList.toggle("is-warning", warning);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

function markDirty() {
  state.dirty = true;
  updateSaveState();
}

function updateSaveState() {
  const disabled = !state.dirty || state.loading;
  $("#saveBtn").disabled = disabled;
  $("#saveBtnInline").disabled = disabled;
  $("#saveState").innerHTML = `<span class="dot"></span>${state.dirty ? "有未保存的更改" : "所有更改已保存"}`;
  $("#saveState").classList.toggle("is-dirty", state.dirty);
}

function snapshot() {
  return clone({ providers: state.providers, activeProviderId: state.activeProviderId });
}

function renderProviderGrid() {
  const ordered = [...state.providers].sort(
    (a, b) => PROVIDER_ORDER.indexOf(a.id) - PROVIDER_ORDER.indexOf(b.id)
  );
  $("#providerGrid").innerHTML = ordered.map((provider) => {
    const selected = provider.id === state.activeProviderId;
    const visionModels = (provider.models || []).filter((model) => model.vision === true).length;
    const icon = providerIcon(provider.id);
    const meta = provider.id === "custom"
      ? (provider.models?.length ? `${provider.models.length} 个模型 · 待确认` : "自定义接口")
      : provider.local
        ? `本地 · ${visionModels} 个视觉模型`
        : `${visionModels} 个视觉模型`;
    return `
      <button class="provider-card${selected ? " is-selected" : ""}${provider.id === "custom" ? " is-custom" : ""}"
        type="button" data-provider="${esc(provider.id)}" aria-pressed="${selected}"
        style="--logo-bg:${provider.logoBg};--logo-fg:${provider.logoFg}">
        <span class="provider-logo">
          ${icon
            ? `<img src="${esc(icon)}" alt="">`
            : `<span class="provider-logo-fallback">${esc(provider.initial || "+")}</span>`}
        </span>
        <span class="provider-info">
          <span class="provider-name">${esc(provider.name)}</span>
          <span class="provider-sub">${esc(provider.en)}</span>
          <span class="provider-meta"><span class="dot"></span>${esc(meta)}</span>
        </span>
        <span class="provider-check">${icons.check}</span>
      </button>`;
  }).join("");
}

function modelRowMarkup(provider, model) {
  const selected = provider.selectedModel === model.id;
  const blocked = model.vision !== true;
  const unknown = model.vision === null;
  const visionLabel = model.vision === true ? "视觉" : model.vision === false ? "不支持" : "待确认";
  const visionTitle = model.vision === true
    ? "已确认支持图片输入，点击可撤销确认"
    : model.vision === false
      ? "该模型被标记为不支持图片输入"
      : "请确认该模型是否支持图片输入";
  return `
    <div class="model-row${selected ? " is-selected" : ""}${blocked ? " is-blocked" : ""}${unknown ? " is-unconfirmed" : ""}"
      data-model-id="${esc(model.id)}">
      <label class="model-select">
        <input type="radio" name="activeModel" value="${esc(model.id)}"${selected ? " checked" : ""}${blocked ? " disabled" : ""}>
        <span class="radio" aria-hidden="true"></span>
        <span class="model-copy">
          <span class="model-title">${esc(model.label || model.id)}${model.recommended ? '<span class="tag">推荐</span>' : ""}</span>
          <span class="model-meta-line">
            <span class="model-id">${esc(model.id)}</span>
            <span class="model-context">${formatContextWindow(model.contextWindow || DEFAULT_CONTEXT_WINDOW)} 上下文</span>
          </span>
        </span>
      </label>
      <label class="vision-toggle" title="${visionTitle}">
        <input type="checkbox" data-vision${model.vision === true ? " checked" : ""}${model.vision === false ? " disabled" : ""}>
        <span class="vision-pill">${icons.eye}<span>${visionLabel}</span></span>
      </label>
    </div>`;
}

function renderSelectedModelCard(provider) {
  const model = (provider.models || []).find((item) => item.id === provider.selectedModel);
  if (!model || model.vision !== true) {
    $("#selectedModelCard").innerHTML = `
      <div class="selected-model-head">
        <span class="selected-model-name">${icons.alert} 尚未选择视觉模型</span>
        <span class="tag tag-warn">需确认</span>
      </div>
      <div class="selected-model-sub">选择或确认一个支持图片输入的模型</div>
      <div class="vision-state is-warning">${icons.alert} 保存前必须确认视觉能力</div>`;
    return;
  }
  const presetWindow = contextWindowForModel(model.id);
  const currentWindow = normalizeContextWindow(model.contextWindow) || presetWindow;
  const isCustomWindow = currentWindow !== presetWindow;
  $("#selectedModelCard").innerHTML = `
    <div class="selected-model-head">
      <span class="selected-model-name">${icons.eye}${esc(model.label || model.id)}</span>
      <span class="tag">视觉</span>
    </div>
    <div class="selected-model-sub">${esc(provider.name)} · ${esc(model.id)}</div>
    <div class="vision-state">${icons.check} 视觉能力已确认</div>
    <div class="context-window-editor">
      <div class="context-window-head">
        <span>上下文窗口</span>
        ${isCustomWindow
          ? `<button class="context-window-reset" type="button" data-reset-context="${esc(model.id)}">恢复预设 ${formatContextWindow(presetWindow)}</button>`
          : `<span class="context-window-preset">预设 ${formatContextWindow(presetWindow)}</span>`}
      </div>
      <div class="context-window-control">
        <input id="contextWindowInput" type="number" inputmode="numeric"
          value="${currentWindow}" aria-label="上下文窗口 tokens">
        <span>tokens</span>
      </div>
      <p class="context-window-hint">用于本地用量估算和自动压缩，不会修改提供商的实际限制。请输入大于 0 的 tokens 数。</p>
    </div>`;
}

function renderModels() {
  const provider = activeProvider();
  const models = provider.models || [];
  const visible = models.filter((model) => !state.visionFilter || model.vision !== false);
  const visionCount = models.filter((model) => model.vision === true).length;
  const hiddenCount = models.filter((model) => model.vision === false).length;
  const pendingCount = models.filter((model) => model.vision === null).length;

  $("#modelCountNote").textContent = models.length ? `${visionCount} 个视觉模型` : "等待同步";
  $("#visionFilter").checked = state.visionFilter;

  if (!models.length) {
    $("#modelList").innerHTML = '<div class="model-empty"><strong>还没有模型</strong><span>点击“获取列表”，或手动添加一个模型 ID。</span></div>';
  } else if (!visible.length) {
    $("#modelList").innerHTML = '<div class="model-empty"><strong>没有可用的视觉模型</strong><span>关闭“仅显示视觉模型”，再确认模型能力。</span></div>';
  } else {
    $("#modelList").innerHTML = visible.map((model) => modelRowMarkup(provider, model)).join("");
  }

  $("#hiddenNote").textContent = pendingCount
    ? `${pendingCount} 个模型待确认视觉能力`
    : state.visionFilter && hiddenCount
      ? `已隐藏 ${hiddenCount} 个不支持视觉的模型`
      : "全部模型均支持视觉";

  renderSelectedModelCard(provider);
}

function updateSidebar(provider) {
  const model = (provider.models || []).find((item) => item.id === provider.selectedModel);
  $("#sidebarModel").textContent = model ? model.label || model.id : "尚未选择模型";
  $("#navModelBadge").textContent = provider.name.length > 7 ? `${provider.name.slice(0, 6)}…` : provider.name;
  const status = providerStatus(provider);
  $("#sidebarStatus").textContent = status.label;
}

function updateStatusChip() {
  const provider = activeProvider();
  const status = providerStatus(provider);
  $("#detailStatus").className = `status-chip ${status.className}`;
  $("#detailStatus").innerHTML = `<span class="dot"></span>${status.label}`;
  $("#sidebarStatus").textContent = status.label;
}

function renderDetail() {
  const provider = activeProvider();
  if (!provider) return;
  const status = providerStatus(provider);

  const icon = providerIcon(provider.id);
  $("#detailLogo").style.setProperty("--logo-bg", provider.logoBg);
  $("#detailLogo").style.setProperty("--logo-fg", provider.logoFg);
  const detailLogoImage = $("#detailLogoImage");
  const detailLogoText = $("#detailLogoText");
  if (icon) {
    detailLogoImage.src = icon;
    detailLogoImage.hidden = false;
    detailLogoText.hidden = true;
  } else {
    detailLogoImage.hidden = true;
    detailLogoImage.removeAttribute("src");
    detailLogoText.hidden = false;
    detailLogoText.textContent = provider.initial || "+";
  }
  $("#detailName").textContent = provider.name;
  $("#detailSub").textContent = providerDetail(provider);
  $("#detailStatus").className = `status-chip ${status.className}`;
  $("#detailStatus").innerHTML = `<span class="dot"></span>${status.label}`;

  $("#docsLink").style.display = provider.id === "custom" || !provider.docs ? "none" : "inline-flex";
  if (provider.docs) $("#docsLink").href = provider.docs;

  $("#customFields").hidden = provider.id !== "custom";
  if (provider.id === "custom") {
    $("#customName").value = provider.name === "自定义提供商" ? "" : provider.name;
    $("#customFormat").value = provider.format || "openai";
  }

  $("#apiKeyField").hidden = !keyRequired(provider);
  $("#baseUrlField").hidden = provider.format === "demo";
  $("#apiKey").value = provider.apiKey || "";
  $("#apiKey").type = "password";
  $("#apiKey").placeholder = provider.apiKey ? "已保存，输入新 Key 可替换" : "输入 API Key";
  $("#baseUrl").value = provider.baseUrl || "";
  $("#baseUrl").placeholder = provider.id === "custom" ? "https://api.example.com/v1" : "";

  if (provider.id !== "custom") {
    $("#customModelRow").hidden = true;
    $("#customModelInput").value = "";
    $("#customVision").checked = false;
  }

  updateSidebar(provider);
  renderModels();
  updateSaveState();
}

function renderAll() {
  renderProviderGrid();
  renderDetail();
}

function providerDraft(provider) {
  return {
    id: provider.id,
    name: provider.name,
    format: provider.format,
    baseUrl: String(provider.baseUrl || "").trim(),
    apiKey: String(provider.apiKey || "").trim(),
    local: Boolean(provider.local)
  };
}

function validateBaseUrl(provider) {
  if (provider.format === "demo") return null;
  if (!provider.baseUrl?.trim()) return "请填写 Base URL";
  try {
    const url = new URL(provider.baseUrl);
    if (!["https:", "http:"].includes(url.protocol)) return "Base URL 只支持 http/https";
  } catch {
    return "Base URL 格式不正确";
  }
  return null;
}

function validateConnection(provider) {
  const baseError = validateBaseUrl(provider);
  if (baseError) return baseError;
  if (keyRequired(provider) && !provider.apiKey?.trim()) return "请填写 API Key";
  return null;
}

function validateProvider(provider) {
  const connection = validateConnection(provider);
  if (connection) return connection;
  const model = (provider.models || []).find((item) => item.id === provider.selectedModel);
  if (!model) return "请选择一个模型";
  if (model.vision !== true) return "所选模型尚未确认支持视觉能力";
  return null;
}

function ensurePermissionFor(provider) {
  if (provider.format === "demo") return Promise.resolve(true);
  let url;
  try {
    url = new URL(provider.baseUrl);
  } catch {
    return Promise.resolve(false);
  }
  if (KNOWN_HOSTS.has(url.hostname)) return Promise.resolve(true);
  return ext.permissions.request({
    origins: [`${url.protocol}//${url.hostname}/*`]
  });
}

function mergeSavedModels(savedModels, baseModels = []) {
  const presets = new Map(baseModels.map((model) => [model.id, model]));
  return savedModels.map((savedModel) => {
    const base = presets.get(savedModel.id) || {};
    return {
      ...base,
      ...savedModel,
      id: savedModel.id,
      label: savedModel.label || base.label || savedModel.id,
      vision: savedModel.vision === true ? true : savedModel.vision === false ? false : null,
      contextWindow: normalizeContextWindow(savedModel.contextWindow) ||
        normalizeContextWindow(base.contextWindow) ||
        contextWindowForModel(savedModel.id)
    };
  });
}

async function loadSettings() {
  let stored = {};
  try {
    stored = await ext.storage.local.get([SETTINGS_KEY, SECRETS_KEY, LAUNCHER_KEY]);
  } catch (error) {
    showToast(`读取配置失败：${error.message}`, true);
  }

  state.providers = clone(PRESET_PROVIDERS);
  state.showPageLauncher = stored[LAUNCHER_KEY] !== false;
  $("#showPageLauncher").checked = state.showPageLauncher;
  const saved = stored[SETTINGS_KEY];
  const secrets = stored[SECRETS_KEY];

  if (saved?.providers) {
    for (const [id, savedProvider] of Object.entries(saved.providers)) {
      let provider = state.providers.find((item) => item.id === id);
      if (!provider) {
        provider = {
          id,
          name: savedProvider.name || "自定义提供商",
          en: "自定义接口",
          initial: "+",
          logoBg: "#f1ede3",
          logoFg: "#6d746a",
          baseUrl: savedProvider.baseUrl || "",
          defaultBaseUrl: "",
          format: savedProvider.format || "openai",
          docs: "",
          selectedModel: savedProvider.selectedModel || null,
          models: Array.isArray(savedProvider.models) ? mergeSavedModels(savedProvider.models) : []
        };
        state.providers.push(provider);
      }
      provider.baseUrl = savedProvider.baseUrl ?? provider.baseUrl;
      provider.format = savedProvider.format ?? provider.format;
      provider.local = Boolean(savedProvider.local ?? provider.local);
      provider.selectedModel = savedProvider.selectedModel ?? provider.selectedModel;
      if (Array.isArray(savedProvider.models)) {
        provider.models = mergeSavedModels(savedProvider.models, provider.models);
      }
      if (id === "custom" && savedProvider.name) provider.name = savedProvider.name;
      provider.apiKey = secrets?.providers?.[id]?.apiKey || "";
    }
  }

  if (saved?.activeProviderId && state.providers.some((provider) => provider.id === saved.activeProviderId)) {
    state.activeProviderId = saved.activeProviderId;
  }

  state.dirty = false;
  state.savedSnapshot = snapshot();
  renderAll();
}

function buildStoredSettings() {
  const providers = {};
  const secrets = {};
  for (const provider of state.providers) {
    providers[provider.id] = {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl.trim(),
      format: provider.format,
      local: Boolean(provider.local),
      selectedModel: provider.selectedModel || null,
      models: (provider.models || []).map((model) => ({
        id: model.id,
        label: model.label || model.id,
        vision: model.vision === true ? true : model.vision === false ? false : null,
        contextWindow: normalizeContextWindow(model.contextWindow) || contextWindowForModel(model.id)
      }))
    };
    if (provider.apiKey?.trim()) {
      secrets[provider.id] = { apiKey: provider.apiKey.trim() };
    }
  }
  return {
    settings: { activeProviderId: state.activeProviderId, providers },
    secrets: { providers: secrets }
  };
}

async function saveSettings() {
  const provider = activeProvider();
  const validation = validateProvider(provider);
  if (validation) {
    showToast(validation, true);
    return;
  }

  const permissionPromise = ensurePermissionFor(provider);
  state.loading = true;
  updateSaveState();
  try {
    const granted = await permissionPromise;
    if (!granted) throw new Error("需要允许访问该接口域名才能保存");
    const { settings, secrets } = buildStoredSettings();
    await ext.storage.local.set({
      [SETTINGS_KEY]: settings,
      [SECRETS_KEY]: secrets
    });
    state.dirty = false;
    state.savedSnapshot = snapshot();
    renderAll();
    showToast("设置已保存");
  } catch (error) {
    showToast(error.message || "保存失败", true);
  } finally {
    state.loading = false;
    updateSaveState();
  }
}

async function testConnection() {
  const provider = activeProvider();
  const validation = validateProvider(provider);
  if (validation) {
    showToast(validation, true);
    return;
  }
  const permissionPromise = ensurePermissionFor(provider);
  $("#testBtn").disabled = true;
  $("#testBtn").classList.add("is-loading");
  try {
    const granted = await permissionPromise;
    if (!granted) throw new Error("需要允许访问该接口域名才能测试");
    const response = await ext.runtime.sendMessage({
      type: "LYCHEE_TEST_PROVIDER",
      provider: providerDraft(provider),
      model: provider.selectedModel
    });
    if (!response?.ok) throw new Error(response?.error || "连接失败");
    $("#detailStatus").className = "status-chip is-online";
    $("#detailStatus").innerHTML = '<span class="dot"></span>连接正常';
    $("#sidebarStatus").textContent = "连接正常";
    showToast("连接正常");
  } catch (error) {
    showToast(error.message || "连接失败", true);
  } finally {
    $("#testBtn").disabled = false;
    $("#testBtn").classList.remove("is-loading");
  }
}

function mergeFetchedModels(provider, fetched) {
  const byId = new Map((provider.models || []).map((model) => [model.id, model]));
  for (const raw of fetched.slice(0, 120)) {
    const id = String(raw?.id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      if (existing.vision === null && typeof raw.vision === "boolean") existing.vision = raw.vision;
      if (!existing.label && raw.label) existing.label = raw.label;
      continue;
    }
    const vision = raw.vision === true ? true : raw.vision === false ? false : null;
    const model = {
      id,
      label: raw.label || id,
      vision,
      source: "fetched",
      contextWindow: normalizeContextWindow(raw.contextWindow) || contextWindowForModel(id)
    };
    provider.models.push(model);
    byId.set(id, model);
  }
  if (!provider.selectedModel) {
    const first = (provider.models || []).find((model) => model.vision === true);
    if (first) provider.selectedModel = first.id;
  }
  if (provider.models.length > 200) provider.models = provider.models.slice(0, 200);
}

async function fetchModels() {
  const provider = activeProvider();
  const validation = validateConnection(provider);
  if (validation) {
    showToast(validation, true);
    return;
  }
  const permissionPromise = ensurePermissionFor(provider);
  $("#fetchBtn").disabled = true;
  $("#fetchBtn").classList.add("is-loading");
  $("#modelList").innerHTML = '<div class="loading-row"><span class="spinner"></span>正在获取模型列表…</div>';
  try {
    const granted = await permissionPromise;
    if (!granted) throw new Error("需要允许访问该接口域名才能获取模型");
    const response = await ext.runtime.sendMessage({
      type: "LYCHEE_FETCH_MODELS",
      provider: providerDraft(provider)
    });
    if (!response?.ok) throw new Error(response?.error || "获取模型失败");
    mergeFetchedModels(provider, response.models || []);
    markDirty();
    renderModels();
    renderProviderGrid();
    updateSidebar(provider);
    const pending = (provider.models || []).filter((model) => model.vision === null).length;
    showToast(`已获取 ${(response.models || []).length} 个模型${pending ? "，请确认未知模型的视觉能力" : ""}`);
  } catch (error) {
    renderModels();
    showToast(error.message || "获取模型失败", true);
  } finally {
    $("#fetchBtn").disabled = false;
    $("#fetchBtn").classList.remove("is-loading");
  }
}

function addCustomModel() {
  const provider = activeProvider();
  const id = $("#customModelInput").value.trim();
  if (!id) {
    showToast("请输入模型 ID", true);
    $("#customModelInput").focus();
    return;
  }
  if (!/^[A-Za-z0-9._:\/-]+$/.test(id)) {
    showToast("模型 ID 只能包含字母、数字和 . _ : / -", true);
    return;
  }
  if ((provider.models || []).some((model) => model.id === id)) {
    showToast("这个模型已经在列表里了", true);
    return;
  }
  if (!$("#customVision").checked) {
    showToast("请先勾选“支持视觉”", true);
    $("#customVision").focus();
    return;
  }
  provider.models.push({
    id,
    label: id,
    vision: true,
    source: "manual",
    contextWindow: contextWindowForModel(id)
  });
  provider.selectedModel = id;
  $("#customModelInput").value = "";
  $("#customVision").checked = false;
  $("#customModelRow").hidden = true;
  markDirty();
  renderModels();
  renderProviderGrid();
  updateSidebar(provider);
  updateSaveState();
  showToast("已添加并选中该视觉模型");
}

function discardChanges() {
  if (!state.dirty) {
    showToast("没有需要撤销的更改");
    return;
  }
  const restored = clone(state.savedSnapshot);
  state.providers = restored.providers;
  state.activeProviderId = restored.activeProviderId;
  state.dirty = false;
  renderAll();
  showToast("已撤销未保存的更改");
}

function bindEvents() {
  $("#providerGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-provider]");
    if (!card) return;
    if (state.activeProviderId === card.dataset.provider) return;
    state.activeProviderId = card.dataset.provider;
    markDirty();
    renderAll();
  });

  $("#visionFilter").addEventListener("change", () => {
    state.visionFilter = $("#visionFilter").checked;
    renderModels();
  });

  $("#modelList").addEventListener("change", (event) => {
    const row = event.target.closest(".model-row");
    if (!row) return;
    const provider = activeProvider();
    const model = (provider.models || []).find((item) => item.id === row.dataset.modelId);
    if (!model) return;

    if (event.target.matches('input[name="activeModel"]')) {
      if (model.vision !== true) return;
      provider.selectedModel = model.id;
      markDirty();
      renderModels();
      updateSidebar(provider);
      updateSaveState();
      return;
    }

    if (event.target.matches("[data-vision]")) {
      model.vision = event.target.checked ? true : null;
      if (event.target.checked && !provider.selectedModel) {
        provider.selectedModel = model.id;
      }
      if (!event.target.checked && provider.selectedModel === model.id) {
        const fallback = (provider.models || []).find((item) => item.id !== model.id && item.vision === true);
        provider.selectedModel = fallback ? fallback.id : null;
      }
      markDirty();
      renderModels();
      renderProviderGrid();
      updateSidebar(provider);
      updateSaveState();
    }
  });

  function updateContextWindow(model, value) {
    const normalized = normalizeContextWindow(value);
    if (!normalized) {
      showToast("请输入大于 0 的整数 tokens", true);
      return false;
    }
    model.contextWindow = normalized;
    markDirty();
    const row = [...$("#modelList").querySelectorAll(".model-row")]
      .find((item) => item.dataset.modelId === model.id);
    const rowLabel = row?.querySelector(".model-context");
    if (rowLabel) rowLabel.textContent = `${formatContextWindow(normalized)} 上下文`;
    renderSelectedModelCard(activeProvider());
    showToast(`上下文窗口已设为 ${formatContextWindow(normalized)}`);
    return true;
  }

  $("#selectedModelCard").addEventListener("change", (event) => {
    if (!event.target.matches("#contextWindowInput")) return;
    const provider = activeProvider();
    const model = (provider.models || []).find((item) => item.id === provider.selectedModel);
    if (!model) return;
    const previous = normalizeContextWindow(model.contextWindow) || contextWindowForModel(model.id);
    if (!updateContextWindow(model, event.target.value)) event.target.value = String(previous);
  });

  $("#selectedModelCard").addEventListener("click", (event) => {
    const reset = event.target.closest("[data-reset-context]");
    if (!reset) return;
    const provider = activeProvider();
    const model = (provider.models || []).find((item) => item.id === reset.dataset.resetContext);
    if (!model) return;
    updateContextWindow(model, contextWindowForModel(model.id));
  });

  $("#revealKey").addEventListener("click", () => {
    const input = $("#apiKey");
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    $("#revealKey").setAttribute("aria-label", reveal ? "隐藏 API Key" : "显示 API Key");
  });

  $("#apiKey").addEventListener("input", () => {
    activeProvider().apiKey = $("#apiKey").value;
    updateStatusChip();
    markDirty();
  });

  $("#baseUrl").addEventListener("input", () => {
    activeProvider().baseUrl = $("#baseUrl").value;
    markDirty();
  });

  $("#resetUrl").addEventListener("click", () => {
    const provider = activeProvider();
    provider.baseUrl = provider.defaultBaseUrl || "";
    $("#baseUrl").value = provider.baseUrl;
    markDirty();
  });

  $("#customName").addEventListener("input", () => {
    const provider = activeProvider();
    provider.name = $("#customName").value.trim() || "自定义提供商";
    $("#detailName").textContent = provider.name;
    updateStatusChip();
    markDirty();
  });
  $("#customName").addEventListener("blur", () => renderProviderGrid());

  $("#customFormat").addEventListener("change", () => {
    const provider = activeProvider();
    provider.format = $("#customFormat").value;
    markDirty();
    renderDetail();
  });

  $("#testBtn").addEventListener("click", () => {
    const provider = activeProvider();
    const validation = validateProvider(provider);
    if (validation) {
      showToast(validation, true);
      return;
    }
    testConnection();
  });

  $("#fetchBtn").addEventListener("click", fetchModels);

  $("#addCustomToggle").addEventListener("click", () => {
    $("#customModelRow").hidden = !$("#customModelRow").hidden;
    if (!$("#customModelRow").hidden) $("#customModelInput").focus();
  });
  $("#addCustomBtn").addEventListener("click", addCustomModel);
  $("#customModelInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomModel();
    }
  });

  $("#saveBtn").addEventListener("click", saveSettings);
  $("#saveBtnInline").addEventListener("click", saveSettings);
  $("#resetBtn").addEventListener("click", discardChanges);
  $("#discardBtn").addEventListener("click", discardChanges);

  $("#showPageLauncher").addEventListener("change", async (event) => {
    const visible = event.target.checked;
    try {
      await ext.storage.local.set({ [LAUNCHER_KEY]: visible });
      state.showPageLauncher = visible;
      showToast(visible ? "页面荔枝按钮已显示" : "已隐藏页面荔枝按钮，可从工具栏打开");
    } catch (error) {
      event.target.checked = !visible;
      showToast(error.message || "保存页面入口设置失败", true);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

bindEvents();
loadSettings();
