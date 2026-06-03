/**
 * LBS 定位状态条 — 右上角常驻小型 UI
 * 状态: loading | on | failed
 * 按钮: 重试 / 手动选点 / 📷 相机坐标（仅 mock 模式）
 */

/** @typedef {'loading' | 'on' | 'failed'} LbsState */

/**
 * @param {{
 *   onRetry: () => void,
 *   onManualPick: () => void,
 *   onCopyCameraCoords?: () => void,
 *   onDrawRoute?: () => void,
 *   onEraseRoute?: () => void,
 *   showDevTools?: boolean,
 * }} callbacks
 */
export function mountLbsStatusBar(callbacks) {
  const el = document.createElement("div");
  el.id = "lbs-status-bar";
  el.className = "lbs-bar lbs-bar--collapsed";
  // ★ 强制内联关键样式，确保即使 CSS 未加载也始终可见
  el.style.cssText = [
    "position:fixed",
    "top:100px",
    "left:0",
    "z-index:26000",
    "display:flex",
    "flex-wrap:nowrap",
    "align-items:center",
    "gap:0",
    "padding:0",
    "border-radius:0 20px 20px 0",
    "background:rgba(12,14,20,0.82)",
    "font:12px/1.4 system-ui,-apple-system,sans-serif",
    "color:rgba(255,255,255,0.88)",
    "pointer-events:auto",
    "box-shadow:0 6px 20px rgba(0,0,0,0.3)",
  ].join(";");
  document.body.appendChild(el);
  console.info("[lbs-bar] mounted, el.offsetHeight:", el.offsetHeight);

  // ── 收起/展开状态 ──
  let collapsed = true;

  // 按 U 键切换 UI 面板显示
  window.addEventListener("keydown", (e) => {
    if (e.key === "u" || e.key === "U") {
      const dock = document.getElementById("planner-dock");
      const hidden = el.style.display === "none";
      el.style.display = hidden ? "" : "none";
      if (dock) dock.style.display = hidden ? "" : "none";
    }
  });

  let state = /** @type {LbsState} */ ("loading");
  let message = "定位中…";
  let showDevTools = !!callbacks.showDevTools;
  let drawRouteActive = false;
  let drawRoutePointCount = 0;
  let eraseRouteActive = false;

  /** 切换收起/展开 */
  function toggleCollapse() {
    collapsed = !collapsed;
    el.classList.toggle("lbs-bar--collapsed", collapsed);
  }

  // 监听画路线模式状态，更新按钮形态
  window.addEventListener("route-draw-mode", (e) => {
    drawRouteActive = !!(e.detail && e.detail.active);
    if (!drawRouteActive) drawRoutePointCount = 0;
    render();
  });
  window.addEventListener("route-draw-update", (e) => {
    drawRoutePointCount = Number((e.detail && e.detail.pointCount) || 0);
    render();
  });
  // 监听擦除路线模式状态，更新按钮形态
  window.addEventListener("route-erase-mode", (e) => {
    eraseRouteActive = !!(e.detail && e.detail.active);
    render();
  });

  function render() {
    const dotClass = `lbs-bar__dot lbs-bar__dot--${state}`;
    const label =
      state === "loading" ? (message || "定位中…") :
      state === "on" ? (message || "定位已开启") :
      message || "定位失败";

    const retryBtn = state === "failed" || state === "loading"
      ? `<button type="button" class="lbs-bar__btn" id="lbs-retry">重试</button>`
      : "";
    const pickBtn = state === "failed"
      ? `<button type="button" class="lbs-bar__btn" id="lbs-manual-pick">手动选点</button>`
      : `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-manual-pick">选点</button>`;
    const simLowWaitBtn = showDevTools
      ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-sim-low-wait">模拟低排队</button>`
      : "";
    const camCoordBtn = showDevTools
      ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-cam-coord" title="复制当前相机位置与目标点">📷 相机坐标</button>`
      : "";
    const drawRouteBtn = showDevTools
      ? (drawRouteActive
          ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--active" id="lbs-draw-route" title="按 Enter 确认 / Esc 取消 / 右键撤销">✅ 完成(Enter) · ${drawRoutePointCount} 点</button>`
          : `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-draw-route" title="在地图上依次点击绘制路线">✏️ 画路线</button>`)
      : "";
    const eraseRouteBtn = showDevTools
      ? (eraseRouteActive
          ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--active" id="lbs-erase-route" title="按 Esc 退出擦除">❌ 退出擦除(Esc)</button>`
          : `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-erase-route" title="点击进入擦除模式，再点击地图上的路线即可删除">🧹 擦路线</button>`)
      : "";

    const toggleArrow = collapsed ? "›" : "‹";
    el.innerHTML = `
      <div class="lbs-bar__content">
        <span class="${dotClass}"></span>
        <span class="lbs-bar__label">${label}</span>
        ${retryBtn}
        ${pickBtn}
        ${simLowWaitBtn}
        ${camCoordBtn}
        ${drawRouteBtn}
        ${eraseRouteBtn}
      </div>
      <button type="button" class="lbs-bar__toggle" id="lbs-toggle" title="${collapsed ? '展开' : '收起'}">${toggleArrow}</button>
    `;
  }

  // 事件委托：在容器上只绑定一次 click，通过 id 分发到对应回调
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !el.contains(btn)) return;

    // 收起/展开切换
    if (btn.id === "lbs-toggle") {
      toggleCollapse();
      render();
      return;
    }

    console.log("[lbs-bar] click:", btn.id);

    // 视觉反馈：短暂高亮被点击的按钮
    btn.style.background = "rgba(255,255,255,0.28)";
    setTimeout(() => { btn.style.background = ""; }, 150);

    try {
      switch (btn.id) {
        case "lbs-retry":
          setState("loading", "定位中…");
          callbacks.onRetry();
          break;
        case "lbs-manual-pick":
          callbacks.onManualPick();
          break;
        case "lbs-sim-low-wait":
          window.dispatchEvent(new CustomEvent("simulate-low-wait"));
          break;
        case "lbs-cam-coord":
          if (typeof callbacks.onCopyCameraCoords !== "function") {
            console.warn("[lbs-bar] onCopyCameraCoords callback not defined!");
          }
          callbacks.onCopyCameraCoords?.();
          break;
        case "lbs-draw-route":
          callbacks.onDrawRoute?.();
          break;
        case "lbs-erase-route":
          callbacks.onEraseRoute?.();
          break;
        default:
          console.warn("[lbs-bar] unhandled button:", btn.id);
      }
    } catch (err) {
      console.error("[lbs-bar] handler error:", err);
    }
  });

  /**
   * @param {LbsState} s
   * @param {string} [msg]
   */
  function setState(s, msg) {
    state = s;
    if (msg !== undefined) message = msg;
    render();
  }

  /**
   * 切换开发工具按钮的可见性（mode 决定，不影响 retry/manualPick）。
   * @param {boolean} visible
   */
  function setDevToolsVisible(visible) {
    showDevTools = !!visible;
    render();
  }

  render();

  return { el, setState, setDevToolsVisible, getState: () => state };
}
