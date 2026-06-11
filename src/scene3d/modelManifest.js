/**
 * scene3d/modelManifest.js
 * ────────────────────────
 * 模型加载管理：支持 autoDiscover 自动扫描 + pickRules 景点绑定。
 * 移植自原 Three.js 版 modelManifest.js，完整保留 autoDiscover / 手动列表 两种模式。
 *
 * 数据源：
 * - /assets/data/models.manifest.json（autoDiscover、pickRules、models 列表）
 * - /assets/data/model_transforms.json（位置/旋转/缩放）
 * - /assets/data/model_materials.json（材质覆盖）
 * - /api/discover/glbs 或 /assets/data/glb_urls.json（自动扫描 GLB 列表）
 */

import { loadGLB } from "./loader.js";
import { applyTransformToNode, applyManifestEntryTransforms } from "./modelTransforms.js";
import { applyMaterialRulesToRoot } from "./modelMaterials.js";

// ─── pickRules 匹配（与原版逻辑一致：最长 match 优先） ───

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
    const id = typeof pr.pickableAttractionId === "string" ? pr.pickableAttractionId.trim() : "";
    const m = String(pr.match || "").toLowerCase();
    if (!id || !m || !lower.includes(m)) continue;
    if (m.length > bestLen) {
      bestLen = m.length;
      bestId = id;
    }
  }
  return bestId;
}

// ─── GLB URL 列表获取 ───

async function fetchGlbUrlList() {
  const tryUrls = ["/api/discover/glbs", "/api/glb-list"];
  for (const u of tryUrls) {
    try {
      const res = await fetch(u);
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.urls)) return j.urls;
      }
    } catch { /* continue */ }
  }
  // GitHub Pages 子目录部署需要使用相对路径
  try {
    const res = await fetch("./assets/3d/config/glb_urls.json");
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.urls)) return j.urls;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── 自动扫描加载 ───

/**
 * autoDiscover 模式：扫描 optimized/ 下全部 .glb，按 pickRules 绑定景点，应用 transforms + materials。
 * @param {BABYLON.Scene} scene
 * @param {Array<{ match: string, pickableAttractionId?: string }>} pickRules
 * @param {Array<Record<string, unknown>>} transformRules
 * @param {Array<Record<string, unknown>>} materialRules
 * @returns {Promise<void>}
 */
export async function loadDiscoveredModels(scene, pickRules = [], transformRules = [], materialRules = []) {
  const BABYLON = window.BABYLON;

  const urls = await fetchGlbUrlList();
  if (!urls) {
    console.warn("[scene3d] 无法获取 glb 列表：请确认后端已启动或 glb_urls.json 存在");
    return;
  }
  if (urls.length === 0) {
    console.info("[scene3d] optimized/ 下当前没有 .glb 文件");
    return;
  }

  for (const url of urls) {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", url, scene);
      const rootNode = result.meshes[0]; // __root__
      rootNode.name = `auto:${url}`;
      rootNode.metadata = rootNode.metadata || {};
      rootNode.metadata.isGltfModelRoot = true;

      // 应用位置/旋转/缩放
      applyTransformToNode(rootNode, url, transformRules);

      // 应用材质覆盖
      applyMaterialRulesToRoot(rootNode, url, materialRules);

      // 绑定景点 ID（pickRules 匹配）
      const pick = pickAttractionIdForGlbUrl(url, pickRules);
      if (pick) {
        rootNode.metadata.pickableAttractionId = pick;
        rootNode.metadata.attractionId = pick;
        // 给所有子 mesh 也打上标记，方便 raycasting 拾取
        for (const mesh of rootNode.getChildMeshes()) {
          mesh.metadata = mesh.metadata || {};
          mesh.metadata.attractionId = pick;
        }
      }

      // 开启阴影接收
      for (const mesh of result.meshes) {
        if (mesh.receiveShadows !== undefined) {
          mesh.receiveShadows = true;
        }
      }

      // 暂停所有动画（按需激活）
      for (const group of result.animationGroups) {
        group.pause();
      }

      console.info("[scene3d] 自动加载:", url, pick ? `→ ${pick}` : "");
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("404")) {
        console.info("[scene3d] 跳过（404）:", url);
      } else {
        console.warn("[scene3d] 自动加载失败:", url, e);
      }
    }
  }

  console.info(`[scene3d] 自动扫描完成，共加载 ${urls.length} 个 glb`);
}

// ─── 手动 manifest 列表加载 ───

/**
 * 按 manifest.models 列表逐个加载。
 * @param {BABYLON.Scene} scene
 * @param {{ models?: Array<{ id?: string, url: string, pickableAttractionId?: string, position?: number[], rotationDeg?: number[], scale?: number|number[] }> }} manifest
 * @param {Array<Record<string, unknown>>} transformRules
 * @param {Array<Record<string, unknown>>} materialRules
 */
export async function loadModelsFromManifest(scene, manifest, transformRules = [], materialRules = []) {
  const BABYLON = window.BABYLON;
  const list = manifest?.models;
  if (!Array.isArray(list) || list.length === 0) return;

  for (const entry of list) {
    if (!entry?.url) continue;

    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", "", entry.url, scene);
      const rootNode = result.meshes[0];
      rootNode.name = `manifest:${entry.id || entry.url}`;
      rootNode.metadata = rootNode.metadata || {};
      rootNode.metadata.isGltfModelRoot = true;

      // 应用变换（manifest entry 可覆盖 transformRules）
      applyManifestEntryTransforms(rootNode, entry.url, entry, transformRules);

      // 应用材质覆盖
      applyMaterialRulesToRoot(rootNode, entry.url, materialRules);

      // 绑定景点 ID
      const pick = entry.pickableAttractionId;
      if (pick) {
        rootNode.metadata.pickableAttractionId = pick;
        rootNode.metadata.attractionId = pick;
        for (const mesh of rootNode.getChildMeshes()) {
          mesh.metadata = mesh.metadata || {};
          mesh.metadata.attractionId = pick;
        }
      }

      // 开启阴影接收
      for (const mesh of result.meshes) {
        if (mesh.receiveShadows !== undefined) {
          mesh.receiveShadows = true;
        }
      }

      // 暂停动画
      for (const group of result.animationGroups) {
        group.pause();
      }

      console.info("[scene3d] manifest 已加载:", entry.url, pick ? `→ ${pick}` : "");
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("404")) {
        console.info("[scene3d] 文件不存在，已跳过:", entry.url);
      } else {
        console.warn("[scene3d] manifest 加载失败:", entry.url, e);
      }
    }
  }
}
