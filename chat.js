import { renderMarkdown } from "./markdown.js";
import {
  DEFAULT_CONTEXT_WINDOW,
  contextWindowForModel,
  formatContextWindow,
  normalizeContextWindow
} from "./model-context.js";
import { providerIcon } from "./provider-icons.js";
import { openDeepSeekExport, deepseekSessionToLocal } from "./deepseek-import.js";

const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEY = "lycheeSettings";
const SESSIONS_KEY = "lycheeSessions";
const PREFS_KEY = "lycheePrefs";
const MAX_HISTORY_MESSAGES = 40;
const AUTO_COMPRESS_MESSAGE_LIMIT = MAX_HISTORY_MESSAGES - 4;
const PARAMS = new URLSearchParams(location.search);
const EMBEDDED = PARAMS.get("embedded") === "1";
const PAGE_LABEL = PARAMS.get("page") || "";
const DEFAULT_PREFS = {
  screenshotOn: true,
  webSearchOn: false,
  autoCompress: true,
  threshold: 70,
  strategy: "摘要较早消息"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const icons = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.8 12S6.4 6 12 6s9.2 6 9.2 6-3.6 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.4"/></svg>',
  pin: '<svg class="pin-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 4 6 0-.7 6 3.7 3H6l3.7-3L9 4ZM12 13v7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 3.5 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16.5l8 4 8-4"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.8h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><circle cx="12" cy="12.3" r="3.2"/></svg>',
  chevron: '<svg class="compressed-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 9.5 5 5 5-5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16.2v.1"/></svg>'
};

let settings = null;
let provider = null;
let activeModel = null;
let sessionsState = { activeId: null, items: [], deleted: {} };
let prefs = { ...DEFAULT_PREFS };
let typingSessionId = null;
let sendingSessionId = null;
let pendingAttachments = [];
let activeStream = null;
let editingSessionId = null;
let searchQuery = "";
let minimizeIcon = null;
let toastTimer = null;
const pendingCaptures = new Map();

const chatWindow = $("#chatWindow");
const chatLauncher = $("#chatLauncher");
const messagesEl = $("#messages");
const sessionTitleEl = $("#sessionTitle");
const modelNameEl = $("#modelName");
const modelContextEl = $("#modelContext");
const modelProviderBadge = $("#modelProviderBadge");
const modelProviderIcon = $("#modelProviderIcon");
const modelPip = $("#modelPip");
const contextPercentEl = $("#contextPercent");
const contextFill = $("#contextFill");
const autoLabel = $("#autoLabel");
const contextStrip = $("#contextStrip");
const contextPopover = $("#contextPopover");
const popoverUsage = $("#popoverUsage");
const popoverFill = $("#popoverFill");
const popoverNote = $("#popoverNote");
const contextWindowValue = $("#contextWindowValue");
const sessionsDrawer = $("#sessionsDrawer");
const sessionScrim = $("#sessionScrim");
const sessionList = $("#sessionList");
const sessionSearch = $("#sessionSearch");
const composerInput = $("#composerInput");
const sendBtn = $("#sendBtn");
const attachBtn = $("#attachBtn");
const fileInput = $("#fileInput");
const pendingAttachmentsEl = $("#pendingAttachments");
const SEND_ICON = sendBtn.innerHTML;
const STOP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
const shotChip = $("#shotChip");
const captureToggle = $("#captureToggle");
const captureLabel = $("#captureLabel");
const webSearchToggle = $("#webSearchToggle");
const chatToast = $("#chatToast");
const minimizeButton = $("#minimizeBtn");
const demoNotice = $("#demoNotice");
const errorNotice = $("#errorNotice");
const errorNoticeText = $("#errorNoticeText");
const importSessionsBtn = $("#importSessionsBtn");
const importPanel = $("#importPanel");
const importScrim = $("#importScrim");
const importIntro = $("#importIntro");
const importStatus = $("#importStatus");
const importPickBtn = $("#importPickBtn");
const importFileInput = $("#deepseekFileInput");
const importBrowser = $("#importBrowser");
const importSourceName = $("#importSourceName");
const importSummary = $("#importSummary");
const importReselectBtn = $("#importReselectBtn");
const importSearch = $("#importSearch");
const importSelectAll = $("#importSelectAll");
const importList = $("#importList");
const importLimit = $("#importLimit");
const importSelectedCount = $("#importSelectedCount");
const importCancel = $("#importCancel");
const importConfirm = $("#importConfirm");

const DEEPSEEK_LIST_ROWS = 120;
let deepseekExport = null;
let deepseekFileName = "";
let deepseekQuery = "";
let deepseekSelected = new Set();
let deepseekBusy = false;

function activeSession() {
  return sessionsState.items.find((session) => session.id === sessionsState.activeId) || null;
}

