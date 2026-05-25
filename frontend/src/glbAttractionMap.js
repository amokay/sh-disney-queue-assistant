/**
 * GLB 路径 ↔ 景点 id（与 models.manifest pickRules、后端 glb_poi 同步一致：最长 match 优先）
 */

/**
 * @param {string} url
 * @param {Array<{ match?: string, pickableAttractionId?: string }>} pickRules
 * @returns {string | null}
 */
export function pickAttractionIdForGlbUrl(url, pickRules) {
  const lower = String(url).toLowerCase();
  let bestId = null;
  let bestLen = -1;
  for (const pr of pickRules || []) {
    const id =
      typeof pr.pickableAttractionId === "string" ? pr.pickableAttractionId.trim() : "";
    const m = String(pr.match || "").toLowerCase();
    if (!id || !m || !lower.includes(m)) continue;
    if (m.length > bestLen) {
      bestLen = m.length;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * 已加载且绑定了景点的 glb 根节点 → 景点 id 集合（有则隐藏蓝球）
 * @param {THREE.Object3D} scene
 * @returns {Set<string>}
 */
export function collectGlbAttractionIds(scene) {
  const ids = new Set();
  scene.traverse((o) => {
    if (o.userData?.isGltfModelRoot && o.userData.pickableAttractionId) {
      ids.add(String(o.userData.pickableAttractionId));
    }
  });
  return ids;
}
