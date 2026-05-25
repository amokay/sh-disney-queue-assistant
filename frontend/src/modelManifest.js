import { loadGLB } from "./loader.js";
import * as THREE from "three";
import { applyManifestEntryTransforms, applyTransformToGroup } from "./modelTransforms.js";
import { applyMaterialRulesToRoot } from "./modelMaterials.js";
import { pickAttractionIdForGlbUrl } from "./glbAttractionMap.js";

/**
 * 按 manifest 渐进加载 glb；可对整组网格写入 pickableAttractionId 供射线拾取。
 * @param {THREE.Scene} scene
 * @param {{ models?: Array<{ id?: string, url: string, pickableAttractionId?: string | null, position?: number[], rotationDeg?: number[], scale?: number|number[] }> }} manifest
 * @param {Array<Record<string, unknown>>} transformRules 来自 model_transforms.json
 * @param {Array<Record<string, unknown>>} materialRules 来自 model_materials.json
 */
export async function loadModelsFromManifest(scene, manifest, transformRules = [], materialRules = []) {
  const list = manifest?.models;
  if (!Array.isArray(list) || list.length === 0) return;

  for (const entry of list) {
    if (!entry?.url) continue;
    const root = new THREE.Group();
    root.name = `manifest:${entry.id || entry.url}`;
    root.userData.isGltfModelRoot = true;

    try {
      await loadGLB(entry.url, root);
      scene.add(root);
      applyManifestEntryTransforms(root, entry.url, entry, transformRules);
      applyMaterialRulesToRoot(root, entry.url, materialRules);

      const pick = entry.pickableAttractionId;
      if (pick) {
        root.userData.pickableAttractionId = pick;
        root.traverse((o) => {
          if (o.isMesh) o.userData.attractionId = pick;
        });
      }
      console.info("[模型] manifest 已加载:", entry.url, entry);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("404")) {
        console.info("[模型] 文件不存在，已跳过（请检查 manifest 里的 url 是否与实际文件名一致）:", entry.url);
      } else {
        console.warn("[模型] manifest 加载失败:", entry.url, e);
      }
    }
  }
}

async function fetchGlbUrlList() {
  const tryUrls = ["/api/discover/glbs", "/api/glb-list"];
  for (const u of tryUrls) {
    try {
      const res = await fetch(u);
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.urls)) return j.urls;
      }
    } catch {
      /* continue */
    }
  }
  try {
    const res = await fetch("/assets/data/glb_urls.json");
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.urls)) return j.urls;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 自动扫描 optimized 下全部 .glb。pickRules：URL 含 match 则绑定景点点击；transformRules：见 model_transforms.json。
 * @param {THREE.Scene} scene
 * @param {Array<{ match: string, pickableAttractionId?: string }>} pickRules
 * @param {Array<Record<string, unknown>>} transformRules
 * @param {Array<Record<string, unknown>>} materialRules
 */
export async function loadDiscoveredModels(scene, pickRules = [], transformRules = [], materialRules = []) {
  try {
    const urls = await fetchGlbUrlList();
    if (!urls) {
      console.warn("[模型] 无法获取 glb 列表：请重启后端（cd backend → 先 Control+C 再 npm start），或维护 frontend/assets/data/glb_urls.json");
      return;
    }
    if (urls.length === 0) {
      console.info("[模型] optimized/ 下当前没有 .glb 文件");
      return;
    }

    for (const url of urls) {
      const root = new THREE.Group();
      root.name = `auto:${url}`;
      root.userData.isGltfModelRoot = true;

      try {
        await loadGLB(url, root);
        scene.add(root);
        applyTransformToGroup(root, url, transformRules);
        applyMaterialRulesToRoot(root, url, materialRules);

        const pick = pickAttractionIdForGlbUrl(url, pickRules);
        if (pick) {
          root.userData.pickableAttractionId = pick;
          root.traverse((o) => {
            if (o.isMesh) o.userData.attractionId = pick;
          });
        }
        console.info("[模型] 自动加载:", url);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("404")) {
          console.info("[模型] 跳过（404）:", url);
        } else {
          console.warn("[模型] 自动加载失败:", url, e);
        }
      }
    }

    console.info(`[模型] 自动扫描完成，共加载 ${urls.length} 个 glb`);
  } catch (e) {
    console.warn("[模型] 自动加载过程异常:", e);
  }
}
