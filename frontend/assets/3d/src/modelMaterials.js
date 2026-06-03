/**
 * scene3d/modelMaterials.js
 * ─────────────────────────
 * 按 URL + mesh名/材质名 匹配规则覆盖材质参数。
 * 数据源：/assets/data/model_materials.json
 *
 * 移植自原 Three.js 版 modelMaterials.js，适配 Babylon PBRMaterial。
 */


const META_KEYS = new Set([
  "matchGlb", "match", "meshName", "materialName", "applyToAllMeshes", "props",
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

function ruleMatchesMeshMaterial(rule, mesh, material) {
  if (rule.applyToAllMeshes) return true;
  const mn = rule.meshName;
  const matN = rule.materialName;
  if (!mn && !matN) return false;
  if (mn && !includesCI(mesh.name, mn)) return false;
  if (matN && !includesCI(material?.name, matN)) return false;
  return true;
}

/**
 * 解析颜色值为 Babylon Color3。
 * 支持格式：0xRRGGBB 数字、"#rrggbb" 字符串、[r,g,b] 数组(0-1)
 */
function parseColor3(value) {
  const BABYLON = window.BABYLON;
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BABYLON.Color3.FromHexString(
      "#" + (value >>> 0).toString(16).padStart(6, "0")
    );
  }
  if (typeof value === "string") {
    try {
      return BABYLON.Color3.FromHexString(value.startsWith("#") ? value : "#" + value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new BABYLON.Color3(Number(value[0]), Number(value[1]), Number(value[2]));
  }
  return null;
}

/**
 * 应用材质属性到 Babylon PBRMaterial / StandardMaterial。
 * @param {BABYLON.Material} mat
 * @param {Record<string, unknown>} props
 */
function applyPropsToMaterial(mat, props) {
  if (!mat || !props) return;

  // 颜色类
  if ("color" in props) {
    const c = parseColor3(props.color);
    if (c) {
      if (mat.albedoColor !== undefined) mat.albedoColor = c; // PBRMaterial
      else if (mat.diffuseColor !== undefined) mat.diffuseColor = c; // StandardMaterial
    }
  }
  if ("emissive" in props) {
    const c = parseColor3(props.emissive);
    if (c) mat.emissiveColor = c;
  }

  // 数值类
  const numMappings = {
    emissiveIntensity: "emissiveIntensity",
    metalness: "metallic", // Three.js metalness → Babylon metallic
    roughness: "roughness",
    opacity: "alpha",
    envMapIntensity: "environmentIntensity",
  };
  for (const [srcKey, babylonKey] of Object.entries(numMappings)) {
    if (!(srcKey in props)) continue;
    const v = Number(props[srcKey]);
    if (!Number.isFinite(v)) continue;
    if (babylonKey in mat) mat[babylonKey] = v;
  }

  // 透明度
  if ("opacity" in props) {
    const o = Number(props.opacity);
    if (Number.isFinite(o)) {
      mat.alpha = o;
      if (o < 1) {
        mat.transparencyMode = 2; // ALPHABLEND
        if (mat.subSurface) mat.subSurface.isTranslucencyEnabled = false;
      }
    }
  }

  // 布尔类
  if ("transparent" in props && props.transparent) {
    mat.transparencyMode = 2;
  }
  if ("wireframe" in props) {
    mat.wireframe = !!props.wireframe;
  }

  // 双面
  if ("side" in props) {
    const BABYLON = window.BABYLON;
    const s = String(props.side);
    if (s === "DoubleSide" || s === "2") {
      mat.backFaceCulling = false;
    } else if (s === "FrontSide" || s === "0") {
      mat.backFaceCulling = true;
    }
  }

  // unlit 在 applyMaterialRulesToRoot 中单独处理（需要替换整个材质）
}

/**
 * 从 rule 取出 props。
 */
function extractProps(rule) {
  if (rule.props && typeof rule.props === "object") return rule.props;
  const out = {};
  for (const k of Object.keys(rule)) {
    if (META_KEYS.has(k)) continue;
    out[k] = rule[k];
  }
  return out;
}

/**
 * 对 GLB 根节点下所有 mesh 应用材质覆盖规则。
 * @param {BABYLON.TransformNode} root
 * @param {string} glbUrl
 * @param {Array<Record<string, unknown>>} rules
 */
export function applyMaterialRulesToRoot(root, glbUrl, rules) {
  const BABYLON = window.BABYLON;
  const applicable = rulesForUrl(glbUrl, rules);
  if (!applicable.length) return;

  const scene = root.getScene();
  const meshes = root.getChildMeshes(false);
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat) continue;

    for (const rule of applicable) {
      if (!ruleMatchesMeshMaterial(rule, mesh, mat)) continue;
      const props = extractProps(rule);
      if (Object.keys(props).length === 0) continue;

      // ── 水体模式：替换为轻量水体材质 ──
      if (props.water) {
        import("./waterMaterial.js").then(({ applyWaterMaterial }) => {
          applyWaterMaterial(scene, mesh);
        }).catch(e => console.warn("[modelMaterials] 水体材质加载失败:", e));
        continue;
      }

      // ── unlit 模式：完全重置材质，只保留 albedo 贴图作为 emissive 自发光 ──
      if (props.unlit) {
        // 尝试从多个来源找到贴图（GLB 可能放在不同通道）
        const tex = mat.albedoTexture || mat.emissiveTexture || null;
        // 保存原始颜色，确保不是纯黑（纯黑说明颜色靠贴图，兜底用白色）
        const origColor = mat.albedoColor ? mat.albedoColor.clone() : null;
        const colorBrightness = origColor
          ? (origColor.r + origColor.g + origColor.b)
          : 0;

        // 关掉所有光照
        mat.directIntensity = 0;
        mat.environmentIntensity = 0;
        mat.specularIntensity = 0;

        // 清空所有颜色通道
        mat.albedoColor = new BABYLON.Color3(0, 0, 0);
        mat.reflectivityColor = new BABYLON.Color3(0, 0, 0);
        mat.metallic = 0;
        mat.roughness = 1;

        // 清掉除 emissive 以外的所有贴图
        mat.albedoTexture = null;
        mat.metallicTexture = null;
        mat.reflectionTexture = null;
        mat.bumpTexture = null;
        mat.ambientTexture = null;

        // emissive = 唯一的颜色来源
        // 如果指定了外部贴图路径，加载外部贴图替换
        if (props.texture) {
          const extTex = new BABYLON.Texture(props.texture, scene);
          mat.emissiveTexture = extTex;
        } else {
          mat.emissiveTexture = tex;
        }
        // 有贴图时用白色让贴图原色显示；没贴图时用原始颜色（太暗则兜底灰色）
        const finalTex = mat.emissiveTexture;
        mat.emissiveColor = finalTex
          ? new BABYLON.Color3(1, 1, 1)
          : (colorBrightness > 0.15 ? origColor : new BABYLON.Color3(0.6, 0.6, 0.6));
        mat.emissiveIntensity = Number.isFinite(Number(props.emissiveIntensity))
          ? Number(props.emissiveIntensity)
          : 1;

        // 关掉 tone mapping
        const ipc = new BABYLON.ImageProcessingConfiguration();
        ipc.toneMappingEnabled = false;
        ipc.exposure = 1.0;
        ipc.contrast = 1.0;
        mat.imageProcessingConfiguration = ipc;

        continue;
      }

      applyPropsToMaterial(mat, props);
    }
  }
}

/**
 * 从后端加载 model_materials.json 规则。
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchModelMaterialRules() {
  try {
    const res = await fetch("/assets/3d/config/model_materials.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rules) ? j.rules : [];
  } catch {
    return [];
  }
}
