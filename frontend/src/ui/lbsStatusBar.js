/**
 * LBS 定位状态条 — 右上角常驻小型 UI
 * 状态: loading | on | failed
 * 按钮: 重试 / 换个位置（仅 mock 模式）/ 手动选点 / 模拟暂停 / 📷 相机坐标（仅 mock 模式）
 */

/** @typedef {'loading' | 'on' | 'failed'} LbsState */

/**
 * @param {{
 *   onRetry: () => void,
 *   onManualPick: () => void,
 *   onShuffle?: () => void,
 *   onCopyCameraCoords?: () => void,
 *   showShuffle?: boolean,
 * }} callbacks
 */
export function mountLbsStatusBar(callbacks) {
  const el = document.createElement("div");
  el.id = "lbs-status-bar";
  el.className = "lbs-bar";
  document.body.appendChild(el);

  let state = /** @type {LbsState} */ ("loading");
  let message = "定位中…";
  let showShuffle = !!callbacks.showShuffle;

  function render() {
    const dotClass = `lbs-bar__dot lbs-bar__dot--${state}`;
    const label =
      state === "loading" ? (message || "定位中…") :
      state === "on" ? (message || "定位已开启") :
      message || "定位失败";

    const retryBtn = state === "failed" || state === "loading"
      ? `<button type="button" class="lbs-bar__btn" id="lbs-retry">重试</button>`
      : "";
    const shuffleBtn = showShuffle
      ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-shuffle">换个位置</button>`
      : "";
    const pickBtn = state === "failed"
      ? `<button type="button" class="lbs-bar__btn" id="lbs-manual-pick">手动选点</button>`
      : `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-manual-pick">选点</button>`;
    const simClosedBtn = showShuffle
      ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-sim-closed">模拟暂停</button>`
      : "";
    const camCoordBtn = showShuffle
      ? `<button type="button" class="lbs-bar__btn lbs-bar__btn--subtle" id="lbs-cam-coord" title="复制当前相机位置与目标点">📷 相机坐标</button>`
      : "";

    el.innerHTML = `
      <span class="${dotClass}"></span>
      <span class="lbs-bar__label">${label}</span>
      ${retryBtn}
      ${shuffleBtn}
      ${pickBtn}
      ${simClosedBtn}
      ${camCoordBtn}
    `;

    el.querySelector("#lbs-retry")?.addEventListener("click", () => {
      setState("loading", "定位中…");
      callbacks.onRetry();
    });
    el.querySelector("#lbs-shuffle")?.addEventListener("click", () => {
      callbacks.onShuffle?.();
    });
    el.querySelector("#lbs-manual-pick")?.addEventListener("click", () => {
      callbacks.onManualPick();
    });
    el.querySelector("#lbs-sim-closed")?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("simulate-closed"));
    });
    el.querySelector("#lbs-cam-coord")?.addEventListener("click", () => {
      callbacks.onCopyCameraCoords?.();
    });
  }

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
   * 切换 shuffle 按钮的可见性（mode 决定，不影响 retry/manualPick）。
   * @param {boolean} visible
   */
  function setShuffleVisible(visible) {
    showShuffle = !!visible;
    render();
  }

  render();

  return { el, setState, setShuffleVisible, getState: () => state };
}
