/**
 * scene3d/mapPins.js
 * ──────────────────
 * 地图标点（标注性的 3D 图钉）。
 */

/**
 * @param {BABYLON.Scene} scene
 * @param {Array<{ id: string, label: string, x: number, y?: number, z: number, attractionId?: string }>} pins
 */
export function addMapPins(scene, pins) {
  const BABYLON = window.BABYLON;

  if (!pins?.length) return;

  const parent = new BABYLON.TransformNode("MapPins", scene);

  // 图钉模板（细圆柱 + 顶部小球）
  const poleTemplate = BABYLON.MeshBuilder.CreateCylinder(
    "pinPole",
    { height: 4, diameter: 0.3, tessellation: 8 },
    scene
  );
  poleTemplate.isVisible = false;
  poleTemplate.parent = parent;

  const headTemplate = BABYLON.MeshBuilder.CreateSphere(
    "pinHead",
    { diameter: 1.2, segments: 8 },
    scene
  );
  headTemplate.isVisible = false;
  headTemplate.parent = parent;

  const mat = new BABYLON.StandardMaterial("pinMat", scene);
  mat.diffuseColor = new BABYLON.Color3(0.9, 0.3, 0.3);
  mat.emissiveColor = new BABYLON.Color3(0.3, 0.05, 0.05);
  poleTemplate.material = mat;
  headTemplate.material = mat;

  for (const pin of pins) {
    const poleInst = poleTemplate.createInstance(`pin_pole_${pin.id}`);
    poleInst.position = new BABYLON.Vector3(pin.x, (pin.y ?? 0) + 2, pin.z);
    poleInst.metadata = {
      pinId: pin.id,
      pinLabel: pin.label,
      attractionId: pin.attractionId || null,
    };

    const headInst = headTemplate.createInstance(`pin_head_${pin.id}`);
    headInst.position = new BABYLON.Vector3(pin.x, (pin.y ?? 0) + 4.5, pin.z);
    headInst.metadata = poleInst.metadata; // 共享 metadata 以便拾取
  }
}
