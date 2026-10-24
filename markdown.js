const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

const LIST_RE = /^(\s*)([-+*]|\d{1,9}[.)])\s+(.*)$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function normalizeUrl(value) {
  let url = String(value || "").trim();
  if (!url) return "";
  if (/^www\./i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function linkHtml(label, href, title = "") {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${label}</a>`;
}

function fenceInfo(line) {
  const match = FENCE_RE.exec(line);
  if (!match) return null;
  if (match[1][0] === "`" && match[2].includes("`")) return null;
  return {
    char: match[1][0],
    length: match[1].length,
    info: match[2].trim()
  };
}

function isFenceClose(line, fence) {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(
    match &&
    match[1][0] === fence.char &&
    match[1].length >= fence.length
  );
}

function listInfo(line) {
  const match = LIST_RE.exec(line);
  if (!match) return null;
  const indent = match[1].replace(/\t/g, "    ").length;
  const ordered = /^\d/.test(match[2]);
  return {
    indent,
    ordered,
    marker: match[2],
    start: ordered ? Number.parseInt(match[2], 10) : 1,
    text: match[3]
  };
}

function isHr(line) {
  return HR_RE.test(line);
}

function findUnescaped(text, marker, from) {
  let index = text.indexOf(marker, from);
  while (index !== -1) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
    index = text.indexOf(marker, index + marker.length);
  }
  return -1;
}

function parseLink(text, bracketIndex) {
  let depth = 0;
  let endLabel = -1;
  for (let index = bracketIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      if (depth === 0) {
        endLabel = index;
        break;
      }
      depth -= 1;
    }
  }
  if (endLabel === -1) return null;

  let cursor = endLabel + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] !== "(") return null;
  cursor += 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

  let rawUrl = "";
  if (text[cursor] === "<") {
    const close = text.indexOf(">", cursor + 1);
    if (close === -1) return null;
    rawUrl = text.slice(cursor + 1, close);
    cursor = close + 1;
  } else {
    const start = cursor;
    let parenDepth = 0;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === "\\" && cursor + 1 < text.length) {
        cursor += 2;
        continue;
      }
      if (char === "(") {
        parenDepth += 1;
        cursor += 1;
        continue;
      }
      if (char === ")") {
        if (parenDepth === 0) break;
        parenDepth -= 1;
        cursor += 1;
        continue;
      }
      if (/\s/.test(char) && parenDepth === 0) break;
      cursor += 1;
    }
    rawUrl = text.slice(start, cursor);
  }

  let title = "";
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] === '"' || text[cursor] === "'") {
    const quote = text[cursor];
    const close = text.indexOf(quote, cursor + 1);
    if (close !== -1) {
      title = text.slice(cursor + 1, close);
      cursor = close + 1;
    }
  }
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] !== ")") return null;

  const href = normalizeUrl(rawUrl);
  if (!href) return null;
  return {
    label: text.slice(bracketIndex + 1, endLabel),
    href,
    title,
    end: cursor + 1
  };
}

function renderInline(source, depth = 0) {
  const text = String(source ?? "");
  if (!text) return "";
  if (depth > 8) return escapeHtml(text);
  const out = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const rest = text.slice(index);

    if (char === "\n") {
      out.push("<br>");
      index += 1;
      continue;
    }

    if (char === "\\" && index + 1 < text.length && /[\\`*_{}[\]()#+\-.!~|>]/.test(text[index + 1])) {
      out.push(escapeHtml(text[index + 1]));
      index += 2;
      continue;
    }

    if (char === "`") {
      const run = /^`+/.exec(rest)[0];
      const close = text.indexOf(run, index + run.length);
      if (close !== -1) {
        let code = text.slice(index + run.length, close).replace(/\n/g, " ");
        if (code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        out.push(`<code>${escapeHtml(code)}</code>`);
        index = close + run.length;
        continue;
      }
      out.push(escapeHtml(run));
      index += run.length;
      continue;
    }

    if (char === "!" && text[index + 1] === "[") {
      const image = parseLink(text, index + 1);
      if (image) {
        const label = renderInline(image.label, depth + 1) || "查看图片";
        out.push(`<a class="md-image-link" href="${escapeHtml(image.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(image.title || "打开图片")}">图片：${label}</a>`);
        index = image.end;
        continue;
      }
    }

    if (char === "[") {
      const link = parseLink(text, index);
      if (link) {
        const label = renderInline(link.label, depth + 1) || escapeHtml(link.href);
        out.push(linkHtml(label, link.href, link.title));
        index = link.end;
        continue;
      }
    }

    if (char === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(rest);
      if (auto) {
        const href = normalizeUrl(auto[1]);
        if (href) {
          out.push(linkHtml(escapeHtml(auto[1]), href));
          index += auto[0].length;
          continue;
        }
      }
    }

    if ((char === "*" || char === "_" || char === "~") && text.startsWith(char + char, index)) {
      const triple = char === "*" && text.startsWith("***", index);
      const marker = triple ? "***" : char + char;
      const close = findUnescaped(text, marker, index + marker.length);
      const inner = close === -1 ? "" : text.slice(index + marker.length, close);
      const opens = inner && !/^\s/.test(inner) && !/\s$/.test(inner);
      if (opens && !(char === "_" && /[A-Za-z0-9]/.test(text[index - 1] || ""))) {
        const body = renderInline(inner, depth + 1);
        if (char === "~") out.push(`<del>${body}</del>`);
        else if (triple) out.push(`<strong><em>${body}</em></strong>`);
        else out.push(`<strong>${body}</strong>`);
        index = close + marker.length;
        continue;
      }
      out.push(escapeHtml(marker));
      index += marker.length;
      continue;
    }

    if (char === "*" || char === "_") {
      const after = text[index + 1];
      const before = text[index - 1] || "";
      const wordBoundaryIssue = char === "_" && /[A-Za-z0-9]/.test(before);
      if (!after || /\s/.test(after) || wordBoundaryIssue) {
        out.push(escapeHtml(char));
        index += 1;
        continue;
      }
      const close = findUnescaped(text, char, index + 1);
      if (close !== -1) {
        const inner = text.slice(index + 1, close);
        if (inner && !/^\s/.test(inner) && !/\s$/.test(inner) && !text.startsWith(char + char, close)) {
          out.push(`<em>${renderInline(inner, depth + 1)}</em>`);
          index = close + 1;
          continue;
        }
      }
      out.push(escapeHtml(char));
      index += 1;
      continue;
    }

    if (/^https?:\/\//i.test(rest)) {
      const before = text[index - 1] || "";
      if (!before || /[\s(（[【，。；：！？、]/.test(before)) {
        let url = /^https?:\/\/[^\s<>"'）】]+/i.exec(rest)[0];
        let suffix = "";
        while (/[.,;:!?，。；：！？、]$/.test(url)) {
          suffix = url.slice(-1) + suffix;
          url = url.slice(0, -1);
        }
        while (url.endsWith(")") && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) {
          suffix = ")" + suffix;
          url = url.slice(0, -1);
        }
        const href = normalizeUrl(url);
        if (href) {
          out.push(linkHtml(escapeHtml(url), href));
          out.push(escapeHtml(suffix));
          index += url.length + suffix.length;
          continue;
        }
      }
    }

    out.push(escapeHtml(char));
    index += 1;
  }

  return out.join("");
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
  const cells = [];
  let current = "";
  let inCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isDelimiterRow(line) {
  if (!String(line || "").includes("|")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableBlock(lines, start) {
  if (!String(lines[start] || "").includes("|")) return null;
  if (start + 1 >= lines.length || !isDelimiterRow(lines[start + 1])) return null;
  const head = splitTableRow(lines[start]);
  const delimiters = splitTableRow(lines[start + 1]);
  if (!head.length || head.length !== delimiters.length) return null;

  const alignments = delimiters.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return left ? "left" : "";
  });
  const rows = [];
  let cursor = start + 2;
  while (cursor < lines.length && String(lines[cursor]).trim() && String(lines[cursor]).includes("|")) {
    rows.push(splitTableRow(lines[cursor]));
    cursor += 1;
  }

  const cellHtml = (tag, value, align) => {
    const className = align ? ` class="md-align-${align}"` : "";
    return `<${tag}${className}>${renderInline(value)}</${tag}>`;
  };
  const headHtml = head.map((cell, index) => cellHtml("th", cell, alignments[index])).join("");
  const bodyHtml = rows.map((row) => {
    const cells = head.map((_, index) => row[index] || "");
    return `<tr>${cells.map((cell, index) => cellHtml("td", cell, alignments[index])).join("")}</tr>`;
  }).join("");

  return {
    html: `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headHtml}</tr></thead>${bodyHtml ? `<tbody>${bodyHtml}</tbody>` : ""}</table></div>`,
    end: cursor
  };
}

function codeBlockHtml(code, info = "") {
  const language = info.split(/\s+/)[0].replace(/[^A-Za-z0-9_+.#-]/g, "").slice(0, 24);
  return `
    <div class="md-code-block">
      <div class="md-code-head">
        <span>${escapeHtml(language || "代码")}</span>
        <button class="md-copy" type="button" data-copy-code aria-label="复制代码">复制</button>
      </div>
      <pre><code>${escapeHtml(code)}</code></pre>
    </div>`;
}

function isBlockStart(lines, index) {
  const line = lines[index];
  if (!line.trim()) return true;
  if (fenceInfo(line)) return true;
  if (HEADING_RE.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (isHr(line)) return true;
  if (listInfo(line)) return true;
  if (index + 1 < lines.length && tableBlock(lines, index)) return true;
  if (/^(?: {4}|\t)/.test(line)) return true;
  return false;
}

function listItemHtml(lines) {
  const content = [...lines];
  let task = "";
  const match = /^\[([ xX])\]\s+(.*)$/.exec(content[0] || "");
  if (match) {
    task = match[1].toLowerCase() === "x" ? "☑ " : "☐ ";
    content[0] = `${task}${match[2]}`;
  }
  return `<li>${renderBlocks(content.join("\n"), 1)}</li>`;
}

function parseList(lines, start) {
  const first = listInfo(lines[start]);
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const items = [];
  let cursor = start;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) {
      let lookahead = cursor + 1;
      while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
      if (lookahead >= lines.length) break;
      const nextInfo = listInfo(lines[lookahead]);
      const nextIndent = /^\s*/.exec(lines[lookahead])[0].replace(/\t/g, "    ").length;
      if ((nextInfo && nextInfo.indent >= baseIndent) || nextIndent >= baseIndent + 2) {
        if (items.length) items[items.length - 1].lines.push("");
        cursor += 1;
        continue;
      }
      break;
    }

    const info = listInfo(line);
    if (info) {
      if (info.indent < baseIndent) break;
      if (info.indent === baseIndent) {
        if (info.ordered !== ordered) break;
        items.push({ lines: [info.text] });
        cursor += 1;
        continue;
      }
      if (!items.length) break;
      items[items.length - 1].lines.push(`${" ".repeat(Math.max(0, info.indent - baseIndent - 2))}${line.trimStart()}`);
      cursor += 1;
      continue;
    }

    const indent = /^\s*/.exec(line)[0].replace(/\t/g, "    ").length;
    if (items.length && indent >= baseIndent + 2) {
      items[items.length - 1].lines.push(`${" ".repeat(indent - baseIndent - 2)}${line.trimStart()}`);
      cursor += 1;
      continue;
    }
    break;
  }

  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && first.start !== 1 ? ` start="${Math.max(0, first.start)}"` : "";
  return {
    html: `<${tag}${startAttr}>${items.map((item) => listItemHtml(item.lines)).join("")}</${tag}>`,
    end: cursor
  };
}

function renderBlocks(source, depth = 0) {
  if (depth > 12) return `<p>${escapeHtml(source)}</p>`;
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = fenceInfo(line);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !isFenceClose(lines[index], fence)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      out.push(codeBlockHtml(code.join("\n"), fence.info));
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level} class="md-h${level}">${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (isHr(line)) {
      out.push("<hr>");
      index += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoted = [];
      while (index < lines.length) {
        const quote = QUOTE_RE.exec(lines[index]);
        if (quote) {
          quoted.push(quote[1]);
          index += 1;
          continue;
        }
        if (!lines[index].trim() && index + 1 < lines.length && QUOTE_RE.test(lines[index + 1])) {
          quoted.push("");
          index += 1;
          continue;
        }
        break;
      }
      out.push(`<blockquote>${renderBlocks(quoted.join("\n"), depth + 1)}</blockquote>`);
      continue;
    }

    const table = tableBlock(lines, index);
    if (table) {
      out.push(table.html);
      index = table.end;
      continue;
    }

    if (listInfo(line)) {
      const list = parseList(lines, index);
      out.push(list.html);
      index = list.end;
      continue;
    }

    if (/^(?: {4}|\t)/.test(line)) {
      const code = [];
      while (index < lines.length) {
        const current = lines[index];
        if (!current.trim()) {
          code.push("");
          index += 1;
          continue;
        }
        if (!/^(?: {4}|\t)/.test(current)) break;
        code.push(current.replace(/^(?: {4}|\t)/, ""));
        index += 1;
      }
      while (code.length && !code[code.length - 1]) code.pop();
      out.push(codeBlockHtml(code.join("\n")));
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    out.push(`<p>${renderInline(paragraph.join("\n"))}</p>`);
  }

  return out.join("");
}

export function renderMarkdown(source) {
  const text = String(source ?? "").trim();
  if (!text) return "";
  return renderBlocks(text);
}
