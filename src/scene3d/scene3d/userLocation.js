/**
 * scene3d/userLocation.js
 * ───────────────────────
 * 用户 LBS 定位标记：蓝色脉冲三棱锥 + 底部圆环。
 */

/**
 * @param {BABYLON.Scene} scene
 */
export function createUserLocationMarker(scene) {
  const BABYLON = window.BABYLON;

  const root = new BABYLON.TransformNode("UserLBS", scene);
  root.position.x = -1.6;  // 默认 fallback 位置（无 GPS 时）
  root.position.z = -20.6;
  root.setEnabled(false); // 初始隐藏

  // ===== 蓝色三棱锥（尖角朝下） =====
  const disc = BABYLON.MeshBuilder.CreateCylinder(
    "lbsDisc",
    { diameterTop: 1.5, diameterBottom: 0, height: 2, tessellation: 3 },
    scene
  );
  disc.parent = root;
  disc.position.y = 1.5; // 悬浮在地面上方
  disc.isPickable = false;
  disc.alwaysSelectAsActiveMesh = true;
  disc.renderingGroupId = 2;

  const discMat = new BABYLON.StandardMaterial("lbsDiscMat", scene);
  discMat.diffuseColor = new BABYLON.Color3(0.23, 0.51, 0.96);  // #3B82F6 浅蓝色
  discMat.emissiveColor = new BABYLON.Color3(0.23, 0.51, 0.96); // #3B82F6 自发光
  discMat.specularColor = new BABYLON.Color3(0, 0, 0);
  discMat.alpha = 0.85;
  discMat.backFaceCulling = false;
  disc.material = discMat;

  // ===== 底部圆形（地面参考） =====
  const ring = BABYLON.MeshBuilder.CreateCylinder(
    "lbsRing",
    { diameterTop: 3, diameterBottom: 3, height: 0.01, tessellation: 32 },
    scene
  );
  ring.parent = root;
  ring.position.y = 0.5;
  ring.isPickable = false;
  ring.alwaysSelectAsActiveMesh = true;
  ring.renderingGroupId = 1;

  const ringMat = new BABYLON.StandardMaterial("lbsRingMat", scene);
  ringMat.diffuseColor = new BABYLON.Color3(0.23, 0.51, 0.96);  // #3B82F6 浅蓝色
  ringMat.emissiveColor = new BABYLON.Color3(0.23, 0.51, 0.96); // #3B82F6
  ringMat.specularColor = new BABYLON.Color3(0, 0, 0);
  ringMat.alpha = 0.45;
  ringMat.backFaceCulling = false;
  ring.material = ringMat;

  let _targetPos = null; // { x, z }

  function setPosition(x, z) {
    root.position.x = x;
    root.position.z = z;
    root.position.y = 0;
    root.setEnabled(true);
  }

  function setTarget(pos) {
    _targetPos = pos; // { x, z }
  }

  function clearTarget() {
    _targetPos = null;
  }

  function hide() {
    root.setEnabled(false);
  }

  /** 每帧脉冲动画 + 高低起伏 */
  let _pulsePhase = 0;
  const BASE_Y = 1.5; // 三棱锥基准高度
  function tick() {
    if (!root.isEnabled()) return;
    _pulsePhase += 0.04;
    const scale = 1 + 0.22 * Math.sin(_pulsePhase);
    disc.scaling.set(scale, 1, scale);
    const ringScale = 1 + 0.08 * Math.sin(_pulsePhase);
    ring.scaling.set(ringScale, 1, ringScale);
    // 高低起伏
    disc.position.y = BASE_Y + 0.6 * Math.sin(_pulsePhase * 0.8);
    // 旋转
    disc.rotation.y += 0.02;
    // 呼吸透明度
    discMat.alpha = 0.85 + 0.1 * Math.sin(_pulsePhase * 0.7);
  }

  return { setPosition, setTarget, clearTarget, hide, tick };
}
