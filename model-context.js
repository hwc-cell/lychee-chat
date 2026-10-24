export const DEFAULT_CONTEXT_WINDOW = 32000;

const MODEL_CONTEXT_WINDOWS = {
  "kimi-k3.1-pro": 256000,
  "kimi-k3": 256000,
  "kimi-k2.6": 256000,
  "deepseek-flash": 128000,
  "deepseek-v4-pro": 128000,
  "qwen3.8-max": 262144,
  "qwen3.7-plus": 262144,
  "qwen3-vl-plus": 262144,
  "glm-5v-turbo": 131072,
  "glm-5.3-flash": 131072,
  "glm-4.6v": 131072,
  "doubao-seed-2-1-lite-260915": 256000,
  "MiniMax-VL-01": 256000,
  "mimo-v2.6-pro": 256000,
  "mimo-v2.6-flash": 256000,
  "Qwen/Qwen3-VL-235B-A22B-Instruct": 262144,
  "zai-org/GLM-5.3-Flash": 131072,
  "claude-fable-5-1": 1000000,
  "claude-opus-5-5": 1000000,
  "claude-sonnet-5-5": 200000,
  "claude-haiku-5-5": 200000,
  "gpt-6-astra": 400000,
  "gpt-6.1-sol": 400000,
  "gpt-6-luna": 200000,
  "gemini-3-pro-preview": 1048576,
  "gemini-3-flash-preview": 1048576,
  "gemini-3.1-flash-lite-preview": 1048576,
  "grok-4.7": 256000,
  "grok-4.6": 256000,
  "grok-4.5": 256000,
  "anthropic/claude-sonnet-5.5": 200000,
  "openai/gpt-6-astra": 400000,
  "google/gemini-3-pro-preview": 1048576,
  "qwen3-vl:8b": 262144,
  "qwen3-vl:4b": 262144,
  "qwen2.5vl:7b": 131072,
  "llava:13b": 32768,
  "minicpm-v:8b": 32768,
  "qwen3-vl-8b-instruct": 262144,
  "llava-v1.6-mistral-7b": 32768,
  "lychee-demo-vision": 32000
};

export function normalizeContextWindow(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const rounded = Math.trunc(number);
  return rounded > 0 ? rounded : null;
}

export function contextWindowForModel(modelId) {
  return MODEL_CONTEXT_WINDOWS[String(modelId || "")] || DEFAULT_CONTEXT_WINDOW;
}

export function formatContextWindow(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  if (number >= 1000000) {
    const millions = number / 1000000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (number >= 1000) return `${Math.round(number / 1000)}K`;
  return String(number);
}

export function inferContextWindow(raw) {
  const candidates = [
    raw?.contextWindow,
    raw?.context_length,
    raw?.context_window,
    raw?.max_context_length,
    raw?.max_input_tokens,
    raw?.input_token_limit,
    raw?.inputTokenLimit,
    raw?.max_context_window_tokens,
    raw?.top_provider?.context_length,
    raw?.meta?.n_ctx
  ];
  for (const candidate of candidates) {
    const value = normalizeContextWindow(candidate);
    if (value) return value;
  }
  return null;
}
