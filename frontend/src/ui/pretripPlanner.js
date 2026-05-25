function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @param {{ plan: object, sessionId: string, onStartInPark: () => void, onBack: () => void, onViewMap: (plan: object) => void }} opts
 */
export function mountPretripResult(opts) {
  const root = document.createElement("div");
  root.className = "planner-screen planner-screen--result";

  const plan = opts.plan || {};
  const s = plan.summary || {};
  const cards = (plan.ordered || [])
    .map(
      (row) => `
      <li class="planner-ride-card">
        <span class="planner-ride-card__order">${row.order}</span>
        <div class="planner-ride-card__main">
          <strong>${esc(row.name)}</strong>
          <span class="planner-ride-card__zone">${esc(row.zone)}</span>
          ${row.isMustPlay ? '<span class="planner-badge">必玩</span>' : ""}
        </div>
        <div class="planner-ride-card__meta">
          等 ${row.waitMinutes}′ · 玩 ${row.experienceMinutes}′ · 走 ${row.walkMinutes}′
        </div>
      </li>
    `
    )
    .join("");

  const warnings = (plan.warnings || []).map((w) => `<p class="planner-warn">${esc(w)}</p>`).join("");

  root.innerHTML = `
    <div class="planner-screen__inner">
      <header class="planner-screen__head">
        <button type="button" class="btn btn--ghost planner-back" id="pt-back">返回</button>
        <h1>行前计划</h1>
      </header>
      <div class="planner-screen__body">
        <div class="planner-stats">
          <div><b>${s.rideCount ?? 0}</b><span>预计可玩</span></div>
          <div><b>${s.totalWaitMinutes ?? 0}′</b><span>总排队</span></div>
          <div><b>${s.totalWalkMinutes ?? 0}′</b><span>总步行</span></div>
          <div><b>${s.mustPlayCovered ?? 0}/${s.mustPlayTotal ?? 0}</b><span>必玩覆盖</span></div>
        </div>
        ${warnings}
        <ol class="planner-ride-list">${cards}</ol>
      </div>
      <footer class="planner-screen__foot planner-screen__foot--stack">
        <button type="button" class="btn btn--primary" id="pt-inpark">我已入园，开始实时推荐</button>
        <button type="button" class="btn" id="pt-map">在 3D 地图查看</button>
      </footer>
    </div>
  `;

  root.querySelector("#pt-inpark")?.addEventListener("click", () => opts.onStartInPark());
  root.querySelector("#pt-map")?.addEventListener("click", () => opts.onViewMap?.(plan));
  if (opts.onRefine) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "重新填写偏好";
    btn.addEventListener("click", () => opts.onRefine());
    root.querySelector(".planner-screen__foot")?.prepend(btn);
  }

  return root;
}
