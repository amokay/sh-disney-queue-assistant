/**
 * scene3d/modelTransforms.js
 * ──────────────────────────
 * 按 URL 子串匹配规则，对 GLB 根节点应用 position / rotation / scale。
 * 数据源：/assets/data/model_transforms.json
 *
 * 移植自原 Three.js 版 modelTransforms.js，逻辑完全对等。
 */

/**
 * URL 子串匹配（不区分大小写），多条命中时取 match 最长的（更具体的优先）。
 * @param {string} url
 * @param {Array<{ match?: string }>} rules
 * @returns {object | null}
 */
export function findFirstMatchingRule(url, rules) {
  const lower = String(url).toLowerCase();
  let best = null;
  let bestLen = -1;
  let bestIdx = Infinity;
  (rules || []).forEach((r, idx) => {
    const m = String(r.match || "").toLowerCase();
    if (!m || !lower.includes(m)) return;
    if (m.length > bestLen || (m.length === bestLen && idx < bestIdx)) {
      bestLen = m.length;
      bestIdx = idx;
      best = r;
    }
  });
  return best;
}

/**
 * 对 Babylon TransformNode/Mesh 根节点应用位移 / 旋转(度) / 缩放。
 * @param {BABYLON.TransformNode} root
 * @param {string} url
 * @param {Array<Record<string, unknown>>} transformRules
 */
export function applyTransformToNode(root, url, transformRules) {
  const r = findFirstMatchingRule(url, transformRules);
  if (!r) return;

  const BABYLON = window.BABYLON;

  if (Array.isArray(r.position) && r.position.length >= 3) {
    root.position = new BABYLON.Vector3(
      Number(r.position[0]),
      Number(r.position[1]),
      Number(r.position[2])
    );
  }

  if (Array.isArray(r.rotationDeg) && r.rotationDeg.length >= 3) {
    // Babylon rotation 用弧度
    const degToRad = Math.PI / 180;
    root.rotation = new BABYLON.Vector3(
      Number(r.rotationDeg[0]) * degToRad,
      Number(r.rotationDeg[1]) * degToRad,
      Number(r.rotationDeg[2]) * degToRad
    );
  }

  if (typeof r.scale === "number" && Number.isFinite(r.scale)) {
    root.scaling = new BABYLON.Vector3(r.scale, r.scale, r.scale);
  } else if (Array.isArray(r.scale) && r.scale.length >= 3) {
    root.scaling = new BABYLON.Vector3(
      Number(r.scale[0]),
      Number(r.scale[1]),
      Number(r.scale[2])
    );
  }
}

/**
 * manifest 单条 model 可覆盖 position / rotationDeg / scale（优先级高于 transform rules）。
 * @param {BABYLON.TransformNode} root
 * @param {string} url
 * @param {Record<string, unknown>} entry - manifest 条目
 * @param {Array<Record<string, unknown>>} transformRules
 */
export function applyManifestEntryTransforms(root, url, entry, transformRules) {
  // 先应用全局规则
  applyTransformToNode(root, url, transformRules);

  const BABYLON = window.BABYLON;
  const degToRad = Math.PI / 180;

  // 再用 entry 覆盖
  if (Array.isArray(entry.position) && entry.position.length >= 3) {
    root.position = new BABYLON.Vector3(
      Number(entry.position[0]),
      Number(entry.position[1]),
      Number(entry.position[2])
    );
  }
  if (Array.isArray(entry.rotationDeg) && entry.rotationDeg.length >= 3) {
    root.rotation = new BABYLON.Vector3(
      Number(entry.rotationDeg[0]) * degToRad,
      Number(entry.rotationDeg[1]) * degToRad,
      Number(entry.rotationDeg[2]) * degToRad
    );
  }
  if (typeof entry.scale === "number" && Number.isFinite(entry.scale)) {
    root.scaling = new BABYLON.Vector3(entry.scale, entry.scale, entry.scale);
  } else if (Array.isArray(entry.scale) && entry.scale.length >= 3) {
    root.scaling = new BABYLON.Vector3(
      Number(entry.scale[0]),
      Number(entry.scale[1]),
      Number(entry.scale[2])
    );
  }
}

/**
 * 从后端加载 model_transforms.json 规则。
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchModelTransformRules() {
  try {
    const res = await fetch("./assets/3d/config/model_transforms.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rules) ? j.rules : [];
  } catch {
    return [];
  }
}
