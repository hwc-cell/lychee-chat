(() => {
  const KEY = "lycheeTheme";
  const MODES = ["system", "light", "dark"];
  const LABELS = { system: "跟随系统", light: "浅色", dark: "深色" };
  const ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>'
  };

  let mode = "system";
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function effectiveMode() {
    return mode === "system" ? (media.matches ? "dark" : "light") : mode;
  }

  function updateButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const icon = button.querySelector("[data-theme-icon]");
      const label = button.querySelector("[data-theme-label]");
      if (icon) icon.innerHTML = ICONS[mode];
      if (label) label.textContent = LABELS[mode];
      button.title = `主题：${LABELS[mode]}（点击切换）`;
      button.setAttribute("aria-label", `当前主题：${LABELS[mode]}，点击切换`);
    });
  }

  function apply() {
    const theme = effectiveMode();
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = theme;
    updateButtons();
  }

  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    apply();
    try {
      chrome.storage.local.set({ [KEY]: mode }).catch(() => {});
    } catch {}
  }

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    apply();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    event.preventDefault();
    cycle();
  });

  media.addEventListener("change", () => {
    if (mode === "system") apply();
  });

  mode = "system";
  apply();

  try {
    chrome.storage.local.get(KEY).then((stored) => {
      if (MODES.includes(stored?.[KEY])) setMode(stored[KEY]);
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[KEY]) return;
      setMode(changes[KEY].newValue || "system");
    });
  } catch {}

  document.addEventListener("DOMContentLoaded", updateButtons);
  window.LycheeTheme = { cycle, setMode, get mode() { return mode; } };
})();
