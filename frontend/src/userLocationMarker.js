import * as THREE from "three";

/**
 * 地图上展示当前 LBS 位置，整体水平贴地，由三层组成：
 *
 *   groundCircle  — 实心蓝色圆（主体，R=1.2）
 *   groundBorder  — 白色描边环（紧包在圆外，内径 1.2 外径 1.5）
 *   pulseRing     — 脉冲动画环（呼吸效果，内径 1.5 外径 2.4）
 *   arrowYaw      — 水平贴地几何三角形（ShapeGeometry），指向下一景点
 *
 * 公开 API：setPosition / setTarget / clearTarget / setVisible / hide / tick / dispose
 */
export class UserLocationMarker {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "UserLBS";
    this.group.renderOrder = 999;

    // ── 主体实心圆 (R=1.2, Y=1.5) ────────────────────────────
    this.groundCircle = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 64),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.groundCircle.rotation.x = -Math.PI / 2;
    this.groundCircle.position.y = 1.5;
    this.groundCircle.renderOrder = 999;

    // ── 白色描边圆环 (内径 1.2 外径 1.5, Y=1.52) ──────────────
    this.groundBorder = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.groundBorder.rotation.x = -Math.PI / 2;
    this.groundBorder.position.y = 1.52; // 高于圆面 0.02 防 z-fighting
    this.groundBorder.renderOrder = 999;

    // ── 脉冲环 (内径 1.5 外径 2.4, Y=1.48) ────────────────────
    this.pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.4, 48),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 1.48;
    this.pulseRing.renderOrder = 998;

    // ── 水平贴地几何三角箭头 ──────────────────────────────────
    //
    // 在 XY 平面绘制 Shape；rotation.x = -π/2 后，几何 +Y → 世界 +Z。
    // 朝向公式：arrowYaw.rotation.y = atan2(dx, dz) → 尖端精确指向目标。
    //
    //   R = 1.2，缩小后约为初版的一半
    //   baseY = 1.5（底边距圆心），tipY = 2.6（尖端），halfBase = 0.7
    const baseY    = 1.5;   // 三角底边距圆心
    const tipY     = 2.6;   // 尖端距圆心
    const halfBase = 0.7;   // 底边半宽

    // 白色描边三角（略大，垫在蓝色三角正下方制造描边效果）
    const strokeShape = new THREE.Shape();
    strokeShape.moveTo(0,                 tipY  + 0.12);
    strokeShape.lineTo(-(halfBase + 0.15), baseY - 0.12);
    strokeShape.lineTo( (halfBase + 0.15), baseY - 0.12);
    strokeShape.closePath();
    this._triStrokeMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(strokeShape),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    this._triStrokeMesh.rotation.x = -Math.PI / 2;
    this._triStrokeMesh.position.y = -0.001; // 略低于填充层
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
    // position.y = 0 相对于 arrowYaw

    // 外层 Group 负责 yaw（rotation.y），内层 Mesh 负责水平翻转
    this.arrowYaw = new THREE.Group();
    this.arrowYaw.position.y = 1.55; // 略高于 groundCircle(1.5)
    this.arrowYaw.renderOrder = 999;
    this.arrowYaw.add(this._triStrokeMesh, this._triMesh);
    this.arrowYaw.visible = false;   // 默认隐藏，setTarget 后按需显示

    this.group.add(this.groundCircle, this.groundBorder, this.pulseRing, this.arrowYaw);
    this.group.visible = false;
    scene.add(this.group);

    /** 当前用户场景坐标（由 setPosition 维护） */
    this._ux = 0;
    this._uz = 0;
    /** 目标景点场景坐标 @type {{ x: number, z: number } | null} */
    this._target = null;

    this._pulseT = 0;
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
   * 距离 < 1.5 场景单位时隐藏箭头，避免抖动（适配缩小后的几何尺寸）。
   */
  _updateArrowYaw() {
    if (!this._target || !this.group.visible) {
      this.arrowYaw.visible = false;
      return;
    }
    const dx   = this._target.x - this._ux;
    const dz   = this._target.z - this._uz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1.5) {
      this.arrowYaw.visible = false;
      return;
    }
    // rotation.y = 0 时尖端朝 +Z；atan2(dx, dz) 将其旋转至目标方向
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
    this._pulseT += 0.04;
    const s = 1 + Math.sin(this._pulseT) * 0.12;
    this.pulseRing.scale.set(s, s, 1);
  }

  // ── 销毁 ─────────────────────────────────────────────────────

  dispose() {
    this.scene.remove(this.group);
    this.groundCircle.geometry.dispose();
    this.groundCircle.material.dispose();
    this.groundBorder.geometry.dispose();
    this.groundBorder.material.dispose();
    this.pulseRing.geometry.dispose();
    this.pulseRing.material.dispose();
    this._triStrokeMesh.geometry.dispose();
    this._triStrokeMesh.material.dispose();
    this._triMesh.geometry.dispose();
    this._triMesh.material.dispose();
  }
}
