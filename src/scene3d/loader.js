/**
 * scene3d/loader.js
 * ─────────────────
 * GLB 模型加载。Babylon 内置支持 Draco 解压，无需额外配置。
 * 支持分批加载策略（P3 运行时优化）。
 */

/**
 * 加载单个 GLB 文件到场景。
 * @param {BABYLON.Scene} scene
 * @param {string} url - GLB 文件路径
 * @param {object} [opts]
 * @param {string} [opts.name] - 根节点命名
 * @param {boolean} [opts.receiveShadows] - 是否接收阴影（默认 true）
 * @returns {Promise<{ rootNode: BABYLON.TransformNode, meshes: BABYLON.AbstractMesh[], animationGroups: BABYLON.AnimationGroup[] }>}
 */
export async function loadGLB(scene, url, opts = {}) {
  const BABYLON = window.BABYLON;

  const result = await BABYLON.SceneLoader.ImportMeshAsync(
    "", // 加载全部 mesh
    "", // rootUrl 为空，url 中包含完整路径
    url,
    scene
  );

  const rootNode = result.meshes[0]; // __root__ TransformNode
  if (opts.name) {
    rootNode.name = opts.name;
  }

  // 标记为 GLB 模型根节点（与框架层约定）
  rootNode.metadata = rootNode.metadata || {};
  rootNode.metadata.isGltfModelRoot = true;

  // 默认接收阴影
  if (opts.receiveShadows !== false) {
    for (const mesh of result.meshes) {
      if (mesh.receiveShadows !== undefined) {
        mesh.receiveShadows = true;
      }
    }
  }

  // 暂停所有加载出来的动画（按需激活策略）
  for (const group of result.animationGroups) {
    group.pause();
  }

  return {
    rootNode,
    meshes: result.meshes,
    animationGroups: result.animationGroups,
  };
}

/**
 * 分批加载策略：将模型列表按优先级分组加载。
 * @param {BABYLON.Scene} scene
 * @param {Array<{ url: string, priority: number, name?: string }>} manifest
 * @param {object} [callbacks]
 * @param {(url: string, rootNode: BABYLON.TransformNode) => void} [callbacks.onModelLoaded]
 */
export async function loadModelsBatched(scene, manifest, callbacks = {}) {
  // priority 0 = 立即加载，1 = 延迟 2s，2 = 延迟 5s
  const batches = [[], [], []];
  for (const entry of manifest) {
    const p = Math.min(entry.priority ?? 0, 2);
    batches[p].push(entry);
  }

  // Batch 0：立即加载
  for (const entry of batches[0]) {
    try {
      const result = await loadGLB(scene, entry.url, { name: entry.name });
      callbacks.onModelLoaded?.(entry.url, result.rootNode);
    } catch (e) {
      console.warn("[scene3d/loader] 跳过:", entry.url, e);
    }
  }

  // Batch 1：2s 后加载
  if (batches[1].length > 0) {
    setTimeout(async () => {
      for (const entry of batches[1]) {
        try {
          const result = await loadGLB(scene, entry.url, { name: entry.name });
          callbacks.onModelLoaded?.(entry.url, result.rootNode);
        } catch (e) {
          console.warn("[scene3d/loader] 跳过:", entry.url, e);
        }
      }
    }, 2000);
  }

  // Batch 2：5s 后加载
  if (batches[2].length > 0) {
    setTimeout(async () => {
      for (const entry of batches[2]) {
        try {
          const result = await loadGLB(scene, entry.url, { name: entry.name });
          callbacks.onModelLoaded?.(entry.url, result.rootNode);
        } catch (e) {
          console.warn("[scene3d/loader] 跳过:", entry.url, e);
        }
      }
    }, 5000);
  }
}
