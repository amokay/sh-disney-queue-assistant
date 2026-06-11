/**
 * recommendedStore.js
 * ───────────────────
 * 「当前推荐项目」的 attraction id 集合（共享状态）。
 * 从旧 waitLabels.js 提取，避免 plannerApp 间接引入 Three.js。
 */

let recommendedIds = new Set();

/**
 * 同步当前推荐列表的 attraction id，用于决定 wait-marker 是否显示「加入推荐」按钮。
 * @param {Iterable<string>} ids
 */
export function setRecommendedIds(ids) {
  recommendedIds = new Set(Array.from(ids || []).map((x) => String(x)));
}

/**
 * @returns {Set<string>}
 */
export function getRecommendedIds() {
  return recommendedIds;
}
