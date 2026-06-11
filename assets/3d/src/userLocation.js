/**
 * scene3d/userLocation.js
 * ───────────────────────
 * 用户 LBS 定位标记：蓝色脉冲圆点 + 方向三角箭头。
 */

/**
 * @param {BABYLON.Scene} scene
 */
export function createUserLocationMarker(scene) {
  const BABYLON = window.BABYLON;

  const root = new BABYLON.TransformNode("UserLBS", scene);
  root.setEnabled(false); // 初始隐藏

  // 蓝色脉冲圆盘
  const disc = BABYLON.MeshBuilder.CreateDisc(
    "lbsDisc",
    { radius: 2.5, tessellation: 24 },
    scene
  );
  disc.rotation.x = Math.PI / 2; // 水平放置
  disc.parent = root;
  disc.position.y = 0.1;

  const discMat = new BABYLON.StandardMaterial("lbsDiscMat", scene);
  discMat.diffuseColor = new BABYLON.Color3(0.2, 0.5, 1);
  discMat.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.8);
  discMat.alpha = 0.7;
  disc.material = discMat;

  // 方向三角箭头（指向目标景点）
  const arrow = BABYLON.MeshBuilder.CreateDisc(
    "lbsArrow",
    { radius: 1.8, tessellation: 3 },
    scene
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.parent = root;
  arrow.position.y = 0.15;
  arrow.setEnabled(false);

  const arrowMat = new BABYLON.StandardMaterial("lbsArrowMat", scene);
  arrowMat.diffuseColor = new BABYLON.Color3(1, 0.4, 0.1);
  arrowMat.emissiveColor = new BABYLON.Color3(0.6, 0.2, 0);
  arrow.material = arrowMat;

  let _targetPos = null; // { x, z }

  function setPosition(x, z) {
    root.position.x = x;
    root.position.z = z;
    root.position.y = 0;
    root.setEnabled(true);
    updateArrowRotation();
  }

  function setTarget(pos) {
    _targetPos = pos; // { x, z }
    arrow.setEnabled(true);
    updateArrowRotation();
  }

  function clearTarget() {
    _targetPos = null;
    arrow.setEnabled(false);
  }

  function hide() {
    root.setEnabled(false);
  }

  function updateArrowRotation() {
    if (!_targetPos) return;
    const dx = _targetPos.x - root.position.x;
    const dz = _targetPos.z - root.position.z;
    const angle = Math.atan2(dx, dz);
    arrow.rotation.y = angle;
  }

  /** 每帧脉冲动画（可选） */
  let _pulsePhase = 0;
  function tick() {
    _pulsePhase += 0.03;
    const scale = 1 + 0.15 * Math.sin(_pulsePhase);
    disc.scaling.x = scale;
    disc.scaling.z = scale;
  }

  return { setPosition, setTarget, clearTarget, hide, tick };
}
