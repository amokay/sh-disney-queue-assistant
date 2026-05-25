import * as THREE from "three";

/**
 * 按 URL 匹配规则：match 为「路径里包含的一段字」，不区分大小写。
 * 多条同时命中时取 **match 字符串最长** 的一条（更具体的路径优先），避免如
 * `seven-dwarfs-mine-train` 与 `landmarks/02_seven-dwarfs-mine-train` 并存时误用短规则。
 * @param {string} url
 * @param {Array<{ match?: string }>} rules
 */
export function findFirstMatchingRule(url, rules) {
  const lower = String(url).toLowerCase();
  let best = /** @type {{ match?: string } | null} */ (null);
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
 * 对 glb 根 Group 应用位移 / 旋转(度) / 缩放
 * @param {THREE.Group} root
 * @param {string} url 用于匹配 model_transforms.json 里的 match
 * @param {Array<Record<string, unknown>>} transformRules
 */
export function applyTransformToGroup(root, url, transformRules) {
  const r = findFirstMatchingRule(url, transformRules);
  if (!r) return;

  if (Array.isArray(r.position) && r.position.length >= 3) {
    root.position.set(Number(r.position[0]), Number(r.position[1]), Number(r.position[2]));
  }
  if (Array.isArray(r.rotationDeg) && r.rotationDeg.length >= 3) {
    root.rotation.set(
      THREE.MathUtils.degToRad(Number(r.rotationDeg[0])),
      THREE.MathUtils.degToRad(Number(r.rotationDeg[1])),
      THREE.MathUtils.degToRad(Number(r.rotationDeg[2]))
    );
  }
  if (typeof r.scale === "number" && Number.isFinite(r.scale)) {
    root.scale.setScalar(r.scale);
  } else if (Array.isArray(r.scale) && r.scale.length >= 3) {
    root.scale.set(Number(r.scale[0]), Number(r.scale[1]), Number(r.scale[2]));
  }
}

/**
 * manifest 里单条 model 可写 position / rotationDeg / scale，会覆盖 model_transforms 里同字段（先应用文件再应用 entry）
 * @param {THREE.Group} root
 * @param {string} url
 * @param {Record<string, unknown>} entry
 * @param {Array<Record<string, unknown>>} transformRules
 */
export function applyManifestEntryTransforms(root, url, entry, transformRules) {
  applyTransformToGroup(root, url, transformRules);

  if (Array.isArray(entry.position) && entry.position.length >= 3) {
    root.position.set(Number(entry.position[0]), Number(entry.position[1]), Number(entry.position[2]));
  }
  if (Array.isArray(entry.rotationDeg) && entry.rotationDeg.length >= 3) {
    root.rotation.set(
      THREE.MathUtils.degToRad(Number(entry.rotationDeg[0])),
      THREE.MathUtils.degToRad(Number(entry.rotationDeg[1])),
      THREE.MathUtils.degToRad(Number(entry.rotationDeg[2]))
    );
  }
  if (typeof entry.scale === "number" && Number.isFinite(entry.scale)) {
    root.scale.setScalar(entry.scale);
  } else if (Array.isArray(entry.scale) && entry.scale.length >= 3) {
    root.scale.set(Number(entry.scale[0]), Number(entry.scale[1]), Number(entry.scale[2]));
  }
}

export async function fetchModelTransformRules() {
  try {
    const res = await fetch("/assets/data/model_transforms.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rules) ? j.rules : [];
  } catch {
    return [];
  }
}