function roleMessages(session) {
  return session ? session.messages.filter((message) => message.role) : [];
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function formatTokens(value) {
  if (value >= 1000) {
    const number = value / 1000;
    return `${Number.isInteger(number) ? number : number.toFixed(1)}K`;
  }
  return String(value);
}

function estimateTextTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  const wide = (value.match(/[\u2e80-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const narrow = Math.max(0, value.length - wide);
  return Math.ceil(wide * 1.2 + narrow / 3.8);
}

function estimateTokens(session) {
  if (!session) return 0;
  const lastUserMessage = [...session.messages].reverse().find((message) => message.role === "user");
  return session.messages.reduce((total, message) => {
    if (message.type === "compressed") {
      return total + estimateTextTokens(message.summary) + 20;
    }
    const images = message === lastUserMessage
      ? (message.screenshot ? 1 : 0) + (Array.isArray(message.attachments) ? message.attachments.length : 0)
      : 0;
    return total + estimateTextTokens(message.text) + images * 900;
  }, 180);
}

function activeContextLimit() {
  if (!activeModel) return DEFAULT_CONTEXT_WINDOW;
  return normalizeContextWindow(activeModel.contextWindow) ||
    contextWindowForModel(activeModel.id) ||
    DEFAULT_CONTEXT_WINDOW;
}

function contextPercent(session) {
  return Math.min(100, Math.round((estimateTokens(session) / activeContextLimit()) * 100));
}

function contextPercentLabel(session) {
  if (!session?.messages?.length) return "0%";
  const used = estimateTokens(session);
  if (!used) return "0%";
  const percent = contextPercent(session);
  return percent === 0 ? "<1%" : `${percent}%`;
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function groupFor(timestamp) {
  const today = startOfDay(Date.now());
  const sessionDay = startOfDay(timestamp);
  if (sessionDay === today) return "today";
  if (sessionDay === today - 86400000) return "yesterday";
  return "earlier";
}

function timeLabel(timestamp) {
  const date = new Date(timestamp);
  const group = groupFor(timestamp);
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (group === "today") return time;
  if (group === "yesterday") return `昨天 ${time}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function dateLabel(timestamp) {
  const date = new Date(timestamp);
  const group = groupFor(timestamp);
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (group === "today") return `今天 · ${time}`;
  if (group === "yesterday") return `昨天 · ${time}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${time}`;
}

function truncate(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function showChatToast(message, warning = false) {
  chatToast.textContent = message;
  chatToast.classList.toggle("is-warn", warning);
  chatToast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => chatToast.classList.remove("is-visible"), 3200);
}

function makeSession() {
  const now = Date.now();
  return {
    id: makeId(),
    title: "新会话",
    preview: "开始一段新对话",
    pinned: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    compressedOpen: false
  };
}

function ensureSession() {
  if (!sessionsState.items.length) {
    const session = makeSession();
    sessionsState.items.push(session);
    sessionsState.activeId = session.id;
  }
  if (!sessionsState.items.some((session) => session.id === sessionsState.activeId)) {
    sessionsState.activeId = sessionsState.items[0].id;
  }
}

function serializableSessions() {
  return {
    activeId: sessionsState.activeId,
    deleted: pruneDeletedSessions(sessionsState.deleted),
    items: sessionsState.items.map((session) => ({
      ...session,
      messages: session.messages.filter((message) => message.type === "compressed" || !message.streaming).map((message) => message.type === "compressed"
        ? { type: "compressed", summary: message.summary, count: message.count }
        : {
            role: message.role,
            text: message.text,
            time: message.time,
            model: message.model || "",
            screenshot: Boolean(message.screenshot),
            attachments: Array.isArray(message.attachments)
              ? message.attachments.map(({ name, type }) => ({ name, type }))
              : [],
            sources: Array.isArray(message.sources)
              ? message.sources.slice(0, 8).map(({ title, url }) => ({ title: String(title || "").slice(0, 160), url: String(url || "") }))
              : []
          })
    }))
  };
}

let sessionsSaveTail = Promise.resolve();

function pruneDeletedSessions(deleted) {
  const cutoff = Date.now() - 30 * 86400000;
  const next = {};
  for (const [id, timestamp] of Object.entries(deleted || {})) {
    const at = Number(timestamp) || 0;
    if (at && at >= cutoff) next[id] = at;
  }
  return next;
}

function mergedDeletedSessions(remote, local) {
  const next = {};
  for (const source of [remote || {}, local || {}]) {
    for (const [id, timestamp] of Object.entries(source)) {
      next[id] = Math.max(Number(next[id]) || 0, Number(timestamp) || 0);
    }
  }
  return pruneDeletedSessions(next);
}

function mergeSessionPayloads(remote, local) {
  const revived = new Set(Array.isArray(local?.revived) ? local.revived : []);
  const deleted = mergedDeletedSessions(remote?.deleted, local?.deleted);
  for (const id of revived) delete deleted[id];
  const byId = new Map();
  const accept = (session) => {
    if (!session?.id || deleted[session.id]) return;
    const previous = byId.get(session.id);
    if (!previous || (Number(session.updatedAt) || 0) >= (Number(previous.updatedAt) || 0)) {
      byId.set(session.id, session);
    }
  };
  for (const session of remote?.items || []) accept(session);
  for (const session of local?.items || []) accept(session);
  const items = [...byId.values()];
  let activeId = local?.activeId;
  if (!items.some((session) => session.id === activeId)) {
    activeId = items.some((session) => session.id === remote?.activeId)
      ? remote.activeId
      : (items[0]?.id || null);
  }
  return { activeId, items, deleted };
}

async function persistMergedSessions(snapshot) {
  const write = async () => {
    let remote = null;
    try {
      remote = (await ext.storage.local.get(SESSIONS_KEY))[SESSIONS_KEY];
    } catch {}
    await ext.storage.local.set({ [SESSIONS_KEY]: mergeSessionPayloads(remote, snapshot) });
  };
  if (navigator.locks?.request) {
    await navigator.locks.request("lychee-chat-sessions", write);
  } else {
    await write();
  }
}

function saveSessions({ revived = [] } = {}) {
  const snapshot = serializableSessions();
  if (revived.length) snapshot.revived = revived;
  const pending = sessionsSaveTail
    .catch(() => {})
    .then(() => persistMergedSessions(snapshot));
  sessionsSaveTail = pending.catch(() => {});
  return pending;
}

function deepseekLocalId(sourceId) {
  return `deepseek-${sourceId}`;
}

function deepseekImportedMeta(meta) {
  return sessionsState.items.some((session) => session.id === deepseekLocalId(meta.id));
}

function deepseekTimestamp(meta) {
  return Date.parse(meta.updatedAt || "") || Date.parse(meta.insertedAt || "") || 0;
}

function sortedDeepseekSessions() {
  if (!deepseekExport) return [];
  return [...deepseekExport.sessions].sort((a, b) => deepseekTimestamp(b) - deepseekTimestamp(a));
}

function filteredDeepseekSessions() {
  const query = deepseekQuery.trim().toLowerCase();
  const rows = sortedDeepseekSessions();
  if (!query) return rows;
  return rows.filter((meta) => `${meta.title} ${meta.id}`.toLowerCase().includes(query));
}

function deepseekMetaLabel(meta) {
  const count = meta.messageCount ? `${meta.messageCount} 条原始消息` : "消息数未知";
  const timestamp = deepseekTimestamp(meta);
  return timestamp ? `${count} · ${timeLabel(timestamp)}` : count;
}

function deepseekRowMarkup(meta) {
  const imported = deepseekImportedMeta(meta);
  return `
    <label class="import-row${imported ? " is-imported" : ""}">
      <input type="checkbox" data-import-id="${esc(meta.id)}" value="${esc(meta.id)}"${deepseekSelected.has(meta.id) ? " checked" : ""}${imported ? " disabled" : ""}>
      <span class="import-row-main">
        <span class="import-row-title">${esc(meta.title || "未命名对话")}</span>
        <span class="import-row-meta">${esc(deepseekMetaLabel(meta))}</span>
      </span>
      ${imported ? '<span class="import-row-state">已导入</span>' : ""}
    </label>`;
}

function updateDeepseekSelectionUI() {
  if (!deepseekExport) {
    importSelectedCount.textContent = "未选择会话";
    importConfirm.disabled = true;
    importConfirm.textContent = "导入";
    importSelectAll.disabled = true;
    importLimit.textContent = "";
    importLimit.classList.remove("is-warning");
    return;
  }

  const matches = filteredDeepseekSessions();
  const selectable = matches.filter((meta) => !deepseekImportedMeta(meta));
  const allSelected = selectable.length > 0 && selectable.every((meta) => deepseekSelected.has(meta.id));
  importSelectAll.textContent = allSelected ? "取消全选" : "全选";
  importSelectAll.disabled = !selectable.length || deepseekBusy;
  importSelectedCount.textContent = deepseekSelected.size
    ? `已选择 ${deepseekSelected.size} 个会话`
    : "未选择会话";
  importConfirm.disabled = deepseekBusy || !deepseekSelected.size;
  importConfirm.textContent = "导入";
  importLimit.classList.remove("is-warning");
  if (!deepseekBusy) {
    const importedCount = deepseekExport.sessions.filter(deepseekImportedMeta).length;
    importSummary.textContent = `${deepseekExport.sessions.length.toLocaleString("zh-CN")} 个对话 · ${importedCount} 个已导入`;
    if (!matches.length) {
      importLimit.textContent = "没有匹配的对话，换个关键词试试。";
    } else if (!selectable.length) {
      importLimit.textContent = "当前筛选结果都已导入，可以直接开始聊天。";
    } else {
      const hidden = matches.length - Math.min(matches.length, DEEPSEEK_LIST_ROWS);
      importLimit.textContent = hidden > 0
        ? `显示匹配的最近 ${DEEPSEEK_LIST_ROWS} 个；“全选”会同时选中其余 ${hidden} 个未显示结果。`
        : "默认不勾选；可以逐个选择，也可以直接全选后导入。";
    }
  }
}

function renderDeepseekSessions() {
  if (!deepseekExport) return;
  const matches = filteredDeepseekSessions();
  const shown = matches.slice(0, DEEPSEEK_LIST_ROWS);
  importList.innerHTML = shown.length
    ? shown.map(deepseekRowMarkup).join("")
    : `<div class="import-empty">${deepseekQuery.trim()
        ? "没有找到匹配的对话。<br>换个关键词，或清空搜索。"
        : "这个导出包里没有可导入的对话。"}</div>`;
  updateDeepseekSelectionUI();
}

function setDeepseekBusy(busy, label = "导入") {
  deepseekBusy = busy;
  importPanel.classList.toggle("is-busy", busy);
  importSearch.disabled = busy;
  importReselectBtn.disabled = busy;
  importCancel.disabled = busy;
  importPickBtn.disabled = busy;
  $("#closeImport").disabled = busy;
  for (const input of importList.querySelectorAll("input[data-import-id]")) {
    input.disabled = busy || sessionsState.items.some((session) => session.id === deepseekLocalId(input.value));
  }
  if (busy) {
    importConfirm.disabled = true;
    importConfirm.textContent = label;
    importSelectAll.disabled = true;
  } else {
    updateDeepseekSelectionUI();
  }
}

function resetDeepSeekImport() {
  deepseekExport = null;
  deepseekFileName = "";
  deepseekQuery = "";
  deepseekSelected = new Set();
  deepseekBusy = false;
  importPanel.classList.remove("is-busy");
  importFileInput.value = "";
  importSearch.value = "";
  importSearch.disabled = false;
  importReselectBtn.disabled = false;
  importCancel.disabled = false;
  importPickBtn.disabled = false;
  $("#closeImport").disabled = false;
  importIntro.hidden = false;
  importBrowser.hidden = true;
  importStatus.textContent = "文件仅在本机解析。";
  importStatus.classList.remove("is-warning");
  importPickBtn.textContent = "选择文件";
  importSourceName.textContent = "";
  importSummary.textContent = "";
  importList.innerHTML = "";
  updateDeepseekSelectionUI();
}

function openDeepSeekImport() {
  closeContext();
  closeSessions();
  chatToast.classList.remove("is-visible");
  resetDeepSeekImport();
  importPanel.inert = false;
  importPanel.classList.add("is-open");
  importPanel.setAttribute("aria-hidden", "false");
  importScrim.classList.add("is-open");
  requestAnimationFrame(() => importPickBtn.focus());
}

function closeDeepSeekImport(force = false) {
  if (deepseekBusy && !force) return;
  importPanel.classList.remove("is-open");
  importPanel.setAttribute("aria-hidden", "true");
  importPanel.inert = true;
  importScrim.classList.remove("is-open");
  resetDeepSeekImport();
}

async function loadDeepSeekFile(file) {
  if (!file || deepseekBusy) return;
  setDeepseekBusy(true, "解析中…");
  importStatus.textContent = "正在读取导出索引…";
  importStatus.classList.remove("is-warning");
  let failure = null;

  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const parsed = await openDeepSeekExport(file);
    deepseekExport = parsed;
    deepseekFileName = file.name;
    deepseekQuery = "";
    deepseekSelected = new Set();
    importSearch.value = "";
    deepseekBusy = false;
    importPanel.classList.remove("is-busy");
    importIntro.hidden = true;
    importBrowser.hidden = false;
    importSourceName.textContent = deepseekFileName;
    importStatus.textContent = "文件仅在本机解析。";
    importStatus.classList.remove("is-warning");
    renderDeepseekSessions();
  } catch (error) {
    failure = error;
  } finally {
    importFileInput.value = "";
    if (!failure) {
      deepseekBusy = false;
      importPanel.classList.remove("is-busy");
      importSearch.disabled = false;
      importReselectBtn.disabled = false;
      importCancel.disabled = false;
      importPickBtn.disabled = false;
      $("#closeImport").disabled = false;
      updateDeepseekSelectionUI();
    }
  }

  if (failure) {
    setDeepseekBusy(false);
    const message = failure.message || "读取文件失败";
    if (deepseekExport) {
      importLimit.classList.add("is-warning");
      importLimit.textContent = message;
    } else {
      importStatus.classList.add("is-warning");
      importStatus.textContent = message;
      importPickBtn.textContent = "重新选择文件";
    }
  }
}

function toggleAllDeepseekSessions() {
  if (!deepseekExport || deepseekBusy) return;
  const selectable = filteredDeepseekSessions().filter((meta) => !deepseekImportedMeta(meta));
  if (!selectable.length) return;
  const allSelected = selectable.every((meta) => deepseekSelected.has(meta.id));

  if (allSelected) {
    for (const meta of selectable) deepseekSelected.delete(meta.id);
  } else {
    for (const meta of selectable) deepseekSelected.add(meta.id);
  }

  for (const input of importList.querySelectorAll("input[data-import-id]")) {
    input.checked = deepseekSelected.has(input.value);
  }
  updateDeepseekSelectionUI();
}

async function runDeepSeekImport() {
  if (deepseekBusy || !deepseekExport || !deepseekSelected.size) return;
  const sourceIds = [...deepseekSelected];
  const metaById = new Map(deepseekExport.sessions.map((meta) => [meta.id, meta]));
  setDeepseekBusy(true, `读取 0/${sourceIds.length}`);

  try {
    const imported = [];
    const knownIds = new Set(sessionsState.items.map((session) => session.id));
    let skipped = 0;

    for (let index = 0; index < sourceIds.length; index += 1) {
      const sourceId = sourceIds[index];
      const meta = metaById.get(sourceId);
      const localId = deepseekLocalId(sourceId);
      importConfirm.textContent = `读取 ${index + 1}/${sourceIds.length}`;
      if ((index + 1) % 10 === 0) await new Promise(requestAnimationFrame);

      if (!meta || knownIds.has(localId)) {
        skipped += 1;
        continue;
      }
      let session = null;
      try {
        session = deepseekSessionToLocal(await deepseekExport.readSession(sourceId), meta);
      } catch {}
      if (!session) {
        skipped += 1;
        continue;
      }
      knownIds.add(localId);
      imported.push(session);
    }

    if (!imported.length) {
      throw new Error("没有可导入的对话，可能已经导入过或只剩思考过程。");
    }

    importConfirm.textContent = "写入中…";
    const priorActiveId = sessionsState.activeId;
    const priorDeleted = { ...sessionsState.deleted };
    const importedIds = new Set(imported.map((session) => session.id));
    for (const session of imported) delete sessionsState.deleted[session.id];
    sessionsState.items.push(...imported);
    sessionsState.activeId = [...imported].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    updateAll();

    try {
      await saveSessions({ revived: [...importedIds] });
    } catch (error) {
      sessionsState.items = sessionsState.items.filter((session) => !importedIds.has(session.id));
      sessionsState.activeId = sessionsState.items.some((session) => session.id === priorActiveId)
        ? priorActiveId
        : (sessionsState.items[0]?.id || null);
      sessionsState.deleted = priorDeleted;
      updateAll();
      throw error;
    }

    closeDeepSeekImport(true);
    showChatToast(skipped
      ? `已导入 ${imported.length} 个对话，跳过 ${skipped} 个空对话`
      : `已导入 ${imported.length} 个对话`);
  } catch (error) {
    if (!importPanel.classList.contains("is-open")) {
      closeDeepSeekImport(true);
      showChatToast(`导入失败：${error?.message || "未知错误"}`, true);
      return;
    }
    setDeepseekBusy(false);
    importLimit.classList.add("is-warning");
    if (/quota|配额|QUOTA_BYTES/i.test(error?.message || "")) {
      importLimit.textContent = "本机扩展存储空间不足，未能写入。请确认扩展已获得不限存储权限，或删除部分会话后重试。";
    } else {
      importLimit.textContent = `导入失败：${error?.message || "未知错误"}`;
    }
  }
}

function sessionStamp(session) {
  if (!session) return "";
  return `${session.id}|${session.updatedAt || 0}|${session.title || ""}|${session.pinned ? 1 : 0}|${session.preview || ""}|${session.messages?.length || 0}`;
}

function absorbRemoteSessions(remote) {
  if (!remote || !Array.isArray(remote.items)) return;
  const activeBefore = activeSession();
  const stampBefore = sessionStamp(activeBefore);
  const deleted = mergedDeletedSessions(sessionsState.deleted, remote.deleted);
  const incoming = remote.items.filter((session) => session?.id && !deleted[session.id]);
  const map = new Map(sessionsState.items.map((session) => [session.id, session]));
  const streamingId = activeStream?.session?.id;
  let listChanged = false;

  for (const id of Object.keys(deleted)) {
    if (map.delete(id)) listChanged = true;
  }
  for (const session of incoming) {
    if (deleted[session.id]) continue;
    const local = map.get(session.id);
    if (!local) {
      map.set(session.id, session);
      listChanged = true;
      continue;
    }
    if (session.id === streamingId) continue;
    if ((Number(session.updatedAt) || 0) > (Number(local.updatedAt) || 0)) {
      map.set(session.id, session);
      listChanged = true;
    }
  }

  const deletedChanged = JSON.stringify(deleted) !== JSON.stringify(sessionsState.deleted || {});
  if (!listChanged && !deletedChanged) return;

  sessionsState.deleted = deleted;
  sessionsState.items = [...map.values()];
  if (editingSessionId && !sessionsState.items.some((session) => session.id === editingSessionId)) {
    editingSessionId = null;
  }

  if (!sessionsState.items.some((session) => session.id === sessionsState.activeId)) {
    sessionsState.activeId = sessionsState.items.some((session) => session.id === remote.activeId)
      ? remote.activeId
      : (sessionsState.items[0]?.id || null);
  }
  if (!sessionsState.items.length) {
    const session = makeSession();
    sessionsState.items.push(session);
    sessionsState.activeId = session.id;
    listChanged = true;
    saveSessions();
  }

  if (listChanged) renderSessions();
  const activeAfter = activeSession();
  if (stampBefore !== sessionStamp(activeAfter)) {
    updateHeader();
    renderMessages("bottom");
    updateContextUI();
    updateComposer();
  }
}

function savePrefs() {
  ext.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
}

function resolveProvider() {
  const activeId = settings?.activeProviderId;
  const candidate = activeId ? settings?.providers?.[activeId] : null;
  const model = candidate?.models?.find(
    (item) => item.id === candidate.selectedModel && item.vision === true
  );
  provider = candidate && model ? candidate : null;
  activeModel = model || null;
}

function activeModelLabel() {
  return activeModel ? (activeModel.label || activeModel.id) : "视觉模型";
}

function updateHeader() {
  const session = activeSession();
  sessionTitleEl.textContent = session?.title || "新会话";
  modelNameEl.textContent = activeModel ? (activeModel.label || activeModel.id) : "未配置模型";
  modelContextEl.textContent = activeModel ? `${formatContextWindow(activeContextLimit())} 上下文` : "窗口 —";
  const icon = provider ? providerIcon(provider.id) : "";
  modelProviderBadge.hidden = !icon;
  modelPip.hidden = Boolean(icon);
  if (icon) {
    modelProviderIcon.src = icon;
  } else {
    modelProviderIcon.removeAttribute("src");
  }
  const online = $(".chat-online");
  if (online) online.textContent = provider ? "在线" : "未配置";
  demoNotice.hidden = provider?.format !== "demo";
  updateWebSearchUI();
  document.title = `Lychee-Chat — ${session?.title || "新会话"}`;
}

function showChatError(message) {
  errorNoticeText.textContent = message;
  errorNotice.hidden = false;
}

function clearChatError() {
  errorNotice.hidden = true;
  errorNoticeText.textContent = "";
}

function updateComposer() {
  const busy = Boolean(sendingSessionId);
  composerInput.disabled = !provider;
  composerInput.placeholder = provider ? "继续问点什么…" : "请先在设置中配置视觉模型";
  attachBtn.disabled = !provider || busy;
  if (busy) {
    const canStop = Boolean(activeStream);
    sendBtn.disabled = !canStop;
    sendBtn.title = canStop ? "停止生成" : "正在准备截图…";
    sendBtn.setAttribute("aria-label", canStop ? "停止生成" : "正在准备截图");
    sendBtn.classList.toggle("is-streaming", canStop);
    sendBtn.innerHTML = STOP_ICON;
    return;
  }
  sendBtn.disabled = !provider || (!composerInput.value.trim() && !pendingAttachments.length);
  sendBtn.title = "发送";
  sendBtn.setAttribute("aria-label", "发送");
  sendBtn.classList.remove("is-streaming");
  sendBtn.innerHTML = SEND_ICON;
}

function deepseekWebSearchAvailable() {
  return provider?.id === "deepseek" &&
    provider?.format === "openai" &&
    /^deepseek-flash(?:$|[-.])/i.test(String(activeModel?.id || ""));
}

function updateWebSearchUI() {
  const available = deepseekWebSearchAvailable();
  const on = available && Boolean(prefs.webSearchOn);
  webSearchToggle.hidden = !available;
  webSearchToggle.classList.toggle("is-on", on);
  webSearchToggle.setAttribute("aria-pressed", String(on));
  webSearchToggle.title = on
    ? "DeepSeek 联网搜索已开启，由模型决定本轮是否搜索"
    : "开启 DeepSeek 联网搜索";
}

function updateScreenshotUI() {
  shotChip.hidden = !prefs.screenshotOn;
  captureToggle.classList.toggle("is-on", prefs.screenshotOn);
  captureLabel.textContent = prefs.screenshotOn ? "每轮截图" : "截图已关闭";
}

function updateContextUI() {
  const session = activeSession();
  const limit = activeContextLimit();
  const hasMessages = Boolean(session?.messages?.length);
  const percent = hasMessages ? contextPercent(session) : 0;
  const used = hasMessages ? estimateTokens(session) : 0;
  const percentLabel = contextPercentLabel(session);
  const barPercent = used && percent === 0 ? 1 : percent;
  const level = percent >= 85 ? "is-danger" : percent >= 70 ? "is-warn" : "";
  contextPercentEl.textContent = percentLabel;
  contextFill.style.width = `${barPercent}%`;
  contextFill.className = level;
  popoverUsage.textContent = `${formatTokens(used)} / ${formatContextWindow(limit)}`;
  contextWindowValue.textContent = `${formatContextWindow(limit)} tokens`;
  popoverFill.style.width = `${barPercent}%`;
  popoverFill.className = level;
  popoverNote.textContent = session?.messages?.length
    ? `${percentLabel} · ${prefs.autoCompress ? "超过阈值后自动摘要" : "自动压缩已关闭"}`
    : "等待第一轮对话";
  autoLabel.textContent = prefs.autoCompress ? "自动压缩" : "自动压缩已关";
  $(".auto-dot").classList.toggle("is-off", !prefs.autoCompress);
  $("#autoCompress").checked = prefs.autoCompress;
  $("#compressionStrategy").value = prefs.strategy;
  $$("#thresholdSeg button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.value) === prefs.threshold);
  });
}

function formatAssistantText(text) {
  return renderMarkdown(text);
}

function attachmentMarkup(message) {
  if (message.screenshotData) {
    return `
      <div class="shot-attachment">
        <img class="att-image" src="${message.screenshotData}" alt="当前页面截图">
        <div class="att-caption">${icons.camera}<span>当前标签页</span><span>已发送</span></div>
      </div>`;
  }
  return `
    <div class="shot-attachment">
      <div class="att-placeholder">${icons.camera}<span>本轮附带了页面截图</span></div>
      <div class="att-caption">${icons.camera}<span>当前标签页</span><span>已发送</span></div>
    </div>`;
}

function normalizeMessageSources(sources) {
  const list = [];
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || typeof source.url !== "string") continue;
    let url;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol) || seen.has(url.href)) continue;
    seen.add(url.href);
    const title = String(source.title || "").trim().slice(0, 160) || url.hostname;
    list.push({ url: url.href, title });
    if (list.length >= 8) break;
  }
  return list;
}

function messageSourcesMarkup(message) {
  const sources = normalizeMessageSources(message?.sources);
  if (!sources.length) return "";
  return `
    <div class="message-sources">
      <span class="message-sources-label">参考来源</span>
      ${sources.map((source, index) => `
        <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(source.title)}">
          <span>${index + 1}</span>${esc(source.title)}
        </a>`).join("")}
    </div>`;
}

function uploadedAttachmentsMarkup(message) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (!attachments.length) return "";
  return `
    <div class="attachment-grid">
      ${attachments.map((attachment) => {
        const name = esc(attachment.name || "图片附件");
        const image = attachment.dataUrl
          ? `<img src="${attachment.dataUrl}" alt="${name}">`
          : `<div class="attachment-placeholder">${icons.camera}<span>${name}</span></div>`;
        return `<div class="attachment-item">${image}${attachment.dataUrl ? `<span class="attachment-name">${name}</span>` : ""}</div>`;
      }).join("")}
    </div>`;
}

function messageMarkup(message) {
  if (message.type === "compressed") {
    const session = activeSession();
    return `
      <div class="compressed-block">
        <button class="compressed-toggle${session?.compressedOpen ? " is-open" : ""}" type="button" data-compressed-toggle>
          ${icons.layers}
          已压缩 ${message.count} 条早期消息
          ${icons.chevron}
        </button>
        <div class="compressed-summary"${session?.compressedOpen ? "" : " hidden"}>
          <strong>摘要：</strong>${esc(message.summary)}
        </div>
      </div>`;
  }

  if (message.role === "user") {
    const text = esc(message.text).replace(/\n/g, "<br>");
    return `
      <div class="message user">
        <div class="message-body">
          <div class="message-meta">你 · ${esc(message.time || "")}</div>
          <div class="bubble">${text}${message.screenshot ? attachmentMarkup(message) : ""}${uploadedAttachmentsMarkup(message)}</div>
        </div>
      </div>`;
  }

  return `
    <div class="message assistant"${message.streamId ? ` data-stream-id="${esc(message.streamId)}"` : ""}>
      <span class="assistant-avatar"><img src="assets/icon-32.png" alt=""></span>
      <div class="message-body">
        <div class="message-meta">Lychee-Chat · ${esc(message.model || activeModelLabel())} · ${esc(message.time || "")}${message.searching ? '<span class="search-live">联网搜索中…</span>' : ""}${message.streaming ? '<span class="streaming-dot" aria-label="正在生成"></span>' : ""}</div>
        <div class="bubble${message.streaming ? " is-streaming" : ""}">${formatAssistantText(message.text)}</div>
        ${messageSourcesMarkup(message)}
      </div>
    </div>`;
}

function mountStreamCaret(bubble) {
  bubble.querySelectorAll(".stream-caret").forEach((node) => node.remove());
  const containers = new Set(["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "DIV"]);
  let target = bubble;
  let node = bubble.lastElementChild;
  while (node && containers.has(node.tagName)) {
    target = node;
    node = node.lastElementChild;
  }
  const caret = document.createElement("span");
  caret.className = "stream-caret";
  caret.setAttribute("aria-hidden", "true");
  target.appendChild(caret);
}

function emptyStateMarkup() {
  if (!provider) {
    return `
      <div class="empty-state">
        <div class="empty-orb"><img src="assets/icon-48.png" alt=""></div>
        <h3>先连接一双眼睛</h3>
        <p>每一轮对话都会附上当前页面截图，因此需要一位能读懂图片的模型。</p>
        <button class="primary-action" type="button" data-action="open-options">打开设置</button>
      </div>`;
  }
  return `
    <div class="empty-state">
      <div class="empty-orb"><img src="assets/icon-48.png" alt=""></div>
      <h3>先看见，再回答。</h3>
      <p>${esc(activeModel?.label || activeModel?.id || "视觉模型")} 已就位。每轮对话都会附上当前标签页截图，布局、文案和细节都可以问我。</p>
      <div class="suggestion-chips">
        <button type="button" data-suggestion="帮我评审当前页面">评审这个页面</button>
        <button type="button" data-suggestion="解释一下这个页面的信息层级">解释信息层级</button>
        <button type="button" data-suggestion="把这个页面的文案压缩一下">精简页面文案</button>
      </div>
    </div>`;
}

function renderMessages(scroll = "bottom") {
  const session = activeSession();
  if (!session) {
    messagesEl.innerHTML = "";
    return;
  }

  if (!session.messages.length) {
    messagesEl.innerHTML = emptyStateMarkup();
    return;
  }

  const parts = [`<div class="msg-date">${esc(dateLabel(session.updatedAt || session.createdAt))}</div>`];
  for (const message of session.messages) parts.push(messageMarkup(message));

  if (typingSessionId === session.id) {
    parts.push(`
      <div class="message assistant">
        <span class="assistant-avatar"><img src="assets/icon-32.png" alt=""></span>
        <div class="typing-bubble"><span></span><span></span><span></span></div>
      </div>`);
  }

  messagesEl.innerHTML = parts.join("");
  messagesEl.querySelectorAll(".bubble.is-streaming").forEach(mountStreamCaret);
  if (scroll === "bottom") {
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  } else {
    messagesEl.scrollTop = 0;
  }
}

function sessionRowMarkup(session) {
  const active = session.id === sessionsState.activeId;
  const editing = session.id === editingSessionId;
  const busy = session.id === sendingSessionId;
  const count = roleMessages(session).length;
  if (editing) {
    return `
      <div class="session-row${active ? " is-active" : ""}" data-session-id="${esc(session.id)}">
        <div class="session-main">
          <input class="session-rename-input" data-rename-id="${esc(session.id)}" value="${esc(session.title)}" aria-label="重命名会话">
          <span class="session-row-meta">${esc(timeLabel(session.updatedAt))} · ${count} 条消息</span>
        </div>
      </div>`;
  }
  return `
    <div class="session-row${active ? " is-active" : ""}" data-session-id="${esc(session.id)}">
      <button class="session-main" type="button" data-session-open="${esc(session.id)}">
        <span class="session-row-title">${session.pinned ? icons.pin : ""}${esc(session.title)}</span>
        <span class="session-row-preview">${esc(session.preview || "开始一段新对话")}</span>
        <span class="session-row-meta">${esc(timeLabel(session.updatedAt))} · ${count} 条消息</span>
      </button>
      <div class="session-actions">
        <button class="session-action" type="button" data-action="pin" data-id="${esc(session.id)}" title="${session.pinned ? "取消置顶" : "置顶"}">${icons.pin}</button>
        <button class="session-action" type="button" data-action="rename" data-id="${esc(session.id)}" title="重命名">${icons.edit}</button>
        <button class="session-action" type="button" data-action="delete" data-id="${esc(session.id)}" title="${busy ? "回复完成后可删除" : "删除"}"${busy ? " disabled" : ""}>${icons.trash}</button>
      </div>
    </div>`;
}

function renderSessions() {
  const query = searchQuery.trim().toLowerCase();
  let groups;

  if (query) {
    const matches = sessionsState.items.filter((session) =>
      `${session.title} ${session.preview}`.toLowerCase().includes(query)
    );
    groups = [{ label: "搜索结果", items: matches }];
  } else {
    const sorted = [...sessionsState.items].sort((a, b) => b.updatedAt - a.updatedAt);
    const pinned = sorted.filter((session) => session.pinned);
    groups = [
      { label: "置顶", items: pinned },
      { label: "今天", items: sorted.filter((session) => !session.pinned && groupFor(session.updatedAt) === "today") },
      { label: "昨天", items: sorted.filter((session) => !session.pinned && groupFor(session.updatedAt) === "yesterday") },
      { label: "更早", items: sorted.filter((session) => !session.pinned && groupFor(session.updatedAt) === "earlier") }
    ];
  }

  const visibleGroups = groups.filter((group) => group.items.length);
  sessionList.innerHTML = visibleGroups.length
    ? visibleGroups.map((group) => `
        <div class="session-group-label">${group.label}</div>
        ${group.items.map(sessionRowMarkup).join("")}
      `).join("")
    : '<div class="session-empty">没有找到匹配的会话。<br>换个关键词试试。</div>';

  const renameInput = sessionList.querySelector("[data-rename-id]");
  if (renameInput) {
    requestAnimationFrame(() => {
      renameInput.focus();
      renameInput.select();
    });
    renameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameInput.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editingSessionId = null;
        renderSessions();
      }
    });
    renameInput.addEventListener("blur", () => {
      const id = renameInput.dataset.renameId;
      if (editingSessionId !== id) return;
      const session = sessionsState.items.find((item) => item.id === id);
      const title = renameInput.value.trim();
      if (session && title && title !== session.title) {
        session.title = title;
        session.updatedAt = Date.now();
      }
      editingSessionId = null;
      saveSessions();
      renderSessions();
      updateHeader();
      showChatToast("会话已重命名");
    });
  }
}

function updateAll() {
  updateHeader();
  renderMessages("bottom");
  renderSessions();
  updateContextUI();
  updateScreenshotUI();
  updateComposer();
}

function postToParent(payload) {
  if (!EMBEDDED) return;
  window.parent.postMessage({ source: "lychee-chat", ...payload }, "*");
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("复制失败");
}

function bindWindowDrag() {
  if (!EMBEDDED) return;
  const header = $(".chat-head");
  let pointerId = null;

  const endDrag = (event) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    const id = pointerId;
    pointerId = null;
    try {
      if (header.hasPointerCapture(id)) header.releasePointerCapture(id);
    } catch {}
    header.classList.remove("is-dragging");
    postToParent({ type: "drag-end" });
  };

  header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointerId !== null) return;
    if (event.target.closest("button, a, input, textarea, select, label")) return;
    pointerId = event.pointerId;
    try {
      header.setPointerCapture(pointerId);
    } catch {}
    header.classList.add("is-dragging");
    postToParent({
      type: "drag-start",
      screenX: event.screenX,
      screenY: event.screenY
    });
    event.preventDefault();
  });

  header.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    postToParent({
      type: "drag-move",
      screenX: event.screenX,
      screenY: event.screenY
    });
  });

  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
  header.addEventListener("lostpointercapture", endDrag);
}

function openOptionsPage() {
  if (ext?.runtime?.openOptionsPage) {
    try {
      const result = ext.runtime.openOptionsPage();
      if (result?.catch) result.catch(() => {
        if (EMBEDDED) postToParent({ type: "open-options" });
        else window.open("options.html", "_blank");
      });
      return;
    } catch {}
  }
  if (EMBEDDED) postToParent({ type: "open-options" });
  else window.open("options.html", "_blank");
}

function openSessions() {
  closeContext();
  renderSessions();
  sessionsDrawer.classList.add("is-open");
  sessionsDrawer.setAttribute("aria-hidden", "false");
  sessionScrim.classList.add("is-open");
}

function closeSessions() {
  sessionsDrawer.classList.remove("is-open");
  sessionsDrawer.setAttribute("aria-hidden", "true");
  sessionScrim.classList.remove("is-open");
}

function openContext() {
  closeSessions();
  updateContextUI();
  contextPopover.classList.add("is-open");
  contextPopover.setAttribute("aria-hidden", "false");
  contextStrip.setAttribute("aria-expanded", "true");
}

function closeContext() {
  contextPopover.classList.remove("is-open");
  contextPopover.setAttribute("aria-hidden", "true");
  contextStrip.setAttribute("aria-expanded", "false");
}

function createSession() {
  const session = makeSession();
  sessionsState.items.unshift(session);
  sessionsState.activeId = session.id;
  editingSessionId = null;
  searchQuery = "";
  sessionSearch.value = "";
  closeSessions();
  closeContext();
  clearPendingAttachments();
  clearChatError();
  saveSessions();
  updateAll();
  composerInput.focus();
}

function selectSession(id) {
  if (!sessionsState.items.some((session) => session.id === id)) return;
  if (id === sessionsState.activeId) {
    closeSessions();
    closeContext();
    return;
  }
  sessionsState.activeId = id;
  editingSessionId = null;
  closeSessions();
  closeContext();
  clearPendingAttachments();
  clearChatError();
  saveSessions();
  updateAll();
  composerInput.focus();
}

function deleteSession(id) {
  if (sendingSessionId === id) {
    showChatToast("这条会话正在发送或等待回复，请先停止生成或稍后再删除", true);
    return;
  }
  const index = sessionsState.items.findIndex((session) => session.id === id);
  if (index === -1) return;
  const wasActive = sessionsState.activeId === id;
  sessionsState.items.splice(index, 1);
  sessionsState.deleted[id] = Date.now();
  if (!sessionsState.items.length) {
    createSession();
    showChatToast("会话已删除");
    return;
  }
  if (wasActive) sessionsState.activeId = sessionsState.items[0].id;
  editingSessionId = null;
  saveSessions();
  updateAll();
  showChatToast("会话已删除");
}

function setScreenshot(on) {
  prefs.screenshotOn = on;
  savePrefs();
  updateScreenshotUI();
  showChatToast(on ? "每轮截图已开启" : "本轮不会附带截图");
}

function updateComposerHeight() {
  composerInput.style.height = "auto";
  composerInput.style.height = `${Math.min(composerInput.scrollHeight, 90)}px`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function renderPendingAttachments() {
  pendingAttachmentsEl.hidden = !pendingAttachments.length;
  pendingAttachmentsEl.innerHTML = pendingAttachments.map((attachment, index) => `
    <div class="pending-attachment">
      <img src="${attachment.dataUrl}" alt="${esc(attachment.name)}">
      <button class="remove-attachment" type="button" data-remove-attachment="${index}" aria-label="移除 ${esc(attachment.name)}">×</button>
    </div>
  `).join("");
  updateComposer();
}

function clearPendingAttachments() {
  if (!pendingAttachments.length) return;
  pendingAttachments = [];
  renderPendingAttachments();
}

async function addFiles(files) {
  if (!provider) {
    showChatToast("请先在设置中配置视觉模型", true);
    return;
  }
  const list = [...files];
  if (pendingAttachments.length >= 4) {
    showChatToast("最多附带 4 张图片", true);
    return;
  }
  let added = 0;
  for (const file of list) {
    if (pendingAttachments.length >= 4) {
      showChatToast("最多附带 4 张图片", true);
      break;
    }
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      showChatToast(`${file.name} 不是支持的图片格式`, true);
      continue;
    }
    if (file.size > 8 * 1024 * 1024) {
      showChatToast(`${file.name} 超过 8MB`, true);
      continue;
    }
    try {
      const raw = await fileToDataUrl(file);
      const dataUrl = await downscaleImage(raw, 1280, 0.78);
      pendingAttachments.push({ name: file.name, type: "image/jpeg", dataUrl });
      added += 1;
    } catch (error) {
      showChatToast(`${file.name}：${error.message}`, true);
    }
  }
  renderPendingAttachments();
  if (added) showChatToast(`已添加 ${added} 张图片`);
}

function capturePageScreenshot() {
  if (!EMBEDDED) {
    return Promise.reject(new Error("请从网页右上角的聊天窗使用截图"));
  }
  return new Promise((resolve, reject) => {
    const requestId = makeId();
    const timer = setTimeout(() => {
      pendingCaptures.delete(requestId);
      reject(new Error("截图超时"));
    }, 12000);
    pendingCaptures.set(requestId, { resolve, reject, timer });
    postToParent({ type: "capture", requestId });
  });
}

async function downscaleImage(dataUrl, maxWidth = 1280, quality = 0.72) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("图片解析失败"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function buildSummary(olderMessages, previous) {
  const userSnippets = olderMessages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => truncate(message.text, 70));
  const assistantSnippets = olderMessages
    .filter((message) => message.role === "assistant")
    .slice(-2)
    .map((message) => truncate(message.text, 90));

  let summary = "";
  if (previous?.summary) summary += `早先摘要：${truncate(previous.summary, 160)} `;
  if (userSnippets.length) summary += `用户关注：${userSnippets.join("；")}。`;
  if (assistantSnippets.length) summary += `助手结论：${assistantSnippets.join("；")}。`;
  if (prefs.strategy.includes("代码")) {
    const code = olderMessages
      .map((message) => message.text.match(/```[\s\S]*?```/g) || [])
      .flat()
      .join("\n")
      .slice(0, 300);
    if (code) summary += ` 保留代码片段：${code}`;
  }
  return summary.slice(0, 900) || "较早对话已折叠。";
}

function compressSession(sessionId = sessionsState.activeId, auto = false) {
  const session = sessionsState.items.find((item) => item.id === sessionId);
  if (!session) return;
  const messages = roleMessages(session);
  const keepCount = prefs.strategy === "只保留最近 10 轮" ? 20 : 6;
  if (messages.length <= keepCount) {
    if (!auto) showChatToast("当前会话还没有足够的消息可以压缩", true);
    return;
  }

  const olderCount = messages.length - keepCount;
  const older = messages.slice(0, olderCount);
  const recent = messages.slice(-keepCount);
  const previous = session.messages.find((message) => message.type === "compressed");
  const summary = buildSummary(older, previous);

  session.messages = [
    {
      type: "compressed",
      summary,
      count: olderCount + (Number(previous?.count) || 0)
    },
    ...recent
  ];
  session.compressedOpen = true;
  session.updatedAt = Date.now();
  saveSessions();

  if (sessionsState.activeId === session.id) {
    renderMessages("top");
    renderSessions();
    updateContextUI();
  }
  showChatToast(auto
    ? "会话较长或接近上下文上限，已自动压缩"
    : `已压缩 ${olderCount} 条消息`);
}

function maybeAutoCompress(session) {
  if (!prefs.autoCompress) return;
  const messageCount = roleMessages(session).length;
  if (messageCount < 8) return;
  if (messageCount >= AUTO_COMPRESS_MESSAGE_LIMIT || contextPercent(session) >= prefs.threshold) {
    compressSession(session.id, true);
  }
}

function ensureAssistantDraft(stream) {
  if (stream.message) return stream.message;
  typingSessionId = null;
  const message = {
    role: "assistant",
    text: "",
    time: nowTime(),
    model: stream.modelLabel,
    streaming: true,
    searching: false,
    streamId: makeId(),
    sources: []
  };
  stream.session.messages.push(message);
  stream.message = message;
  if (sessionsState.activeId === stream.session.id) renderMessages("bottom");
  return message;
}

function renderStreamUpdate(stream) {
  if (stream.finished || !stream.message || sessionsState.activeId !== stream.session.id) return;
  const bubble = messagesEl.querySelector(`[data-stream-id="${stream.message.streamId}"] .bubble`);
  if (bubble) {
    bubble.innerHTML = formatAssistantText(stream.message.text);
    mountStreamCaret(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    renderMessages("bottom");
  }
}

function finalizeStream(stream, { aborted = false, error = null, fullText = "" } = {}) {
  if (stream.finished) return;
  stream.finished = true;
  if (fullText) {
    if (stream.message) {
      stream.message.text = fullText;
    } else {
      stream.message = {
        role: "assistant",
        text: fullText,
        time: nowTime(),
        model: stream.modelLabel,
        streamId: makeId()
      };
      stream.session.messages.push(stream.message);
    }
  }
  if (stream.message) {
    stream.message.streaming = false;
    stream.message.searching = false;
  }
  if (!stream.message || !stream.message.text) {
    if (stream.message) {
      stream.session.messages = stream.session.messages.filter((message) => message !== stream.message);
      stream.message = null;
    }
  }
  if (typingSessionId === stream.session.id) typingSessionId = null;
  if (sendingSessionId === stream.session.id) sendingSessionId = null;
  stream.session.updatedAt = Date.now();
  if (activeStream === stream) activeStream = null;
  saveSessions();
  if (sessionsState.activeId === stream.session.id) renderMessages("bottom");
  renderSessions();
  updateContextUI();
  updateComposer();
  if (error) {
    if (sessionsState.activeId === stream.session.id) showChatError(error);
    showChatToast(`请求失败：${error}`, true);
  } else if (aborted) {
    showChatToast("已停止生成");
  } else {
    clearChatError();
    maybeAutoCompress(stream.session);
  }
  try {
    stream.port?.disconnect();
  } catch {}
}

function startChatStream(payload, session) {
  const stream = {
    session,
    message: null,
    port: null,
    finished: false,
    modelLabel: activeModelLabel()
  };
  activeStream = stream;
  typingSessionId = session.id;
  sendingSessionId = session.id;
  updateComposer();

  let port;
  try {
    port = ext.runtime.connect({ name: "lychee-chat-stream" });
  } catch (error) {
    finalizeStream(stream, { error: error.message || "无法建立流式连接" });
    return;
  }
  stream.port = port;

  port.onMessage.addListener((message) => {
    if (!message || stream.finished) return;
    if (message.type === "delta") {
      const delta = typeof message.text === "string" ? message.text : "";
      if (!delta) return;
      ensureAssistantDraft(stream);
      stream.message.text += delta;
      renderStreamUpdate(stream);
    } else if (message.type === "search-start") {
      ensureAssistantDraft(stream);
      stream.message.searching = true;
      if (sessionsState.activeId === stream.session.id) renderMessages("bottom");
    } else if (message.type === "sources") {
      const sources = normalizeMessageSources(message.sources);
      if (!sources.length) return;
      ensureAssistantDraft(stream);
      stream.message.sources = sources;
      stream.message.searching = false;
      if (sessionsState.activeId === stream.session.id) renderMessages("bottom");
    } else if (message.type === "done") {
      finalizeStream(stream, { fullText: String(message.text || "") });
    } else if (message.type === "error") {
      finalizeStream(stream, { error: message.error || "流式请求失败" });
    } else if (message.type === "aborted") {
      finalizeStream(stream, { aborted: true });
    }
  });

  port.onDisconnect.addListener(() => {
    if (stream.finished) return;
    finalizeStream(stream, { error: "流式连接中断，请重试" });
  });

  try {
    port.postMessage({ type: "start", ...payload });
  } catch (error) {
    finalizeStream(stream, { error: error.message || "无法启动生成" });
  }
}

function stopStreaming() {
  if (!activeStream || activeStream.finished) return;
  finalizeStream(activeStream, { aborted: true });
}

async function sendMessage() {
  if (!provider) {
    showChatToast("请先在设置中配置视觉模型", true);
    openOptionsPage();
    return;
  }
  if (sendingSessionId) {
    showChatToast("请等待上一条回复完成", true);
    return;
  }
  const typedText = composerInput.value.trim();
  const attachmentSnapshot = pendingAttachments.slice();
  if (!typedText && !attachmentSnapshot.length) return;
  const text = typedText || "请分析这些附件。";
  if (text.length > 20000) {
    showChatToast("消息过长，请缩短后再发送", true);
    return;
  }
  const session = activeSession();
  if (!session) return;
  const messageCount = roleMessages(session).length;
  if (prefs.autoCompress) {
    if (messageCount >= AUTO_COMPRESS_MESSAGE_LIMIT ||
        (messageCount >= 8 && contextPercent(session) >= prefs.threshold)) {
      compressSession(session.id, true);
    }
  } else if (messageCount >= MAX_HISTORY_MESSAGES) {
    showChatToast("会话消息过多，请先手动压缩上下文或开启自动压缩", true);
    return;
  }
  clearChatError();

  const userMessage = {
    role: "user",
    text,
    screenshot: prefs.screenshotOn,
    time: nowTime(),
    screenshotData: null,
    attachments: attachmentSnapshot.map((attachment) => ({
      name: attachment.name,
      type: attachment.type,
      dataUrl: attachment.dataUrl
    }))
  };
  session.messages.push(userMessage);
  if (session.title === "新会话") session.title = truncate(text, 18);
  session.preview = truncate(text, 46);
  session.updatedAt = Date.now();
  typingSessionId = session.id;
  sendingSessionId = session.id;

  composerInput.value = "";
  pendingAttachments = [];
  renderPendingAttachments();
  updateComposerHeight();
  saveSessions();
  renderMessages("bottom");
  renderSessions();
  updateHeader();
  updateContextUI();
  updateComposer();

  let screenshotData = null;
  if (prefs.screenshotOn) {
    try {
      const raw = await capturePageScreenshot();
      screenshotData = await downscaleImage(raw);
      userMessage.screenshotData = screenshotData;
      if (sessionsState.activeId === session.id) renderMessages("bottom");
    } catch (error) {
      userMessage.screenshot = false;
      saveSessions();
      if (sessionsState.activeId === session.id) renderMessages("bottom");
      showChatToast(`截图失败，本条只发送文字：${error.message}`, true);
    }
  }

  const history = roleMessages(session)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, text: message.text }));
  const compressed = session.messages.find((message) => message.type === "compressed");

  startChatStream({
    messages: history,
    contextSummary: compressed?.summary || "",
    screenshotDataUrl: screenshotData,
    attachments: attachmentSnapshot.map((attachment) => attachment.dataUrl),
    webSearch: deepseekWebSearchAvailable() && Boolean(prefs.webSearchOn)
  }, session);
}

function bindEvents() {
  bindWindowDrag();
  $("#sessionsBtn").addEventListener("click", openSessions);
  $("#sessionTitleBtn").addEventListener("click", openSessions);
  $("#closeSessions").addEventListener("click", closeSessions);
  sessionScrim.addEventListener("click", closeSessions);
  contextStrip.addEventListener("click", () => {
    if (contextPopover.classList.contains("is-open")) closeContext();
    else openContext();
  });
  $("#closeContext").addEventListener("click", closeContext);
  $("#contextAdjustBtn").addEventListener("click", () => {
    closeContext();
    openOptionsPage();
  });

  document.addEventListener("click", (event) => {
    const optionsLink = event.target.closest('a[href="options.html"]');
    if (optionsLink) {
      event.preventDefault();
      openOptionsPage();
      return;
    }
    if (!contextPopover.classList.contains("is-open")) return;
    if (event.target.closest("#contextPopover") || event.target.closest("#contextStrip")) return;
    closeContext();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && importPanel.classList.contains("is-open")) {
      const focusables = [...importPanel.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href]")]
        .filter((element) => element.getClientRects().length);
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !importPanel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !importPanel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (importPanel.classList.contains("is-open")) closeDeepSeekImport();
    else if (sessionsDrawer.classList.contains("is-open")) closeSessions();
    else if (contextPopover.classList.contains("is-open")) closeContext();
  });

  $("#newChatBtn").addEventListener("click", createSession);
  $("#newSessionBtn").addEventListener("click", createSession);
  $("#demoSettingsBtn").addEventListener("click", openOptionsPage);
  $("#errorNoticeSettings").addEventListener("click", openOptionsPage);
  $("#errorNoticeClose").addEventListener("click", clearChatError);

  sessionList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) {
      const session = sessionsState.items.find((item) => item.id === action.dataset.id);
      if (!session) return;
      if (action.dataset.action === "pin") {
        session.pinned = !session.pinned;
        session.updatedAt = Date.now();
        saveSessions();
        renderSessions();
        showChatToast(session.pinned ? "会话已置顶" : "已取消置顶");
      }
      if (action.dataset.action === "rename") {
        editingSessionId = session.id;
        searchQuery = "";
        sessionSearch.value = "";
        renderSessions();
      }
      if (action.dataset.action === "delete") deleteSession(session.id);
      return;
    }
    const openButton = event.target.closest("[data-session-open]");
    if (openButton) selectSession(openButton.dataset.sessionOpen);
  });

  sessionSearch.addEventListener("input", () => {
    searchQuery = sessionSearch.value;
    renderSessions();
  });

  importSessionsBtn.addEventListener("click", openDeepSeekImport);
  $("#closeImport").addEventListener("click", () => closeDeepSeekImport());
  importScrim.addEventListener("click", () => closeDeepSeekImport());
  importCancel.addEventListener("click", () => closeDeepSeekImport());
  importPickBtn.addEventListener("click", () => importFileInput.click());
  importReselectBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files?.[0];
    loadDeepSeekFile(file);
  });
  importSearch.addEventListener("input", () => {
    deepseekQuery = importSearch.value;
    renderDeepseekSessions();
  });
  importSelectAll.addEventListener("click", toggleAllDeepseekSessions);
  importList.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-import-id]");
    if (!input) return;
    const id = input.value;
    if (input.checked) {
      deepseekSelected.add(id);
    } else {
      deepseekSelected.delete(id);
    }
    updateDeepseekSelectionUI();
  });
  importConfirm.addEventListener("click", runDeepSeekImport);

  composerInput.addEventListener("input", () => {
    updateComposerHeight();
    updateComposer();
  });
  composerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener("click", () => {
    if (activeStream && sendingSessionId) {
      stopStreaming();
      return;
    }
    if (!sendingSessionId) sendMessage();
  });
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    await addFiles(files);
  });
  pendingAttachmentsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-attachment]");
    if (!button) return;
    pendingAttachments.splice(Number(button.dataset.removeAttachment), 1);
    renderPendingAttachments();
  });

  $("#shotRemove").addEventListener("click", () => setScreenshot(false));
  captureToggle.addEventListener("click", () => setScreenshot(!prefs.screenshotOn));
  webSearchToggle.addEventListener("click", () => {
    prefs.webSearchOn = !prefs.webSearchOn;
    savePrefs();
    updateWebSearchUI();
  });

  messagesEl.addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-copy-code]");
    if (copyButton) {
      const code = copyButton.closest(".md-code-block")?.querySelector("code")?.textContent || "";
      copyToClipboard(code).then(() => {
        copyButton.textContent = "已复制";
        setTimeout(() => { copyButton.textContent = "复制"; }, 1600);
      }).catch(() => showChatToast("复制失败，请手动选择代码", true));
      return;
    }
    const suggestion = event.target.closest("[data-suggestion]");
    if (suggestion) {
      composerInput.value = suggestion.dataset.suggestion;
      updateComposerHeight();
      updateComposer();
      composerInput.focus();
      return;
    }
    const optionsButton = event.target.closest('[data-action="open-options"]');
    if (optionsButton) {
      openOptionsPage();
      return;
    }
    const compressed = event.target.closest("[data-compressed-toggle]");
    if (compressed) {
      const session = activeSession();
      const summary = compressed.parentElement.querySelector(".compressed-summary");
      const opening = summary.hidden;
      summary.hidden = !opening;
      compressed.classList.toggle("is-open", opening);
      if (session) session.compressedOpen = opening;
      saveSessions();
    }
  });

  $("#compressBtn").addEventListener("click", () => compressSession());
  $("#autoCompress").addEventListener("change", (event) => {
    prefs.autoCompress = event.target.checked;
    savePrefs();
    updateContextUI();
  });
  $$("#thresholdSeg button").forEach((button) => {
    button.addEventListener("click", () => {
      prefs.threshold = Number(button.dataset.value);
      savePrefs();
      updateContextUI();
    });
  });
  $("#compressionStrategy").addEventListener("change", (event) => {
    prefs.strategy = event.target.value;
    savePrefs();
  });

  const expandIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 14 6-6 6 6"/></svg>';
  let minimized = false;
  minimizeIcon = minimizeButton.innerHTML;

  minimizeButton.addEventListener("click", () => {
    minimized = !minimized;
    chatWindow.classList.toggle("is-minimized", minimized);
    minimizeButton.innerHTML = minimized ? expandIcon : minimizeIcon;
    minimizeButton.title = minimized ? "展开" : "最小化";
    minimizeButton.setAttribute("aria-label", minimized ? "展开聊天窗口" : "最小化");
    closeSessions();
    closeContext();
    if (EMBEDDED) postToParent({ type: "resize", minimized });
  });

  $("#closeBtn").addEventListener("click", () => {
    closeSessions();
    closeContext();
    if (EMBEDDED) {
      postToParent({ type: "close" });
    } else {
      chatWindow.style.display = "none";
      chatLauncher.hidden = false;
    }
  });

  chatLauncher.addEventListener("click", () => {
    chatLauncher.hidden = true;
    chatWindow.style.display = "flex";
    composerInput.focus();
  });

  window.addEventListener("message", (event) => {
    if (!EMBEDDED || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.source !== "lychee-page") return;

    if (data.type === "capture-result") {
      const pending = pendingCaptures.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingCaptures.delete(data.requestId);
      if (data.ok && data.dataUrl) pending.resolve(data.dataUrl);
      else pending.reject(new Error(data.error || "截图失败"));
    }

    if (data.type === "expand") {
      minimized = false;
      chatWindow.classList.remove("is-minimized");
      minimizeButton.innerHTML = minimizeIcon;
      minimizeButton.title = "最小化";
      minimizeButton.setAttribute("aria-label", "最小化");
    }
  });

  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[SESSIONS_KEY]) {
        absorbRemoteSessions(changes[SESSIONS_KEY].newValue || null);
      }
      if (changes[SETTINGS_KEY]) {
        settings = changes[SETTINGS_KEY].newValue || null;
        resolveProvider();
        updateHeader();
        updateContextUI();
        updateComposer();
        if (!roleMessages(activeSession()).length) renderMessages("top");
      }
      if (changes[PREFS_KEY]) {
        prefs = { ...DEFAULT_PREFS, ...(changes[PREFS_KEY].newValue || {}) };
        updateScreenshotUI();
        updateWebSearchUI();
        updateContextUI();
      }
    });
  } catch {}
}

async function loadAll() {
  bindEvents();
  if (PAGE_LABEL) {
    const pageInfo = $(".shot-copy small");
    if (pageInfo) pageInfo.textContent = `${PAGE_LABEL} · 发送时附带`;
  }
  try {
    const stored = await ext.storage.local.get([SETTINGS_KEY, SESSIONS_KEY, PREFS_KEY]);
    settings = stored[SETTINGS_KEY] || null;
    prefs = { ...DEFAULT_PREFS, ...(stored[PREFS_KEY] || {}) };
    const loadedSessions = stored[SESSIONS_KEY];
    if (loadedSessions) {
      const deleted = pruneDeletedSessions(loadedSessions.deleted);
      sessionsState = {
        activeId: loadedSessions.activeId || null,
        items: (loadedSessions.items || []).filter((session) => !deleted[session.id]),
        deleted
      };
    }
    ensureSession();
    resolveProvider();
    updateAll();
    saveSessions();
  } catch (error) {
    showChatToast(`读取本地数据失败：${error.message}`, true);
    ensureSession();
    resolveProvider();
    updateAll();
  }
}

loadAll();

