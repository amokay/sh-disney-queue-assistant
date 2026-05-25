import { waitColorClass } from "../config.js";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mountDetailCard() {
  const root = document.createElement("div");
  root.className = "detail";
  root.innerHTML = `
    <div class="detail__card" role="dialog" aria-modal="true">
      <div class="detail__title" id="detail-title"></div>
      <div class="detail__zone" id="detail-zone"></div>
      <div class="detail__wait" id="detail-wait"></div>
      <div class="detail__desc" id="detail-desc"></div>
      <div class="detail__actions">
        <button type="button" class="btn btn--primary" id="detail-add">快速导航</button>
        <button type="button" class="btn" id="detail-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const card = root.querySelector(".detail__card");
  const title = root.querySelector("#detail-title");
  const zone = root.querySelector("#detail-zone");
  const wait = root.querySelector("#detail-wait");
  const desc = root.querySelector("#detail-desc");
  const btnClose = root.querySelector("#detail-close");
  const btnAdd = card.querySelector("#detail-add");

  let current = null;
  /**
   * 时间戳守卫：记录 open() 被调用的时刻。
   * overlay 关闭逻辑在此时刻后 400ms 内被抑制，
   * 避免 pointerdown 打开面板 → 同一手势的 pointerup/click 冒泡到
   * 新出现的 overlay 上导致立即关闭。
   */
  let _openedAt = 0;

  function close() {
    root.classList.remove("is-open");
    current = null;
  }

  function open(a) {
    current = a;
    title.textContent = a.name || "";
    zone.textContent = a.zone || "";
    const wm = a.waitMinutes;
    const cls = waitColorClass(wm);
    wait.className = `detail__wait ${cls}`;
    wait.textContent = wm == null ? "等待时长：—" : `等待时长：${wm} 分钟`;
    desc.textContent = a.description || "（暂无简介）";
    root.classList.add("is-open");
    _openedAt = Date.now();
  }

  window.addEventListener("attraction-clicked", (e) => {
    const a = e.detail?.attraction;
    if (!a) return;
    open(a);
  });

  btnAdd.addEventListener("click", () => {
    if (!current?.id) return;
    window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id: current.id } }));
  });

  btnClose.addEventListener("click", close);
  root.addEventListener("pointerup", (e) => {
    // 仅响应直接点击 overlay 背景（非卡片内部）
    if (e.target !== root) return;
    // 400ms 内的关闭请求来自打开手势本身，忽略
    if (Date.now() - _openedAt < 400) return;
    close();
  });

  return { open, close };
}
