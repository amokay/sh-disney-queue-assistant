/**
 * scene3d/lights.js
 * ─────────────────
 * 灯光系统：移动端最多 3 盏实时灯。
 * - 1 DirectionalLight（太阳）：唯一投射阴影
 * - 1 HemisphericLight（天光）：不投射阴影
 * - 烘焙 Lightmap 承担间接光（零运行时成本）
 */

/**
 * @param {BABYLON.Scene} scene
 * @param {object} tierConfig
 * @returns {{ sun: BABYLON.DirectionalLight, hemi: BABYLON.HemisphericLight, shadowGenerator: BABYLON.ShadowGenerator | null }}
 */
export function setupLights(scene, tierConfig) {
  const BABYLON = window.BABYLON;

  // 半球光：天蓝色顶光 + 暗色地面反射
  const hemi = new BABYLON.HemisphericLight(
    "hemiLight",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  hemi.intensity = 0.6;
  hemi.diffuse = new BABYLON.Color3(0.68, 0.78, 0.94); // 偏蓝天光
  hemi.groundColor = new BABYLON.Color3(0.16, 0.16, 0.19);

  // 主日光（暖白色）
  const sun = new BABYLON.DirectionalLight(
    "sunLight",
    new BABYLON.Vector3(-0.5, -1, -0.8).normalize(),
    scene
  );
  sun.position = new BABYLON.Vector3(14, 300, 156);
  sun.intensity = 2.5;
  sun.diffuse = new BABYLON.Color3(1, 0.98, 0.94); // 暖白

  // 阴影已关闭
  let shadowGenerator = null;

  return { sun, hemi, shadowGenerator };
}

/**
 * 将 mesh 加入阴影投射列表（仅主要设施调用）。
 * @param {BABYLON.ShadowGenerator | null} shadowGenerator
 * @param {BABYLON.AbstractMesh} mesh
 */
export function addShadowCaster(shadowGenerator, mesh) {
  if (!shadowGenerator) return;
  shadowGenerator.addShadowCaster(mesh);
}
