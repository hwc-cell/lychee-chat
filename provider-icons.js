export const PROVIDER_ICONS = {
  moonshot: "assets/providers/moonshot.png",
  deepseek: "assets/providers/deepseek.png",
  qwen: "assets/providers/qwen.png",
  zhipu: "assets/providers/zhipu.png",
  doubao: "assets/providers/doubao.png",
  minimax: "assets/providers/minimax.png",
  mimo: "assets/providers/mimo.png",
  siliconflow: "assets/providers/siliconflow.png",
  claude: "assets/providers/claude.png",
  openai: "assets/providers/openai.png",
  gemini: "assets/providers/gemini.png",
  grok: "assets/providers/grok.png",
  openrouter: "assets/providers/openrouter.png",
  ollama: "assets/providers/ollama.png",
  lmstudio: "assets/providers/lmstudio.png",
  demo: "assets/providers/demo.png"
};

export function providerIcon(providerId) {
  return PROVIDER_ICONS[String(providerId || "")] || "";
}
