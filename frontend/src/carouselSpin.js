import * as THREE from "three";

/**
 * 旋转木马（fantasia-carousel）选中态飞马旋转动效。
 *
 * 原理：
 * - 在 GLB 加载完成后，定位 pickableAttractionId === "fantasia-carousel" 的根节点；
 * - 在其子树中识别飞马 mesh（材质名或节点名包含 "horse"）；
 * - 由于飞马的几何顶点位置已在生成 GLB 时烘焙到模型局部坐标（绕中心 Y 轴分布），
 *   只需对每个飞马节点的 rotation.y 同步增量，即可让所有飞马整体绕中心 Y 轴公转，
 *   视觉上等同于真实旋转木马的运转。
 * - 取消选中时停止角速度更新，保持当前角度（避免回弹跳变）。
 */

const CAROUSEL_ATTRACTION_ID = "fantasia-carousel";
const SPIN_SPEED = 0.7; // rad/s，约 4 秒一圈，视觉舒适
const HORSE_KEYWORD = "horse";

export function createCarouselSpin(scene) {
  /** @type {Array<{ object: THREE.Object3D, baseRotY: number }>} */
  const horses = [];
  let active = false;
  let angle = 0;

  function isHorseMesh(obj) {
    if (!obj.isMesh) return false;
    const matNames = Array.isArray(obj.material)
      ? obj.material.map((m) => m?.name || "")
      : [obj.material?.name || ""];
    if (matNames.some((n) => n.toLowerCase().includes(HORSE_KEYWORD))) return true;
    if ((obj.name || "").toLowerCase().includes(HORSE_KEYWORD)) return true;
    if ((obj.parent?.name || "").toLowerCase().includes(HORSE_KEYWORD)) return true;
    return false;
  }

  function discover() {
    horses.length = 0;
    scene.traverse((obj) => {
      if (!obj.userData?.isGltfModelRoot) return;
      if (obj.userData.pickableAttractionId !== CAROUSEL_ATTRACTION_ID) return;
      obj.traverse((child) => {
        if (!isHorseMesh(child)) return;
        // 仅记录唯一节点；若飞马 mesh 已在某个 horses_* 父节点下，
        // 选择父节点旋转可减少节点数（多匹飞马共享一次 rotation 写入）。
        const target = child;
        if (!horses.some((h) => h.object === target)) {
          horses.push({ object: target, baseRotY: target.rotation.y });
        }
      });
    });
    return horses.length;
  }

  function setActive(on) {
    active = !!on;
  }

  function update(dt) {
    if (!active || horses.length === 0) return;
    angle -= SPIN_SPEED * dt;
    for (const h of horses) {
      h.object.rotation.y = h.baseRotY + angle;
    }
  }

  return {
    discover,
    setActive,
    update,
    isActive: () => active,
    horseCount: () => horses.length,
    attractionId: CAROUSEL_ATTRACTION_ID,
  };
}
