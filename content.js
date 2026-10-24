(() => {
  if (window.__lycheeChatLoaded) return;
  window.__lycheeChatLoaded = true;

  const host = document.createElement("div");
  host.id = "lychee-chat-root";
  host.style.cssText = "all: initial; position: fixed; top: 0; right: 0; width: 0; height: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const iconUrl = chrome.runtime.getURL("assets/icon-48.png");
  const pageLabel = `${location.hostname}${location.pathname}`.slice(0, 120);
  const chatUrl = chrome.runtime.getURL("chat.html") + "?embedded=1&page=" + encodeURIComponent(pageLabel);
  const LAUNCHER_KEY = "lycheeLauncherVisible";
  const POSITION_KEY = "lycheeWindowPosition";

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .wrap {
        position: fixed;
        top: 16px;
        right: 16px;
        width: min(400px, calc(100vw - 24px));
        height: min(680px, calc(100vh - 32px));
        overflow: hidden;
        border-radius: 20px;
        background: #fffaf5;
        box-shadow: 0 30px 80px -36px rgba(36, 22, 15, .58), 0 12px 30px -18px rgba(36, 22, 15, .28);
        transition: height .22s cubic-bezier(.2, .8, .2, 1);
      }
      :host([data-theme="dark"]) .wrap {
        background: #1e1814;
        box-shadow: 0 38px 100px -34px rgba(0, 0, 0, .85), 0 14px 34px -20px rgba(0, 0, 0, .6);
      }
      .wrap.is-minimized { height: 56px; }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
        color-scheme: light;
      }
      .launcher {
        position: fixed;
        top: 16px;
        right: 16px;
        display: grid;
        width: 48px;
        height: 48px;
        place-items: center;
        padding: 4px;
        border: 1px solid rgba(36, 22, 15, .12);
        border-radius: 50%;
        background: #fffaf5;
        box-shadow: 0 12px 30px -16px rgba(36, 22, 15, .45);
        cursor: pointer;
        transition: transform .18s ease, box-shadow .18s ease;
      }
      :host([data-theme="dark"]) .launcher {
        border-color: #4b3b30;
        background: #2b221c;
        box-shadow: 0 14px 34px -16px rgba(0, 0, 0, .75);
      }
      .launcher:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 34px -16px rgba(21, 24, 21, .5);
      }
      .launcher img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
      .launcher .dot {
        position: absolute;
        right: 1px;
        bottom: 1px;
        width: 10px;
        height: 10px;
        border: 2px solid #fffaf5;
        border-radius: 50%;
        background: #d47b68;
      }
      :host([data-theme="dark"]) .launcher .dot { border-color: #2b221c; background: #e08a77; }
      @media (max-width: 480px) {
        .wrap { top: 8px; right: 8px; width: calc(100vw - 16px); height: min(680px, calc(100vh - 16px)); }
        .wrap.is-minimized { height: 56px; }
        .launcher { top: 10px; right: 10px; }
      }
    </style>
    <div class="wrap" hidden>
      <iframe src="${chatUrl}" title="Lychee-Chat" allow="clipboard-write"></iframe>
    </div>
    <button class="launcher" type="button" hidden aria-label="打开 Lychee-Chat" title="打开 Lychee-Chat">
      <img src="${iconUrl}" alt="">
      <span class="dot"></span>
    </button>
  `;

  const wrap = shadow.querySelector(".wrap");
  const iframe = shadow.querySelector("iframe");
  const launcher = shadow.querySelector(".launcher");
  let minimized = false;
  let launcherVisible = true;
  let windowPosition = null;
  let pendingPosition = null;
  let dragState = null;

  function applyTheme(mode) {
    const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    host.dataset.theme = dark ? "dark" : "light";
  }

  try {
    chrome.storage.local.get("lycheeTheme")
      .then((stored) => applyTheme(stored?.lycheeTheme || "system"))
      .catch(() => applyTheme("system"));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.lycheeTheme) {
        applyTheme(changes.lycheeTheme.newValue || "system");
      }
      if (changes[LAUNCHER_KEY]) {
        setLauncherVisible(changes[LAUNCHER_KEY].newValue !== false);
      }
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", async () => {
      try {
        const stored = await chrome.storage.local.get("lycheeTheme");
        applyTheme(stored?.lycheeTheme || "system");
      } catch {}
    });
  } catch {
    applyTheme("system");
  }

  function postToChat(message) {
    if (iframe.contentWindow) iframe.contentWindow.postMessage({ source: "lychee-page", ...message }, "*");
  }

  function setMinimized(value) {
    minimized = Boolean(value);
    wrap.classList.toggle("is-minimized", minimized);
    if (windowPosition) requestAnimationFrame(() => clampWindowPosition());
  }

  function setLauncherVisible(value) {
    launcherVisible = Boolean(value);
    if (!wrap.hidden) {
      launcher.hidden = true;
      return;
    }
    launcher.hidden = !launcherVisible;
  }

  function openChat() {
    if (minimized) {
      setMinimized(false);
      postToChat({ type: "expand" });
    }
    wrap.hidden = false;
    launcher.hidden = true;
    if (pendingPosition) {
      windowPosition = pendingPosition;
      pendingPosition = null;
    }
    if (windowPosition) requestAnimationFrame(() => clampWindowPosition());
  }

  function closeChat() {
    if (minimized) {
      setMinimized(false);
      postToChat({ type: "expand" });
    }
    wrap.hidden = true;
    setLauncherVisible(launcherVisible);
  }

  function toggleChat() {
    if (wrap.hidden) openChat();
    else closeChat();
  }

  function clearPositionStyles() {
    wrap.style.left = "";
    wrap.style.top = "";
    wrap.style.right = "";
    wrap.style.bottom = "";
  }

  function applyWindowPosition(left, top, persist = false) {
    if (innerWidth <= 480 || wrap.hidden) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const margin = 8;
    const maxLeft = Math.max(margin, innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, innerHeight - rect.height - margin);
    const next = {
      left: Math.round(Math.min(maxLeft, Math.max(margin, Number(left) || margin))),
      top: Math.round(Math.min(maxTop, Math.max(margin, Number(top) || margin)))
    };
    windowPosition = next;
    wrap.style.right = "auto";
    wrap.style.bottom = "auto";
    wrap.style.left = `${next.left}px`;
    wrap.style.top = `${next.top}px`;
    if (persist) {
      try {
        chrome.storage.local.set({ [POSITION_KEY]: next }).catch(() => {});
      } catch {}
    }
  }

  function clampWindowPosition() {
    if (!windowPosition) return;
    applyWindowPosition(windowPosition.left, windowPosition.top);
  }

  function startWindowDrag(data) {
    if (innerWidth <= 480 || wrap.hidden) return;
    const startX = Number(data.screenX);
    const startY = Number(data.screenY);
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;
    const rect = wrap.getBoundingClientRect();
    applyWindowPosition(rect.left, rect.top);
    dragState = {
      startX,
      startY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
  }

  function moveWindowDrag(data) {
    if (!dragState) return;
    const screenX = Number(data.screenX);
    const screenY = Number(data.screenY);
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
    const deltaX = screenX - dragState.startX;
    const deltaY = screenY - dragState.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) dragState.moved = true;
    applyWindowPosition(dragState.left + deltaX, dragState.top + deltaY);
  }

  function endWindowDrag() {
    if (!dragState) return;
    const moved = dragState.moved;
    dragState = null;
    if (moved && windowPosition) {
      try {
        chrome.storage.local.set({ [POSITION_KEY]: windowPosition }).catch(() => {});
      } catch {}
    }
  }

  launcher.addEventListener("click", openChat);

  wrap.addEventListener("transitionend", (event) => {
    if (event.propertyName === "height") clampWindowPosition();
  });

  window.addEventListener("resize", () => {
    if (innerWidth <= 480) {
      clearPositionStyles();
      dragState = null;
      return;
    }
    clampWindowPosition();
  });

  window.addEventListener("message", async (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || data.source !== "lychee-chat") return;

    if (data.type === "resize") {
      setMinimized(Boolean(data.minimized));
      wrap.hidden = false;
      launcher.hidden = true;
      return;
    }

    if (data.type === "drag-start") {
      startWindowDrag(data);
      return;
    }

    if (data.type === "drag-move") {
      moveWindowDrag(data);
      return;
    }

    if (data.type === "drag-end") {
      endWindowDrag();
      return;
    }

    if (data.type === "close") {
      closeChat();
      return;
    }

    if (data.type === "open-options") {
      chrome.runtime.sendMessage({ type: "LYCHEE_OPEN_OPTIONS" }).catch(() => {});
      return;
    }

    if (data.type === "capture") {
      const requestId = data.requestId;
      const wasWrapVisible = !wrap.hidden;
      const wasLauncherVisible = !launcher.hidden;
      wrap.style.visibility = "hidden";
      launcher.style.visibility = "hidden";

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 90));

      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: "LYCHEE_CAPTURE" });
      } catch (error) {
        response = { ok: false, error: error?.message || "截图失败" };
      } finally {
        wrap.style.visibility = "";
        launcher.style.visibility = "";
        wrap.hidden = !wasWrapVisible;
        launcher.hidden = !wasLauncherVisible;
      }

      postToChat({
        type: "capture-result",
        requestId,
        ok: Boolean(response?.ok),
        dataUrl: response?.dataUrl || null,
        error: response?.error || null
      });
    }
  });

  async function loadPagePreferences() {
    try {
      const stored = await chrome.storage.local.get([LAUNCHER_KEY, POSITION_KEY]);
      setLauncherVisible(stored[LAUNCHER_KEY] !== false);
      const position = stored[POSITION_KEY];
      const left = Number(position?.left);
      const top = Number(position?.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        pendingPosition = { left, top };
      }
    } catch {}
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== "LYCHEE_TOGGLE") return;
      toggleChat();
      sendResponse({ ok: true, open: !wrap.hidden });
    });
  } catch {}

  async function init() {
    await loadPagePreferences();
    document.documentElement.appendChild(host);
    openChat();
  }

  init();
})();
