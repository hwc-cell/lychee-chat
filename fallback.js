const ext = globalThis.browser ?? globalThis.chrome;
const params = new URLSearchParams(location.search);
const reason = params.get("reason") || "未能读取具体错误";
const pageUrl = params.get("url") || "";

document.getElementById("reason").textContent = reason;
if (pageUrl) {
  document.getElementById("page").textContent = `当前页面：${pageUrl}`;
}

document.getElementById("close").addEventListener("click", () => window.close());
document.getElementById("settings").addEventListener("click", () => {
  if (ext?.runtime?.openOptionsPage) {
    ext.runtime.openOptionsPage();
    window.close();
  }
});
