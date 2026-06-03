import * as THREE from "three";

/**
 * 地图上展示当前 LBS 位置。
 *
 * 使用独立的 overlayScene 渲染，绕过主场景的 EffectComposer（SSAO 等后处理），
 * 避免 depthTest:false 对象在后处理管线中被吞掉。
 *
 * 组成部分：
 *   groundCircle  — 实心蓝色圆（主体，R=2.0）
 *   groundBorder  — 白色描边环（紧包在圆外，内径 2.0 外径 2.5）
 *   pulseRing     — 脉冲动画环（呼吸效果，内径 2.5 外径 4.0）
 *   beacon        — 垂直 Sprite（始终面向相机的蓝色圆点，高处可见）
 *   arrowYaw      — 水平贴地几何三角形（ShapeGeometry），指向下一景点
 *
 * 公开 API：setPosition / setTarget / clearTarget / setVisible / hide / tick / dispose
 *
 * 渲染方式：在 main.js 的 tick() 中，composer.render() 之后调用：
 *   renderer.autoClear = false;
 *   renderer.clearDepth();
 *   renderer.render(userLbs.overlayScene, camera);
 *   renderer.autoClear = true;
 */
export class UserLocationMarker {
  /** @param {THREE.Scene} _mainScene  仅用于保持 API 兼容；实际不再 add 到主场景 */
  constructor(_mainScene) {
    // 独立渲染场景（不经过 SSAO / EffectComposer）
    this.overlayScene = new THREE.Scene();

    this.group = new THREE.Group();
    this.group.name = "UserLBS";
    this.group.renderOrder = 999;

    // ── 主体实心圆 (R=2.0, Y=2.5) ────────────────────────────
    this.groundCircle = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 64),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.groundCircle.rotation.x = -Math.PI / 2;
    this.groundCircle.position.y = 2.5;
    this.groundCircle.renderOrder = 999;

    // ── 白色描边圆环 (内径 2.0 外径 2.5, Y=2.52) ──────────────
    this.groundBorder = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.groundBorder.rotation.x = -Math.PI / 2;
    this.groundBorder.position.y = 2.52;
    this.groundBorder.renderOrder = 999;

    // ── 脉冲环 (内径 2.5 外径 4.0, Y=2.48) ────────────────────
    this.pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 4.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 2.48;
    this.pulseRing.renderOrder = 998;

    // ── 垂直 Sprite 信标（始终面向相机，从高处也能看到）─────────
    const beaconCanvas = document.createElement("canvas");
    beaconCanvas.width = 64;
    beaconCanvas.height = 64;
    const ctx = beaconCanvas.getContext("2d");
    // 外圈白色描边
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    // 内圈蓝色填充
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();

