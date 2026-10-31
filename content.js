(() => {
  if (window.__lycheeChatLoaded) return;
  window.__lycheeChatLoaded = true;

  const ext = globalThis.browser ?? globalThis.chrome;

  const host = document.createElement("div");
  host.id = "lychee-chat-root";
  host.style.cssText = "all: initial; position: fixed; top: 0; right: 0; width: 0; height: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const iconUrl = ext.runtime.getURL("assets/icon-48.png");
  const pageLabel = `${location.hostname}${location.pathname}`.slice(0, 120);
  const chatUrl = ext.runtime.getURL("chat.html") + "?embedded=1&page=" + encodeURIComponent(pageLabel);
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
        width: min(416px, calc(100vw - 24px));
        height: min(680px, calc(100vh - 32px));
        overflow: hidden;
        border: 1px solid #eadad3;
        border-radius: 26px;
        background: #fffaf4;
        box-shadow: 0 40px 96px -48px rgba(36, 26, 26, .6), 0 14px 38px -28px rgba(36, 26, 26, .28);
        transition: height .22s cubic-bezier(.2, .8, .2, 1);
      }
      :host([data-theme="dark"]) .wrap {
        border-color: #3a2c2f;
        background: #1c1618;
        box-shadow: 0 44px 110px -42px rgba(0, 0, 0, .9), 0 16px 44px -28px rgba(0, 0, 0, .62);
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
      :host([data-theme="dark"]) iframe { color-scheme: dark; }
      .launcher {
        position: fixed;
        top: 16px;
        right: 16px;
        display: grid;
        width: 52px;
        height: 52px;
        place-items: center;
        padding: 5px;
        border: 1px solid #eadad3;
        border-radius: 50%;
        background: #fffaf4;
        box-shadow: 0 16px 34px -20px rgba(46, 29, 32, .5);
        cursor: pointer;
        transition: transform .2s cubic-bezier(.16, 1, .3, 1), background .2s ease, border-color .2s ease;
      }
      :host([data-theme="dark"]) .launcher {
        border-color: #3a2c2f;
        background: #1c1618;
        box-shadow: 0 18px 38px -20px rgba(0, 0, 0, .8);
      }
      .launcher:hover {
        transform: translateY(-2px) scale(1.03);
        border-color: rgba(173, 67, 88, .32);
        background: #fffdf9;
      }
      :host([data-theme="dark"]) .launcher:hover {
        border-color: rgba(226, 145, 157, .38);
        background: #241d1f;
      }
      .launcher img { width: 40px; height: 40px; border-radius: 50%; object-fit: contain; }
      .launcher .dot {
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 8px;
        height: 8px;
        border: 2px solid #fffaf4;
        border-radius: 50%;
        background: #ad4358;
      }
      :host([data-theme="dark"]) .launcher .dot { border-color: #1c1618; background: #e2919d; }
      @media (max-width: 480px) {
        .wrap { top: 8px; right: 8px; width: calc(100vw - 16px); height: calc(100vh - 16px); border-radius: 22px; }
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
    ext.storage.local.get("lycheeTheme")
      .then((stored) => applyTheme(stored?.lycheeTheme || "system"))
      .catch(() => applyTheme("system"));
    ext.storage.onChanged.addListener((changes, area) => {
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
        const stored = await ext.storage.local.get("lycheeTheme");
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
        ext.storage.local.set({ [POSITION_KEY]: next }).catch(() => {});
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
        ext.storage.local.set({ [POSITION_KEY]: windowPosition }).catch(() => {});
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
      ext.runtime.sendMessage({ type: "LYCHEE_OPEN_OPTIONS" }).catch(() => {});
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
        response = await ext.runtime.sendMessage({ type: "LYCHEE_CAPTURE" });
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
      const stored = await ext.storage.local.get([LAUNCHER_KEY, POSITION_KEY]);
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
    ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
