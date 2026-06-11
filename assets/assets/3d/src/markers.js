/**
 * scene3d/markers.js
 * ──────────────────
 * 景点标记（Sprite 小圆点）+ 路线高亮。
 * Sprite 始终面向相机，不受距离影响大小可控。
 */

const MARKER_SIZE = 0.8; // sprite 大小
const MARKER_COLOR_HEX = "#ffffff";

/**
 * 不显示标记的景点 ID（已有对应 GLB 模型或需要手动隐藏）
 */
const HIDE_MARKER_IDS = new Set(["mine", "pirates"]);

/**
 * 程序化生成圆点贴图（避免加载外部图片）。
 */
function _createDotTexture(scene, size = 64) {
  const BABYLON = window.BABYLON;
  const tex = new BABYLON.DynamicTexture("markerDot", size, scene, false);
  const ctx = tex.getContext();
  const cx = size / 2;

  ctx.clearRect(0, 0, size, size);

  // 白色圆点 + 柔和边缘
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.8, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/**
 * 创建/重建景点标记 Sprite。
 * @param {BABYLON.Scene} scene
 * @param {Array<{ id: string, position: { x: number, y?: number, z: number } }>} attractions
 * @param {Set<string>} glbAttractionIds
 */
export function rebuildMarkers(scene, attractions, glbAttractionIds) {
  const BABYLON = window.BABYLON;

  // 清理旧标记
  const oldManager = scene._markerSpriteManager;
  if (oldManager) oldManager.dispose();

  // 清理旧 TransformNode（兼容旧版）
  const existing = scene.getTransformNodeByName("AttractionMarkers");
  if (existing) existing.dispose();

  if (!attractions?.length) return;

  // 生成圆点贴图
  const dotTex = _createDotTexture(scene);

  // Sprite Manager
  const manager = new BABYLON.SpriteManager(
    "markerSprites",
    "",  // 不用外部图片
    attractions.length,
    { width: 64, height: 64 },
    scene
  );
  manager.texture = dotTex;
  manager.isPickable = true;
  scene._markerSpriteManager = manager;

  // 用 TransformNode 存 metadata（sprite 本身不支持 metadata）
  const parent = new BABYLON.TransformNode("AttractionMarkers", scene);
  const spriteMap = new Map();

  for (const a of attractions) {
    if (glbAttractionIds.has(a.id) || HIDE_MARKER_IDS.has(a.id)) continue;

    const sprite = new BABYLON.Sprite(`marker:${a.id}`, manager);
    sprite.width = MARKER_SIZE;
    sprite.height = MARKER_SIZE;
    sprite.position = new BABYLON.Vector3(
      a.position.x,
      (a.position.y || 0) + 1.2,
      a.position.z
    );

    // 用隐形 mesh 承载 metadata 和拾取
    const hitBox = BABYLON.MeshBuilder.CreatePlane(
      `markerHit:${a.id}`,
      { size: MARKER_SIZE * 1.5 },
      scene
    );
    hitBox.position = sprite.position.clone();
    hitBox.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    hitBox.isVisible = false;
    hitBox.isPickable = true;
    hitBox.metadata = { attractionId: a.id };
    hitBox.parent = parent;

    spriteMap.set(a.id, { sprite, hitBox });
  }
}

/**
 * 设置路线高亮。
 */
export function setRouteHighlight(scene, ids) {
  const BABYLON = window.BABYLON;
  const highlightSet = ids ? new Set(ids) : null;

  // 高亮 marker hitbox
  const markersRoot = scene.getTransformNodeByName("AttractionMarkers");
  if (markersRoot) {
    for (const child of markersRoot.getChildMeshes()) {
      const aid = child.metadata?.attractionId;
      if (!aid) continue;
      // hitbox 不可见，高亮效果由 sprite 大小表现
    }
  }

  // 高亮 GLB 模型
  for (const node of scene.transformNodes) {
    if (!node.metadata?.isGltfModelRoot) continue;
    const poiId = node.metadata.pickableAttractionId;
    if (!poiId) continue;
    const on = highlightSet && highlightSet.has(poiId);

    for (const mesh of node.getChildMeshes()) {
      if (!mesh.material) continue;
      if (on) {
        if (!mesh.metadata) mesh.metadata = {};
        if (mesh.metadata._origEmissive === undefined) {
          mesh.metadata._origEmissive = mesh.material.emissiveColor?.clone();
        }
        mesh.material.emissiveColor = new BABYLON.Color3(0.27, 0.53, 0.8);
      } else {
        if (mesh.metadata?._origEmissive) {
          mesh.material.emissiveColor = mesh.metadata._origEmissive;
        }
      }
    }
  }
}
