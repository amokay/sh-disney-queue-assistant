import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET } from "./config.js";

function v3(arr) {
  return new THREE.Vector3(arr[0], arr[1], arr[2]);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// Ease-out quart for a smooth deceleration feel
function easeOutQuart(t) {
  return 1 - (1 - t) ** 4;
}

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 3500;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    // PC: left-click drag to rotate, right-click to pan
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    // Mobile: one-finger rotate, two-finger pan + pinch zoom
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Mac trackpad: disable default scroll-to-zoom,
    // custom handler: two-finger scroll → pan, pinch → zoom
    this.controls.enableZoom = false;
    this._setupTrackpadWheel(camera, domElement);
    this.controls.target.copy(v3(DEFAULT_CAMERA_TARGET));
    this.camera.position.set(
      DEFAULT_CAMERA_POSITION[0],
      DEFAULT_CAMERA_POSITION[1],
      DEFAULT_CAMERA_POSITION[2]
    );
    this.controls.update();

    /** @type {null | { t0: number, duration: number, startPos: THREE.Vector3, endPos: THREE.Vector3, startTarget: THREE.Vector3, endTarget: THREE.Vector3 }} */
    this._focus = null;

    /** @type {null | { t0: number, duration: number, center: THREE.Vector3, radius: number, startTheta: number, startPhi: number, totalRotation: number }} */
    this._intro = null;

    /** @type {Promise<void> | null} */
    this._introPromise = null;
    this._introResolve = null;
  }

  /**
   * Play entrance animation: orbit 360° around scene center with ease-out deceleration,
   * while pulling the camera closer (dolly in).
   * @param {object} [opts]
   * @param {number} [opts.duration=3000] total duration in ms
   * @param {number} [opts.totalRotation=Math.PI*2] radians to orbit (default full 360°)
   * @param {number} [opts.startDistanceScale=2.5] initial distance multiplier (pulls in from far)
   */
  playIntro(opts = {}) {
    const duration = opts.duration || 3000;
    const totalRotation = opts.totalRotation || Math.PI * 2;
    const startDistanceScale = opts.startDistanceScale || 2.5;

    const target = this.controls.target.clone();
    const offset = new THREE.Vector3().copy(this.camera.position).sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    this._intro = {
      t0: performance.now(),
      duration,
      center: target,
      startRadius: spherical.radius * startDistanceScale,
      endRadius: spherical.radius,
      startTheta: spherical.theta,
      startPhi: spherical.phi,
      totalRotation,
    };

    // Set camera to starting far position
    const startOffset = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(spherical.radius * startDistanceScale, spherical.phi, spherical.theta)
    );
    this.camera.position.copy(target).add(startOffset);

    this.controls.enabled = false;
    this.controls.enableDamping = false;

    this._introPromise = new Promise((resolve) => {
      this._introResolve = resolve;
    });
    return this._introPromise;
  }

  /**
   * 将相机与目标点平滑移到「包住模型」的观察位置（用于点击景点/城堡）。
   * @param {THREE.Object3D} root 单个 glb 外包 Group（带 userData.isGltfModelRoot）
   */
  focusOnModelRoot(root) {
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = size.length() * 0.5;
      this._startFocus(center, Math.max(radius, 4));
      return;
    }
    const p = new THREE.Vector3();
    root.getWorldPosition(p);
    this._startFocus(p, 18);
  }

  /**
   * @param {THREE.Vector3} center
   * @param {number} radius 大致包围半径（米/场景单位）
   */
  focusAtWorldPoint(center, radius = 14) {
    this._startFocus(center.clone(), Math.max(radius, 3));
  }
  
  /**
   * 正仰视聚焦：相机置于 center 正上方 (height) + 极小 z 偏移避免 lookAt 退化。
   * 与 _focus 通道复用 ease 过渡。
   * @param {THREE.Vector3} center 聚焦目标点
   * @param {{ height?: number, duration?: number } | number} [opts] 数字时作为 height
   */
  focusTopDownAtWorldPoint(center, opts = {}) {
    this._endIntroIfActive();
    const o = typeof opts === "number" ? { height: opts } : (opts || {});
    const height = Number.isFinite(o.height) ? o.height : 60;
    const duration = Number.isFinite(o.duration) ? o.duration : 1100;
    const target = center.clone();
    const endPos = target.clone().add(new THREE.Vector3(0, height, 0.01));
  
    this._focus = {
      t0: performance.now(),
      duration,
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget: target,
    };
    this.controls.enableDamping = false;
    this.controls.enabled = false;
  
    window.dispatchEvent(new CustomEvent("camera-focus-start", { detail: { target } }));
  }

  /**
   * 俯视包住整条路线（折线 + 景点），便于同时看地图与侧面板。
   * @param {Array<{ x: number, y?: number, z: number }>} [points]
   * @param {Array<{ position?: { x: number, y?: number, z: number } }>} [ordered]
   */
  _endIntroIfActive() {
    if (this._intro) {
      this._intro = null;
      this.controls.enabled = true;
      this.controls.enableDamping = true;
      if (this._introResolve) { this._introResolve(); this._introResolve = null; this._introPromise = null; }
    }
  }

  /**
   * 行中规划完成后：同时框住「我的位置」与下一站景点。
   * @param {{ x: number, y?: number, z: number }} lbsPoint
   * @param {{ x: number, y?: number, z: number }} nextPoint
   */
  focusOnLbsAndNext(lbsPoint, nextPoint) {
    this._endIntroIfActive();
    const box = new THREE.Box3();
    const add = (p) => {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        box.expandByPoint(new THREE.Vector3(p.x, p.y ?? 0, p.z));
      }
    };
    add(lbsPoint);
    add(nextPoint);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 16);
    const radius = span * 0.65 + size.y * 0.25;
    const dist = THREE.MathUtils.clamp(radius * 2.6, 42, 200);
    const offsetDir = new THREE.Vector3(0.5, 0.35, 0.65).normalize();
    const endPos = center.clone().add(offsetDir.multiplyScalar(dist));

    this._focus = {
      t0: performance.now(),
      duration: 1200,
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget: center.clone(),
    };
    this.controls.enableDamping = false;
    this.controls.enabled = false;
  }

  focusOnRoute(points, ordered) {
    this._endIntroIfActive();

    const box = new THREE.Box3();
    for (const p of points || []) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        box.expandByPoint(new THREE.Vector3(p.x, p.y ?? 0, p.z));
      }
    }
    for (const o of ordered || []) {
      const pos = o?.position;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
        box.expandByPoint(new THREE.Vector3(pos.x, pos.y ?? 0, pos.z));
      }
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 12);
    const radius = span * 0.72 + size.y * 0.35;
    const dist = THREE.MathUtils.clamp(radius * 2.5, 35, 220);
    const offsetDir = new THREE.Vector3(0.5, 0.5, 0.5).normalize();
    const endPos = center.clone().add(offsetDir.multiplyScalar(dist));

    this._focus = {
      t0: performance.now(),
      duration: 1100,
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget: center.clone(),
    };
    this.controls.enableDamping = false;
    this.controls.enabled = false;
  }

  _startFocus(center, radius) {
    this._endIntroIfActive();
    const dist = THREE.MathUtils.clamp(radius * 3.0, 32, 160);
    // Offset direction: low pitch (~15°) for near-level perspective toward the attraction
    const offsetDir = new THREE.Vector3(0.55, 0.25, 0.78).normalize();
    const endPos = center.clone().add(offsetDir.multiplyScalar(dist));
    endPos.y = 25;

    this._focus = {
      t0: performance.now(),
      duration: 1000,
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget: center.clone(),
    };
    this.controls.enableDamping = false;
    this.controls.enabled = false;

    // Dispatch focus-start event for other systems (labels fade)
    window.dispatchEvent(new CustomEvent("camera-focus-start", { detail: { target: center } }));
  }

  update(dt) {
    void dt;

    // Intro orbit animation
    if (this._intro) {
      const { t0, duration, center, startRadius, endRadius, startTheta, startPhi, totalRotation } = this._intro;
      const raw = (performance.now() - t0) / duration;
      const t = Math.min(1, raw);
      const k = easeOutQuart(t);

      const theta = startTheta + totalRotation * k;
      const phi = startPhi;
      const radius = startRadius + (endRadius - startRadius) * k;

      const offset = new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(radius, phi, theta)
      );
      this.camera.position.copy(center).add(offset);
      this.camera.lookAt(center);
      this.controls.target.copy(center);
      this.controls.update();

      if (t >= 1) {
        this._intro = null;
        this.controls.enabled = true;
        this.controls.enableDamping = true;
        if (this._introResolve) { this._introResolve(); this._introResolve = null; this._introPromise = null; }
      }
      return;
    }

    if (this._focus) {
      const t = (performance.now() - this._focus.t0) / this._focus.duration;
      const k = easeInOutCubic(Math.min(1, t));
      this.camera.position.lerpVectors(this._focus.startPos, this._focus.endPos, k);
      this.controls.target.lerpVectors(this._focus.startTarget, this._focus.endTarget, k);
      this.controls.update();
      if (t >= 1) {
        this._focus = null;
        this.controls.enabled = true;
        this.controls.enableDamping = true;
      }
      return;
    }
    this.controls.update();
  }

  resize() {
    this.controls.update();
  }

  /**
   * Mac trackpad custom wheel:
   * - Two-finger scroll (no ctrlKey) → pan
   * - Pinch gesture (ctrlKey) → dolly zoom
   */
  _setupTrackpadWheel(camera, domElement) {
    domElement.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this._intro || this._focus || !this.controls.enabled) return;

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (browser fires ctrlKey+wheel for trackpad pinch)
        const offset = new THREE.Vector3().copy(camera.position).sub(this.controls.target);
        const scale = e.deltaY > 0 ? 1.08 : 1 / 1.08;
        const newLen = THREE.MathUtils.clamp(offset.length() * scale, 2, 3500);
        offset.normalize().multiplyScalar(newLen);
        camera.position.copy(this.controls.target).add(offset);
      } else {
        // Two-finger scroll → pan (move camera and target together)
        const panSpeed = 0.8;
        const distance = camera.position.distanceTo(this.controls.target);
        const factor = distance * panSpeed * 0.002;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        camera.getWorldDirection(up);
        right.crossVectors(camera.up, up).normalize();
        up.copy(camera.up).normalize();
        const panOffset = new THREE.Vector3();
        panOffset.addScaledVector(right, -e.deltaX * factor);
        panOffset.addScaledVector(up, e.deltaY * factor);
        camera.position.add(panOffset);
        this.controls.target.add(panOffset);
      }

      this.controls.update();
    }, { passive: false });
  }

  animateToPreset(preset) {
    this.camera.position.copy(v3(preset.position));
    this.controls.target.copy(v3(preset.target));
    this.controls.update();
  }

  /**
   * 飞回初始相机视角（地图模式）：position 与 target 均恢复为 config 中默认值，
   * 复用 _focus 通道的 ease 过渡保证平滑动画。
   * @param {{ duration?: number }} [opts]
   */
  resetToDefault(opts = {}) {
    this._endIntroIfActive();
    const duration = Number.isFinite(opts.duration) ? opts.duration : 1100;
    const endPos = v3(DEFAULT_CAMERA_POSITION);
    const endTarget = v3(DEFAULT_CAMERA_TARGET);

    this._focus = {
      t0: performance.now(),
      duration,
      startPos: this.camera.position.clone(),
      endPos,
      startTarget: this.controls.target.clone(),
      endTarget,
    };
    this.controls.enableDamping = false;
    this.controls.enabled = false;

    window.dispatchEvent(
      new CustomEvent("camera-focus-start", { detail: { target: endTarget } })
    );
  }
}
