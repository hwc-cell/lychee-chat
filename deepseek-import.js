const decoder = new TextDecoder("utf-8");
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function u16(view, offset) {
  return view.getUint16(offset, true);
}

function u32(view, offset) {
  return view.getUint32(offset, true);
}

async function readBytes(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function readZipEntries(file) {
  const tailLength = Math.min(file.size, 65557);
  const tail = await readBytes(file, file.size - tailLength, file.size);
  const tailView = new DataView(tail.buffer);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tailView.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP 文件");

  const count = u16(tailView, eocd + 10);
  const directorySize = u32(tailView, eocd + 12);
  const directoryOffset = u32(tailView, eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("暂不支持 ZIP64，请解压后选择 single JSON 文件");
  }

  const directory = await readBytes(file, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer);
  const entries = new Map();
  let offset = 0;
  for (let index = 0; index < count && offset + 46 <= directory.length; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = decoder.decode(directory.subarray(offset + 46, offset + 46 + nameLength));
    if (!name.endsWith("/")) {
      entries.set(name, {
        name,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localOffset
      });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(file, entry) {
  if (entry.flags & 1) throw new Error("不支持加密的 ZIP 条目");
  const header = await readBytes(file, entry.localOffset, entry.localOffset + 30);
  const view = new DataView(header.buffer);
  if (view.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error("ZIP 文件结构损坏");
  const nameLength = u16(view, 26);
  const extraLength = u16(view, 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = await readBytes(file, start, start + entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error(`暂不支持 ZIP 压缩方式 ${entry.method}`);
  if (typeof DecompressionStream !== "function") {
    throw new Error("当前浏览器不支持解压 ZIP，请解压后选择单个 JSON 文件");
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseJson(bytes) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error("DeepSeek 导出文件中的 JSON 无法解析");
  }
}

function timeValue(value, fallback = 0) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function displayTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function indexMeta(item) {
  return {
    id: String(item.id || ""),
    title: String(item.title || "").trim(),
    messageCount: Math.max(0, Number(item.message_count) || 0),
    insertedAt: item.inserted_at || "",
    updatedAt: item.updated_at || item.inserted_at || "",
    pinned: Boolean(item.pinned),
    rawSize: Number(item.rawSize) || 0
  };
}

function metadataFromFile(raw, fallback = {}) {
  return indexMeta({
    id: raw?.id ?? fallback.id,
    title: raw?.title ?? fallback.title,
    message_count: raw?.messages?.length || fallback.messageCount,
    inserted_at: raw?.inserted_at ?? fallback.insertedAt,
    updated_at: raw?.updated_at ?? fallback.updatedAt,
    pinned: raw?.pinned ?? fallback.pinned
  });
}

function openJsonExport(parsed) {
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const sessionsById = new Map();
  for (const raw of rows) {
    if (!raw || !Array.isArray(raw.messages)) continue;
    sessionsById.set(String(raw.id || `json-${sessionsById.size + 1}`), raw);
  }
  if (!sessionsById.size) throw new Error("这个 JSON 里没有可导入的 DeepSeek 会话");
  const sessions = [...sessionsById.values()].map((raw) => metadataFromFile(raw));
  return {
    sessions,
    readSession: async (sessionId) => sessionsById.get(String(sessionId))
  };
}

export async function openDeepSeekExport(file) {
  if (!file) throw new Error("没有选择文件");
  const head = await readBytes(file, 0, Math.min(4, file.size));
  const isZip = head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error("请选择 DeepSeek 导出的 ZIP 或会话 JSON 文件");
    }
    return openJsonExport(parsed);
  }

  const entries = await readZipEntries(file);
  const indexEntry = entries.get("chat_session_index.json");
  if (!indexEntry) {
    throw new Error("ZIP 中缺少 chat_session_index.json，请选择完整的 DeepSeek 导出包");
  }
  const index = parseJson(await readZipEntry(file, indexEntry));
  if (!Array.isArray(index)) throw new Error("DeepSeek 会话索引格式不正确");

  let formatVersion = null;
  const manifestEntry = entries.get("manifest.json");
  if (manifestEntry) {
    try {
      formatVersion = parseJson(await readZipEntry(file, manifestEntry))?.export_format_version ?? null;
    } catch {}
  }
  if (formatVersion != null && Number(formatVersion) !== 3) {
    throw new Error(`只支持 DeepSeek 导出版本 3，当前为 ${formatVersion}`);
  }

  const sessions = index
    .map((item) => {
      const meta = indexMeta(item);
      const path = `chat_sessions/${meta.id}.json`;
      const entry = entries.get(path);
      return entry ? { ...meta, rawSize: entry.uncompressedSize } : null;
    })
    .filter(Boolean);

  if (!sessions.length) throw new Error("ZIP 中没有找到可导入的会话");

  return {
    sessions,
    async readSession(sessionId) {
      const entry = entries.get(`chat_sessions/${sessionId}.json`);
      if (!entry) throw new Error("找不到会话文件");
      return parseJson(await readZipEntry(file, entry));
    }
  };
}

function activePath(raw) {
  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  if (!messages.length) return [];
  const byId = new Map(messages.map((message) => [String(message.id), message]));
  let current = raw?.current_message_id != null ? String(raw.current_message_id) : "";
  const path = [];
  const seen = new Set();
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const message = byId.get(current);
    path.unshift(message);
    current = message.parent_id != null ? String(message.parent_id) : "";
  }
  if (path.length) return path;
  return [...messages].sort((a, b) => timeValue(a.inserted_at) - timeValue(b.inserted_at));
}

function fragmentsText(fragments, allowedTypes) {
  return fragments
    .filter((fragment) => allowedTypes.has(String(fragment?.type || "").toUpperCase()))
    .map((fragment) => String(fragment.content || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function filesFromFragments(fragments) {
  return fragments
    .filter((fragment) => String(fragment?.type || "").toUpperCase() === "FILE")
    .flatMap((fragment) => Array.isArray(fragment.files) ? fragment.files : [])
    .filter((file) => file && file.file_name)
    .map((file) => ({
      name: String(file.file_name),
      type: file.is_image ? "image" : "file"
    }));
}

export function deepseekSessionToLocal(raw, meta) {
  const path = activePath(raw);
  const messages = [];
  for (const source of path) {
    const role = String(source.role || "").toLowerCase();
    const fragments = Array.isArray(source.fragments) ? source.fragments : [];
    const time = displayTime(source.inserted_at);
    if (role === "user") {
      const text = fragmentsText(fragments, new Set(["REQUEST"]));
      const attachments = filesFromFragments(fragments);
      if (!text && !attachments.length) continue;
      messages.push({ role: "user", text, time, screenshot: false, attachments });
    } else if (role === "assistant") {
      const text = fragmentsText(fragments, new Set(["RESPONSE", "TEMPLATE_RESPONSE"]));
      if (!text) continue;
      messages.push({ role: "assistant", text, time, model: "DeepSeek", streaming: false });
    }
  }
  if (!messages.length) return null;

  const firstUser = messages.find((message) => message.role === "user");
  const lastText = [...messages].reverse().find((message) => message.text)?.text || "";
  const createdAt = timeValue(raw?.inserted_at || meta?.insertedAt, Date.now());
  const updatedAt = Math.max(createdAt, timeValue(raw?.updated_at || meta?.updatedAt, createdAt));
  const id = `deepseek-${String(raw?.id || meta?.id || Date.now())}`;
  return {
    id,
    title: String(raw?.title || meta?.title || firstUser?.text || "DeepSeek 对话").trim().slice(0, 80) || "DeepSeek 对话",
    preview: lastText.replace(/\s+/g, " ").trim().slice(0, 46) || "已导入 DeepSeek 对话",
    pinned: Boolean(raw?.pinned ?? meta?.pinned),
    createdAt,
    updatedAt,
    messages,
    compressedOpen: false,
    importedFrom: "deepseek"
  };
}