    const beaconTex = new THREE.CanvasTexture(beaconCanvas);
    beaconTex.needsUpdate = true;
    const beaconMat = new THREE.SpriteMaterial({
      map: beaconTex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.beacon = new THREE.Sprite(beaconMat);
    this.beacon.scale.set(5, 5, 1);  // 5 场景单位大小
    this.beacon.position.y = 8;      // 悬浮在上方，确保从高处可见
    this.beacon.renderOrder = 1001;

    // ── 水平贴地几何三角箭头 ──────────────────────────────────
    const baseY    = 2.5;
    const tipY     = 4.2;
    const halfBase = 1.0;

    // 白色描边三角
    const strokeShape = new THREE.Shape();
    strokeShape.moveTo(0,                 tipY  + 0.15);
    strokeShape.lineTo(-(halfBase + 0.18), baseY - 0.15);
    strokeShape.lineTo( (halfBase + 0.18), baseY - 0.15);
    strokeShape.closePath();
    this._triStrokeMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(strokeShape),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this._triStrokeMesh.rotation.x = -Math.PI / 2;
    this._triStrokeMesh.position.y = -0.001;
    this._triStrokeMesh.renderOrder = 999;

    // 蓝色填充三角
    const fillShape = new THREE.Shape();
    fillShape.moveTo(0,         tipY);
    fillShape.lineTo(-halfBase, baseY);
    fillShape.lineTo( halfBase, baseY);
    fillShape.closePath();
    this._triMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(fillShape),
      new THREE.MeshBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this._triMesh.rotation.x = -Math.PI / 2;
    this._triMesh.renderOrder = 1000;

    // 外层 Group 负责 yaw（rotation.y），内层 Mesh 负责水平翻转
    this.arrowYaw = new THREE.Group();
    this.arrowYaw.position.y = 2.55;
    this.arrowYaw.renderOrder = 999;
    this.arrowYaw.add(this._triStrokeMesh, this._triMesh);
    this.arrowYaw.visible = false;

    this.group.add(this.groundCircle, this.groundBorder, this.pulseRing, this.beacon, this.arrowYaw);
    this.group.visible = false;

    // 添加到独立 overlay 场景（而非主场景）
    this.overlayScene.add(this.group);

    /** 当前用户场景坐标（由 setPosition 维护） */
    this._ux = 0;
    this._uz = 0;
    /** 目标景点场景坐标 @type {{ x: number, z: number } | null} */
    this._target = null;

    this._pulseT = 0;
    this._beaconT = 0;
  }

  // ── 位置 & 朝向 ──────────────────────────────────────────────

  /**
   * 更新用户在场景中的位置，并重新计算箭头朝向。
   * @param {number} x  scene x
   * @param {number} z  scene z
   */
  setPosition(x, z) {
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this._ux = x;
    this._uz = z;
    this._updateArrowYaw();
    console.log('[UserLBS] setPosition', { x, z, visible: this.group.visible });
  }

  /**
   * 设置箭头指向的目标景点坐标。传 null 则隐藏箭头。
   * @param {{ x: number, z: number } | null} target
   */
  setTarget(target) {
    this._target = target || null;
    this._updateArrowYaw();
  }

  /** 隐藏箭头（等价 setTarget(null)） */
  clearTarget() {
    this.setTarget(null);
  }

  /**
   * 内部：根据用户位置与目标重算 yaw，决定箭头显隐。
   */
  _updateArrowYaw() {
    if (!this._target || !this.group.visible) {
      this.arrowYaw.visible = false;
      return;
    }
    const dx   = this._target.x - this._ux;
    const dz   = this._target.z - this._uz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 2.0) {
      this.arrowYaw.visible = false;
      return;
    }
    this.arrowYaw.rotation.y = Math.atan2(dx, dz) + Math.PI;
    this.arrowYaw.visible = true;
  }

  // ── 可见性控制 ───────────────────────────────────────────────

  /** @param {boolean} v */
  setVisible(v) {
    this.group.visible = Boolean(v);
    if (!v) this.arrowYaw.visible = false;
    else this._updateArrowYaw();
  }

  hide() {
    this.group.visible = false;
    this.arrowYaw.visible = false;
  }

  // ── 动画 tick ────────────────────────────────────────────────

  tick() {
    if (!this.group.visible) return;
    // 脉冲环呼吸
    this._pulseT += 0.04;
    const s = 1 + Math.sin(this._pulseT) * 0.15;
    this.pulseRing.scale.set(s, s, 1);

    // 信标 Sprite 上下浮动 + 脉冲缩放
    this._beaconT += 0.03;
    const hover = 8 + Math.sin(this._beaconT) * 0.8;
    this.beacon.position.y = hover;
    const bs = 5 + Math.sin(this._beaconT * 1.5) * 0.5;
    this.beacon.scale.set(bs, bs, 1);
  }

  // ── 销毁 ─────────────────────────────────────────────────────

  dispose() {
    this.overlayScene.remove(this.group);
    this.groundCircle.geometry.dispose();
    this.groundCircle.material.dispose();
    this.groundBorder.geometry.dispose();
    this.groundBorder.material.dispose();
    this.pulseRing.geometry.dispose();
    this.pulseRing.material.dispose();
    this.beacon.material.map.dispose();
    this.beacon.material.dispose();
    this._triStrokeMesh.geometry.dispose();
    this._triStrokeMesh.material.dispose();
    this._triMesh.geometry.dispose();
    this._triMesh.material.dispose();
  }
}
