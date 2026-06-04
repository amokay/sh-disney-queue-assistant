let el = null;

export function showLoading() {
  if (el) return;
  el = document.createElement("div");
  el.id = "global-loading";
  el.innerHTML = `<div class="loading__card"></div>`;
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:19000",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(7,9,15,.55)",
    "opacity:1",
    "transition:opacity .35s ease",
  ].join(";");
  document.body.appendChild(el);
}

export function hideLoading() {
  if (!el) return;
  const node = el;
  node.style.opacity = "0";
  window.setTimeout(() => {
    node.remove();
    if (el === node) el = null;
  }, 360);
}
