import * as THREE from "three";

/**
 * 设计师向：用 `frontend/assets/data/model_materials.json` 按 glb URL + 网格/材质名覆盖常用参数。
 *
 * 每条 rule：
 * - `matchGlb`（或 `match`）：与 glb 的 URL 子串匹配，不区分大小写（与 model_transforms 相同思路）
 * - `meshName`：可选，mesh.name 须包含该字符串
 * - `materialName`：可选，material.name 须包含该字符串
 * - `applyToAllMeshes`: 可选 true，对该 glb 下所有 mesh 的所有材质生效（慎用）
 * - `props`：要写入的材质字段（见下方）
 *
 * `props` 支持的常用字段：
 * - `color` / `emissive`：如 "#445566"、"#rgb"、或 0x112233
 * - `emissiveIntensity`, `metalness`, `roughness`, `opacity`, `envMapIntensity`
 * - `transparent`, `depthWrite`, `depthTest`, `flatShading`, `wireframe`
 * - `side`："FrontSide" | "BackSide" | "DoubleSide"
 * - MeshPhysicalMaterial 专有（仅当 glb 里已是物理材质时有效）：`ior`, `transmission`, `thickness`, `clearcoat`, `clearcoatRoughness`
 *
 * 材质名一般随 Blender 导出；可在 Blender 里看材质名 / 对象名。
 */

const META_KEYS = new Set([
  "matchGlb",
  "match",
  "meshName",
  "materialName",
  "applyToAllMeshes",
  "props",
]);

function glbMatchKey(rule) {
  return String(rule.matchGlb || rule.match || "");
}

function rulesForUrl(url, rules) {
  const lower = String(url).toLowerCase();
  return (rules || []).filter((r) => {
    const m = glbMatchKey(r).toLowerCase();
    return m && lower.includes(m);
  });
}

function includesCI(hay, needle) {
  if (!needle) return true;
  return String(hay || "").toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * 该 mesh 的该材质槽是否命中本条 rule（不含 glb match，调用方已过滤）
 */
function ruleMatchesMeshMaterial(rule, mesh, material) {
  if (rule.applyToAllMeshes) return true;
  const mn = rule.meshName;
  const matN = rule.materialName;
  if (!mn && !matN) return false;
  if (mn && !includesCI(mesh.name, mn)) return false;
  if (matN && !includesCI(material?.name, matN)) return false;
  return true;
}

function setColorLike(targetColor, value) {
  if (value === undefined || value === null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    targetColor.setHex(value >>> 0);
    return;
  }
  if (typeof value === "string") {
    targetColor.set(value);
    return;
  }
  if (Array.isArray(value) && value.length >= 3) {
    targetColor.setRGB(Number(value[0]), Number(value[1]), Number(value[2]));
  }
}

/**
 * @param {THREE.Material} mat
 * @param {Record<string, unknown>} props
 */
function applyPropsToMaterial(mat, props) {
  if (!mat || !props) return;

  if ("color" in props && mat.color) setColorLike(mat.color, props.color);
  if ("emissive" in props && mat.emissive) setColorLike(mat.emissive, props.emissive);

  const numKeys = [
    "emissiveIntensity",
    "metalness",
    "roughness",
    "opacity",
    "envMapIntensity",
    "ior",
    "transmission",
    "thickness",
    "clearcoat",
    "clearcoatRoughness",
    "reflectivity",
    "sheen",
    "sheenRoughness",
  ];
  for (const k of numKeys) {
    if (!(k in props)) continue;
    const v = Number(props[k]);
    if (!Number.isFinite(v)) continue;
    if (k in mat) mat[k] = v;
  }

  if ("transparent" in props) mat.transparent = !!props.transparent;
  if ("depthWrite" in props) mat.depthWrite = !!props.depthWrite;
  if ("depthTest" in props) mat.depthTest = !!props.depthTest;
  if ("flatShading" in props) mat.flatShading = !!props.flatShading;
  if ("wireframe" in props) mat.wireframe = !!props.wireframe;

  if ("side" in props && typeof props.side === "string") {
    const s = props.side;
    if (s in THREE) mat.side = THREE[s];
  }

  if ("opacity" in props) {
    const o = Number(props.opacity);
    if (Number.isFinite(o)) {
      mat.opacity = o;
      if (o < 1 && props.transparent === undefined) mat.transparent = true;
    }
  }

  mat.needsUpdate = true;
}

/**
 * 从 rule 取出 props：优先 rule.props，否则把非 meta 字段当作材质属性
 */
function extractProps(rule) {
  if (rule.props && typeof rule.props === "object") return /** @type {Record<string, unknown>} */ (rule.props);
  const out = {};
  for (const k of Object.keys(rule)) {
    if (META_KEYS.has(k)) continue;
    out[k] = rule[k];
  }
  return out;
}

/**
 * @param {THREE.Object3D} root 包住该 glb 的 Group
 * @param {string} glbUrl
 * @param {Array<Record<string, unknown>>} rules
 */
export function applyMaterialRulesToRoot(root, glbUrl, rules) {
  const applicable = rulesForUrl(glbUrl, rules);
  if (!applicable.length) return;

  root.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = o;

    const processSlot = (mat, index) => {
      if (!mat || !mat.isMaterial) return;
      let patched = null;
      for (const rule of applicable) {
        if (!ruleMatchesMeshMaterial(rule, mesh, mat)) continue;
        const props = extractProps(rule);
        if (Object.keys(props).length === 0) continue;
        const target = patched || mat.clone();
        applyPropsToMaterial(target, props);
        patched = target;
      }
      if (!patched) return;
      if (Array.isArray(mesh.material)) {
        const next = mesh.material.slice();
        next[index] = patched;
        mesh.material = next;
      } else {
        mesh.material = patched;
      }
    };

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m, i) => processSlot(m, i));
    } else {
      processSlot(mesh.material, 0);
    }
  });
}

export async function fetchModelMaterialRules() {
  try {
    const res = await fetch("/assets/data/model_materials.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rules) ? j.rules : [];
  } catch {
    return [];
  }
}
