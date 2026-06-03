/**
 * scene3d/instances.js
 * ────────────────────
 * 实例化渲染：树木、路灯等重复物件。
 * 用 Instance 渲染 → N 个相同物体只占 1 个 Draw Call。
 */

/**
 * 在场景中按位置列表创建树木实例。
 * @param {BABYLON.Scene} scene
 * @param {Array<{ x: number, y?: number, z: number, scale?: number }>} positions
 */
export function addTreeInstances(scene, positions) {
  const BABYLON = window.BABYLON;

  if (!positions?.length) return;

  // 树木面片模板（两个交叉平面 = 十字形）
  // 实际项目中应从 GLB 加载树木面片模型，此处为占位
  const template = BABYLON.MeshBuilder.CreatePlane(
    "treeTemplate",
    { width: 4, height: 6 },
    scene
  );
  template.isVisible = false;

  const mat = new BABYLON.StandardMaterial("treeMat", scene);
  mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.25);
  mat.emissiveColor = new BABYLON.Color3(0.05, 0.15, 0.05);
  // TODO: 实际应使用 Alpha Clip 贴图
  // mat.diffuseTexture = new BABYLON.Texture("tree_atlas.png", scene);
  // mat.diffuseTexture.hasAlpha = true;
  // mat.useAlphaFromDiffuseTexture = true;
  template.material = mat;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const scale = p.scale ?? 1;

    // 面片 A
    const instA = template.createInstance(`tree_${i}_a`);
    instA.position = new BABYLON.Vector3(p.x, (p.y ?? 0) + 3 * scale, p.z);
    instA.scaling = new BABYLON.Vector3(scale, scale, scale);

    // 面片 B（旋转 90°）
    const instB = template.createInstance(`tree_${i}_b`);
    instB.position = instA.position.clone();
    instB.scaling = instA.scaling.clone();
    instB.rotation.y = Math.PI / 2;
  }
}

/**
 * 通用实例化工具：从已有 mesh 创建 N 个 instance。
 * @param {BABYLON.Mesh} sourceMesh
 * @param {Array<{ x: number, y?: number, z: number, rotY?: number, scale?: number }>} placements
 */
export function createInstances(sourceMesh, placements) {
  const BABYLON = window.BABYLON;

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    const inst = sourceMesh.createInstance(`${sourceMesh.name}_inst_${i}`);
    inst.position = new BABYLON.Vector3(p.x, p.y ?? 0, p.z);
    if (p.rotY != null) inst.rotation.y = p.rotY;
    if (p.scale != null) inst.scaling = new BABYLON.Vector3(p.scale, p.scale, p.scale);
  }
}
