/**
 * scene3d/infiniteGround.js
 * ─────────────────────────
 * 无边界渐隐地面：超大圆盘 + 径向渐变透明。
 * 中心大范围保持实地，远处缓慢淡出融入天空。
 */

/**
 * @param {BABYLON.Scene} scene
 * @param {object} [opts]
 * @param {number} [opts.radius=5000]
 * @param {string} [opts.color="#14a008"]
 * @param {number} [opts.y=0]
 * @returns {{ mesh: BABYLON.Mesh, dispose: () => void }}
 */
export function createInfiniteGround(scene, opts = {}) {
  const BABYLON = window.BABYLON;

  const radius = opts.radius ?? 5000;
  const groundY = opts.y ?? 0;
  const colorHex = opts.color ?? "#14a008";

  // ── 圆盘 mesh ──
  const ground = BABYLON.MeshBuilder.CreateDisc("infiniteGround", {
    radius,
    tessellation: 128,
  }, scene);

  ground.rotation.x = Math.PI / 2;
  ground.position.y = groundY;
  ground.isPickable = false;
  ground.receiveShadows = true;

  // ★ 最先渲染，不会盖住任何 UI 或其他透明物体
  ground.renderingGroupId = 0;
  ground.alphaIndex = 0;

  // ── 径向渐变透明贴图 ──
  const alphaTex = _createRadialAlphaTexture(scene, 512);

  // ── 材质：简单纯色 + 渐变透明 ──
  const mat = new BABYLON.PBRMaterial("infiniteGroundMat", scene);
  const c = BABYLON.Color3.FromHexString(colorHex);
  mat.albedoColor = c;
  mat.metallic = 0;
  mat.roughness = 1;
  mat.backFaceCulling = false;

  mat.opacityTexture = alphaTex;
  mat.transparencyMode = 2; // ALPHABLEND
  mat.alpha = 1;

  // 降低光照影响，颜色更稳定
  mat.directIntensity = 0.3;
  mat.environmentIntensity = 0.1;
  mat.specularIntensity = 0;
  mat.reflectivityColor = new BABYLON.Color3(0, 0, 0);

  ground.material = mat;

  return {
    mesh: ground,
    dispose() {
      alphaTex.dispose();
      mat.dispose();
      ground.dispose();
    },
  };
}

/**
 * 径向透明度：中心大范围实地，远处缓慢淡出。
 */
function _createRadialAlphaTexture(scene, size) {
  const BABYLON = window.BABYLON;
  const tex = new BABYLON.DynamicTexture("groundAlpha", size, scene, false);
  const ctx = tex.getContext();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,1)");      // 55% 内完全实地
  grad.addColorStop(0.7, "rgba(255,255,255,0.7)");
  grad.addColorStop(0.85, "rgba(255,255,255,0.25)");
  grad.addColorStop(0.95, "rgba(255,255,255,0.05)");
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}
