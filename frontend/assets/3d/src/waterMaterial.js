/**
 * scene3d/waterMaterial.js
 * ────────────────────────
 * 移动端轻量水体效果。
 *
 * 不用 Babylon 的 WaterMaterial（需要反射/折射 RTT，移动端太重），
 * 而是用 PBR 材质 + 动态 UV 偏移模拟水面波纹：
 *  - 半透明蓝色 PBR，高金属度 + 低粗糙度 → 镜面反射天空
 *  - 法线贴图（程序化生成）提供水波细节
 *  - 每帧微调法线贴图 UV 偏移 → 水面流动感
 *  - 总开销：1 个额外 DynamicTexture + 每帧 2 行 UV 赋值，忽略不计
 */

/**
 * 将 pool mesh 的材质替换为轻量水体。
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.AbstractMesh} mesh - pool 的 mesh
 */
export function applyWaterMaterial(scene, mesh) {
  const BABYLON = window.BABYLON;

  // ── 创建水体 PBR 材质 ──
  const mat = new BABYLON.PBRMaterial("waterMat", scene);

  // 颜色：清澈蓝，半透明
  mat.albedoColor = new BABYLON.Color3(0.08, 0.32, 0.5);
  mat.alpha = 0.75;
  mat.transparencyMode = 2; // ALPHABLEND

  // 金属感 + 光滑 → 反射天空环境
  mat.metallic = 0.1;
  mat.roughness = 0.15;
  mat.environmentIntensity = 1.2; // 强化天空反射

  // 自发光微量：水面不会太暗
  mat.emissiveColor = new BABYLON.Color3(0.03, 0.06, 0.08);

  // 双面渲染（从水下看也有颜色）
  mat.backFaceCulling = false;

  // sub-surface（透光感）
  if (mat.subSurface) {
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.3;
    mat.subSurface.tintColor = new BABYLON.Color3(0.08, 0.35, 0.55);
  }

  // ── 程序化法线贴图（水波纹） ──
  const normalTex = _createWaterNormalTexture(scene, 256);
  normalTex.uScale = 8;
  normalTex.vScale = 8;
  mat.bumpTexture = normalTex;
  mat.bumpTexture.level = 0.4;

  mesh.material = mat;

  // ── 动画：来回摆动 + 缓慢漂移，模拟自然水面 ──
  let time = 0;

  const observer = scene.onBeforeRenderObservable.add(() => {
    time += 0.016; // ~60fps
    // 主方向缓慢漂移 + 正弦来回摆动
    normalTex.uOffset = time * 0.015 + Math.sin(time * 0.3) * 0.02;
    normalTex.vOffset = time * 0.008 + Math.cos(time * 0.2) * 0.015;
  });

  // 返回 dispose 方法
  mesh._waterDispose = () => {
    scene.onBeforeRenderObservable.remove(observer);
    normalTex.dispose();
    mat.dispose();
  };
}

/**
 * 程序化生成水波法线贴图（Perlin-like 噪声）。
 * 512x512 DynamicTexture，只生成一次，靠 UV 滚动产生流动。
 */
function _createWaterNormalTexture(scene, size) {
  const BABYLON = window.BABYLON;
  const tex = new BABYLON.DynamicTexture("waterNormal", size, scene, true);
  const ctx = tex.getContext();

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // 简单多层正弦波叠加模拟水波法线
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // 多频率叠加
      const nx = (
        Math.sin(x * 0.05 + y * 0.03) * 0.5 +
        Math.sin(x * 0.12 - y * 0.08) * 0.3 +
        Math.sin(x * 0.25 + y * 0.18) * 0.2
      );
      const ny = (
        Math.sin(y * 0.05 + x * 0.02) * 0.5 +
        Math.sin(y * 0.1 - x * 0.07) * 0.3 +
        Math.sin(y * 0.22 + x * 0.15) * 0.2
      );

      // 法线贴图格式：RGB = (nx+1)/2, (ny+1)/2, 1.0 (Z 向上)
      data[i]     = Math.round((nx * 0.5 + 0.5) * 255); // R = X
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); // G = Y
      data[i + 2] = 255;                                  // B = Z (向上)
      data[i + 3] = 255;                                  // A
    }
  }

  ctx.putImageData(imageData, 0, 0);
  tex.update();

  // 平铺设置
  tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.uScale = 8;
  tex.vScale = 8;

  return tex;
}
