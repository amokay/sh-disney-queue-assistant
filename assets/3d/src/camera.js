/**
 * scene3d/camera.js
 * ─────────────────
 * ArcRotateCamera 控制 + 过渡动画（聚焦景点、路线包围盒、入场动画等）。
 * 对外暴露纯坐标/数值接口，不泄露 Babylon 对象。
 */

const DEFAULT_ALPHA = -Math.PI / 2;
const DEFAULT_BETA = Math.PI / 4; // ~45° 俯角
const DEFAULT_RADIUS = 120;
const DEFAULT_TARGET = [0, 0, 0];

/**
 * @param {BABYLON.Scene} scene
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts] 可选覆盖默认相机参数
 */
export function createCameraRig(scene, canvas, opts = {}) {
  const BABYLON = window.BABYLON;

  // 如果传入了 target，同步更新默认值（resetToDefault 时用）
  if (opts.target && Array.isArray(opts.target) && opts.target.length >= 3) {
    DEFAULT_TARGET[0] = opts.target[0];
    DEFAULT_TARGET[1] = opts.target[1];
    DEFAULT_TARGET[2] = opts.target[2];
  }

  const target = new BABYLON.Vector3(...DEFAULT_TARGET);

  // 从 position + target 推算 ArcRotateCamera 的 alpha/beta/radius
  let initAlpha = opts.alpha ?? DEFAULT_ALPHA;
  let initBeta = opts.beta ?? DEFAULT_BETA;
  let initRadius = opts.radius ?? DEFAULT_RADIUS;

  if (opts.position && Array.isArray(opts.position) && opts.position.length >= 3) {
    const pos = new BABYLON.Vector3(opts.position[0], opts.position[1], opts.position[2]);
    const diff = pos.subtract(target);
    initRadius = diff.length();
    // alpha = atan2(x, z) 在 Babylon ArcRotate 中是绕 Y 轴角度
    initAlpha = Math.atan2(diff.x, diff.z);
    // beta = 从 Y 轴向下的角度
    initBeta = Math.acos(Math.max(-1, Math.min(1, diff.y / initRadius)));
  }

  const camera = new BABYLON.ArcRotateCamera(
    "mainCamera",
    initAlpha,
    initBeta,
    initRadius,
    target,
    scene
  );

  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 500;
  camera.upperBetaLimit = Math.PI * 0.495; // 不让翻到底下
  camera.minZ = 0.5;
  camera.maxZ = 20000; // 确保能看到 skybox（size=10000）
  camera.panningSensibility = 200;
  camera.wheelDeltaPercentage = 0.02;
  camera.pinchDeltaPercentage = 0.01;
  // 移动端触控：单指旋转，双指缩放+平移
  camera.inputs.attached.pointers.multiTouchPanAndZoom = true;

  // 惯性阻尼
  camera.inertia = 0.9;
  camera.panningInertia = 0.85;

  // ─── 动画状态 ───
  let _anim = null; // { startTime, duration, from, to, onComplete }

  /**
   * 入场动画：绕目标点旋转 360° + 拉近。
   * @param {{ duration?: number }} [animOpts]
   * @returns {Promise<void>}
   */
  function playIntro(animOpts = {}) {
    const duration = animOpts.duration || 3000;
    const startAlpha = camera.alpha;
    const endAlpha = startAlpha + Math.PI * 2;
    const startRadius = camera.radius * 2.5;
    const endRadius = camera.radius;

    camera.radius = startRadius;

    return new Promise((resolve) => {
      camera.detachControl();
      _anim = {
        startTime: performance.now(),
        duration,
        update(t) {
          const k = easeOutQuart(t);
          camera.alpha = startAlpha + (endAlpha - startAlpha) * k;
          camera.radius = startRadius + (endRadius - startRadius) * k;
        },
        onComplete: () => {
          camera.attachControl(canvas, true);
          resolve();
        },
      };
    });
  }

  /**
   * 聚焦到世界坐标点。
   * @param {{ x: number, y: number, z: number }} point
   * @param {{ radius?: number, duration?: number }} [animOpts]
   */
  function focusOnPoint(point, animOpts = {}) {
    const duration = animOpts.duration || 1000;
    const endRadius = animOpts.radius ?? 40;

    // 与地面成 30 度角 → 从天顶算 60 度
    const endBeta = Math.PI / 3;

    // ★ 把 target 向下偏移，让模型出现在画面上方约 40% 位置
    // 偏移量 = radius * sin(beta) * 偏移比例
    // 屏幕中心是 50%，想让模型在 40%，需要往下偏 10% 的视野
    const targetOffsetY = -endRadius * Math.sin(endBeta) * 0.25;
    const endTarget = new BABYLON.Vector3(
      point.x,
      point.y + targetOffsetY,
      point.z
    );

    const startTarget = camera.target.clone();
    const startRadius = camera.radius;
    const startAlpha = camera.alpha;
    const startBeta = camera.beta;

    camera.detachControl();
    _anim = {
      startTime: performance.now(),
      duration,
      update(t) {
        const k = easeInOutCubic(t);
        BABYLON.Vector3.LerpToRef(startTarget, endTarget, k, camera.target);
        camera.radius = startRadius + (endRadius - startRadius) * k;
        camera.beta = startBeta + (endBeta - startBeta) * k;
      },
      onComplete: () => camera.attachControl(canvas, true),
    };
  }

  /**
   * 聚焦包住一组点（路线/景点列表）。
   * @param {Array<{ x: number, y?: number, z: number }>} points
   * @param {{ duration?: number }} [animOpts]
   */
  function focusOnBounds(points, animOpts = {}) {
    if (!points?.length) return;
    const BABYLON_NS = window.BABYLON;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 16);
    const radius = Math.min(Math.max(span * 1.5, 35), 220);
    focusOnPoint({ x: cx, y: 0, z: cz }, { radius, duration: animOpts.duration || 1100 });
  }

  /**
   * 正上方俯视（LBS 定位居中）。
   * @param {{ x: number, z: number }} point
   * @param {{ height?: number }} [opts]
   */
  function focusTopDown(point, opts = {}) {
    const height = opts.height ?? 60;
    const endTarget = new BABYLON.Vector3(point.x, 0, point.z);
    const startTarget = camera.target.clone();
    const startBeta = camera.beta;
    const startRadius = camera.radius;

    camera.detachControl();
    _anim = {
      startTime: performance.now(),
      duration: 1100,
      update(t) {
        const k = easeInOutCubic(t);
        BABYLON.Vector3.LerpToRef(startTarget, endTarget, k, camera.target);
        camera.beta = startBeta + (0.01 - startBeta) * k; // 几乎正上方
        camera.radius = startRadius + (height - startRadius) * k;
      },
      onComplete: () => camera.attachControl(canvas, true),
    };
  }

  /**
   * 回到默认视角。
   */
  function resetToDefault() {
    focusOnPoint(
      { x: DEFAULT_TARGET[0], y: DEFAULT_TARGET[1], z: DEFAULT_TARGET[2] },
      { radius: DEFAULT_RADIUS, duration: 1100 }
    );
  }

  /**
   * 每帧更新（由 SceneManager 的 render loop 调用）。
   */
  function update() {
    if (!_anim) return;
    const elapsed = performance.now() - _anim.startTime;
    const t = Math.min(1, elapsed / _anim.duration);
    _anim.update(t);
    if (t >= 1) {
      const cb = _anim.onComplete;
      _anim = null;
      if (cb) cb();
    }
  }

  return {
    camera,
    playIntro,
    focusOnPoint,
    focusOnBounds,
    focusTopDown,
    resetToDefault,
    update,
    /** 供外部设置默认目标（从 config 传入） */
    setDefaultTarget(x, y, z) {
      DEFAULT_TARGET[0] = x;
      DEFAULT_TARGET[1] = y;
      DEFAULT_TARGET[2] = z;
    },
  };
}

// ─── 缓动函数 ───
function easeOutQuart(t) {
  return 1 - (1 - t) ** 4;
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
