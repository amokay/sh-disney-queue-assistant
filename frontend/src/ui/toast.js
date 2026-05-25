let stack = 0;

export function showToast(message, type = "info") {
  const wrap = document.createElement("div");
  wrap.className = `toast toast--${type}`;
  wrap.textContent = message;
  wrap.style.cssText = [
    "position:fixed",
    "right:12px",
    "z-index:20000",
    "max-width:min(360px,92vw)",
    "padding:10px 12px",
    "border-radius:12px",
    "font:13px/1.35 system-ui,-apple-system,PingFang SC,Microsoft YaHei,sans-serif",
    "color:rgba(255,255,255,.95)",
    "background:rgba(12,14,20,.86)",
    "border:1px solid rgba(255,255,255,.12)",
    "backdrop-filter:blur(8px)",
    "box-shadow:0 10px 30px rgba(0,0,0,.35)",
    "transition:opacity .25s ease, transform .25s ease",
    "opacity:0",
    "transform:translateY(-6px)",
  ].join(";");

  const topBase = 12 + stack * 52;
  wrap.style.top = `${topBase}px`;
  stack += 1;

  if (type === "success") wrap.style.borderColor = "rgba(34,197,94,.45)";
  if (type === "error") wrap.style.borderColor = "rgba(239,68,68,.45)";
  if (type === "info") wrap.style.borderColor = "rgba(110,231,255,.35)";

  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.style.opacity = "1";
    wrap.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    wrap.style.opacity = "0";
    wrap.style.transform = "translateY(-6px)";
    window.setTimeout(() => {
      wrap.remove();
      stack = Math.max(0, stack - 1);
    }, 260);
  }, 2000);
}
