/**
 * scene3d/carouselSpin.js
 * ───────────────────────
 * 旋转木马（fantasia-carousel）动画控制。
 * 聚焦时播放 GLB 自带的动画；取消聚焦时暂停。
 */

const CAROUSEL_ATTRACTION_ID = "fantasia-carousel";

/**
 * @param {BABYLON.Scene} scene
 */
export function createCarouselSpin(scene) {
  let _rootNode = null;
  let _animGroups = [];
  let _active = false;

  /**
   * 在模型加载完成后调用：找到旋转木马根节点和它的动画。
   */
  function discover() {
    _rootNode = null;
    _animGroups = [];

    // 找旋转木马根节点（可能是 Mesh 也可能是 TransformNode）
    // 先在 meshes 中找（ImportMeshAsync 的 __root__ 是 Mesh 类型）
    for (const mesh of scene.meshes) {
      if (mesh.metadata?.pickableAttractionId === CAROUSEL_ATTRACTION_ID) {
        _rootNode = mesh;
        break;
      }
    }
    // 也在 transformNodes 中找
    if (!_rootNode) {
      for (const node of scene.transformNodes) {
        if (node.metadata?.pickableAttractionId === CAROUSEL_ATTRACTION_ID) {
          _rootNode = node;
          break;
        }
      }
    }
    if (!_rootNode) {
      console.info("[carousel] 未找到旋转木马模型");
      return;
    }

    // 收集这个模型下所有子节点的 uniqueId
    const childIds = new Set();
    childIds.add(_rootNode.uniqueId);
    if (_rootNode.getChildMeshes) {
      for (const mesh of _rootNode.getChildMeshes(false)) {
        childIds.add(mesh.uniqueId);
      }
    }
    if (_rootNode.getChildTransformNodes) {
      for (const node of _rootNode.getChildTransformNodes(false)) {
        childIds.add(node.uniqueId);
      }
    }

    // 遍历场景所有 AnimationGroup，找到 target 属于旋转木马的
    for (const ag of scene.animationGroups) {
      for (const ta of ag.targetedAnimations) {
        if (ta.target && childIds.has(ta.target.uniqueId)) {
          _animGroups.push(ag);
          break;
        }
      }
    }

    console.info(`[carousel] 发现旋转木马，动画组: ${_animGroups.length} 个`,
      _animGroups.map(ag => ag.name));
  }

  function setActive(active) {
    if (_active === active) return;
    _active = active;

    for (const ag of _animGroups) {
      if (active) {
        ag.play(true);
      } else {
        ag.pause();
      }
    }
  }

  function update(/* dt */) {
    // GLB 自带动画由 AnimationGroup 驱动，不需要手动 update
  }

  return {
    attractionId: CAROUSEL_ATTRACTION_ID,
    discover,
    setActive,
    update,
  };
}
