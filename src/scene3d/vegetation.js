/**
 * scene3d/vegetation.js
 * ─────────────────────
 * 植被系统：从 vegetation_instances.json 读取 Blender 导出的摆放数据，
 * 每种模型只加载一次 GLB，然后用 Instance 在所有位置复制。
 *
 * 性能：
 *  - N 种植被 = N 个 Draw Call（Instance 渲染）
 *  - 15 种模型 × 数百实例 ≈ 15 Draw Call，移动端无压力
 */

import { applyTransformToNode, fetchModelTransformRules } from "./modelTransforms.js";
import { applyMaterialRulesToRoot, fetchModelMaterialRules } from "./modelMaterials.js";

/**
 * 加载并实例化所有植被。
 * @param {BABYLON.Scene} scene
 * @param {object} [opts]
 * @param {string} [opts.dataUrl] - JSON 数据路径
 * @param {string} [opts.modelBasePath] - GLB 模型目录
 * @returns {Promise<{ dispose: () => void }>}
 */
export async function loadVegetation(scene, opts = {}) {
  const BABYLON = window.BABYLON;
  const dataUrl = opts.dataUrl || "/assets/3d/config/vegetation_instances.json";
  const modelBasePath = opts.modelBasePath || "/assets/3d/models/vegetation/";

  // ── 1. 加载摆放数据 ──
  let data;
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) {
      console.info("[vegetation] 未找到植被数据文件，跳过");
      return { dispose() {} };
    }
    data = await res.json();
  } catch (e) {
    console.warn("[vegetation] 加载植被数据失败:", e);
    return { dispose() {} };
  }

  const models = data.models || [];
  const instances = data.instances || [];

  if (!models.length || !instances.length) {
    console.info("[vegetation] 植被数据为空，跳过");
    return { dispose() {} };
  }

  // 全局变换（从 JSON 或 model_transforms.json 读取）
  const globalTransform = data.globalTransform || {};

  console.info(`[vegetation] 开始加载 ${models.length} 种植被，共 ${instances.length} 个实例`);

  // ── 2. 加载每种基础模型 ──
  const parent = new BABYLON.TransformNode("VegetationRoot", scene);

  // 标记为 glTF 模型根，让调参面板能识别到
  parent.metadata = { isGltfModelRoot: true, isVegetationRoot: true };

  // 应用全局变换
  if (globalTransform.position) {
    parent.position = new BABYLON.Vector3(
      globalTransform.position[0] || 0,
      globalTransform.position[1] || 0,
      globalTransform.position[2] || 0
    );
  }
  if (globalTransform.rotation) {
    parent.rotation = new BABYLON.Vector3(
      (globalTransform.rotation[0] || 0) * Math.PI / 180,
      (globalTransform.rotation[1] || 0) * Math.PI / 180,
      (globalTransform.rotation[2] || 0) * Math.PI / 180
    );
  }
  if (globalTransform.scale != null) {
    const s = typeof globalTransform.scale === "number"
      ? globalTransform.scale
      : globalTransform.scale[0] || 1;
    parent.scaling = new BABYLON.Vector3(s, s, s);
  }
  const templateMap = new Map(); // model name → template mesh
  let sharedTexture = null; // 第一个 GLB 的贴图作为共享贴图

  for (const modelName of models) {
    const url = `${modelBasePath}${modelName}.glb`;
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene);
      const root = result.meshes[0]; // __root__
      root.parent = parent;
      root.setEnabled(false); // 模板不显示

      // ★ 贴图共享 + 材质微调
      for (const mesh of root.getChildMeshes()) {
        const mat = mesh.material;
        if (!mat) continue;

        const tex = mat.albedoTexture || mat.emissiveTexture || null;
        if (!sharedTexture && tex) {
          sharedTexture = tex;
          console.info(`[vegetation] ★ 共享贴图: ${tex.name}`);
        } else if (tex && tex !== sharedTexture) {
          if (mat.albedoTexture) mat.albedoTexture = sharedTexture;
          if (mat.emissiveTexture) mat.emissiveTexture = sharedTexture;
          tex.dispose();
        }

        // 彻底压低反光
        mat.environmentIntensity = 0.1;
        mat.specularIntensity = 0;
        mat.directIntensity = 0.8;
        mat.roughness = 1;
        mat.metallic = 0;
        mat.reflectivityColor = new BABYLON.Color3(0, 0, 0);
        if (mat.reflectionTexture) mat.reflectionTexture = null;
        if (mat.metallicTexture) mat.metallicTexture = null;
      }

      templateMap.set(modelName, root);
      console.info(`[vegetation] ✓ 模板加载: ${modelName}`);
    } catch (e) {
      console.warn(`[vegetation] 模板加载失败: ${modelName}`, e?.message || e);
    }
  }

  // ── 3. 批量实例化 ──
  let instanceCount = 0;

  for (const inst of instances) {
    const template = templateMap.get(inst.model);
    if (!template) continue;

    // 为每个实例创建一个 TransformNode 作为容器
    const node = new BABYLON.TransformNode(`veg:${inst.model}:${instanceCount}`, scene);
    node.parent = parent;

    // 位置
    const pos = inst.position || [0, 0, 0];
    node.position = new BABYLON.Vector3(pos[0], pos[1], pos[2]);

    // 旋转（度 → 弧度）
    const rot = inst.rotation || [0, 0, 0];
    node.rotation = new BABYLON.Vector3(
      rot[0] * Math.PI / 180,
      rot[1] * Math.PI / 180,
      rot[2] * Math.PI / 180
    );

    // 缩放
    const scl = inst.scale || [1, 1, 1];
    if (typeof scl === "number") {
      node.scaling = new BABYLON.Vector3(scl, scl, scl);
    } else {
      node.scaling = new BABYLON.Vector3(scl[0], scl[1], scl[2]);
    }

    // 把模板的子 mesh 逐个 createInstance
    const childMeshes = template.getChildMeshes(false);
    for (const mesh of childMeshes) {
      if (!mesh.isVisible && !mesh.getTotalVertices()) continue;
      try {
        const instance = mesh.createInstance(`${mesh.name}_i${instanceCount}`);
        instance.parent = node;
      } catch {
        const clone = mesh.clone(`${mesh.name}_c${instanceCount}`, node);
        if (clone) clone.setEnabled(true);
      }
    }

    instanceCount++;
  }

  // ── 4. 应用全局变换（从 model_transforms.json 读取 "VegetationRoot" 规则） ──
  const transformRules = await fetchModelTransformRules();
  applyTransformToNode(parent, "VegetationRoot", transformRules);

  console.info(`[vegetation] ✓ 植被实例化完成：${instanceCount} 个实例（${templateMap.size} 种模型）`);

  return {
    root: parent,
    dispose() {
      parent.dispose();
    },
  };
}
