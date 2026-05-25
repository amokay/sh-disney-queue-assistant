import * as THREE from "three";

/** 与步行路径同一高度，供弧长中点标签等使用 */
export const ROUTE_TUBE_CENTER_Y = 1.5;

/* ── 园区边界裁剪参数（圆形） ── */
const PARK_CENTER_X = -13.88;
const PARK_CENTER_Z = -41.92;
const PARK_RADIUS = 47;

const WALK_ANIM_MS = 2800;
/** 管道半径（世界单位）；外径 ≈ 2 × 此值 */
const WALK_TUBE_RADIUS = 0.4;
const WALK_TUBE_RADIAL_SEGMENTS = 12;
/** 默认路线颜色（百度/高德 真实导航） */
const ROUTE_TUBE_COLOR = 0xff1a1a;
const ROUTE_TUBE_OPACITY = 0.7;
/** 直线兆底颜色（提示用户：暂未拿到真实路径） */
const ROUTE_TUBE_STRAIGHT_COLOR = 0xff9966;
const ROUTE_TUBE_STRAIGHT_OPACITY = 0.55;

const ARROW_SPACING = 2.35;
/** 精灵世界尺寸（始终面向相机） */
const ARROW_SPRITE_SIZE = 1.15;

/** @type {THREE.Texture | null} */
let arrowSpriteTexture = null;

function clipPointsToPark(points) {
  return points.map(p => {
    const dx = p.x - PARK_CENTER_X;
    const dz = p.z - PARK_CENTER_Z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= PARK_RADIUS) return p;
    const scale = PARK_RADIUS / dist;
    return new THREE.Vector3(
      PARK_CENTER_X + dx * scale,
      p.y,
      PARK_CENTER_Z + dz * scale
    );
  });
}

function densifySceneXZ(vecs, maxSegLen) {
  if (vecs.length < 2) return vecs;
  const out = [vecs[0].clone()];
  for (let i = 0; i < vecs.length - 1; i++) {
    const A = vecs[i];
    const B = vecs[i + 1];
    const len = A.distanceTo(B);
    const n = Math.max(1, Math.ceil(len / maxSegLen));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push(new THREE.Vector3().lerpVectors(A, B, t));
    }
    out.push(B.clone());
  }
  return out;
}

function buildWalkCenterCurve(vecs) {
  if (vecs.length < 2) return null;
  if (vecs.length === 2) return new THREE.LineCurve3(vecs[0], vecs[1]);
  return new THREE.CatmullRomCurve3(vecs, false, "centripetal", 0);
}

function tubularSegmentsForWalk(curve, controlPointCount) {
  if (curve instanceof THREE.LineCurve3) {
    const len = curve.v0.distanceTo(curve.v1);
    return Math.min(320, Math.max(24, Math.ceil(len / 1.2)));
  }
  return Math.min(640, Math.max(64, controlPointCount * 12));
}

function disposeLineGroup(group) {
  for (const ch of [...group.children]) {
    if (ch instanceof THREE.Group) {
      disposeLineGroup(ch);
    } else {
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) {
        if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose());
        else ch.material.dispose();
      }
    }
    group.remove(ch);
  }
}

function getArrowSpriteTexture() {
  if (arrowSpriteTexture) return arrowSpriteTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.12);
  ctx.lineTo(size * 0.88, size * 0.78);
  ctx.lineTo(size * 0.66, size * 0.78);
  ctx.lineTo(size * 0.5, size * 0.52);
  ctx.lineTo(size * 0.34, size * 0.78);
  ctx.lineTo(size * 0.12, size * 0.78);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  arrowSpriteTexture = tex;
  return tex;
}

/**
 * 沿曲线放置面向相机的白色箭头精灵（贴图旋转对齐路径切向）。
 * @returns {THREE.Group}
 */
function createArrowSpritesAlongCurve(curve, spacing = ARROW_SPACING) {
  const group = new THREE.Group();
  group.name = "WalkArrowSprites";
  const tex = getArrowSpriteTexture();
  const len = curve.getLength();
  const count = Math.max(3, Math.floor(len / spacing));

  for (let i = 0; i < count; i++) {
    const u = count > 1 ? i / (count - 1) : 0.5;
    const pos = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.scale.set(ARROW_SPRITE_SIZE, ARROW_SPRITE_SIZE, 1);
    sp.userData.tangent = tan.clone();
    sp.frustumCulled = false;
    group.add(sp);
  }
  return group;
}

function addSegmentArrowSprites(group, segments) {
  if (!segments?.length) return;
  for (const seg of segments) {
    if (!seg?.points?.length) continue;
    const raw = seg.points.map((p) => new THREE.Vector3(p.x, ROUTE_TUBE_CENTER_Y, p.z));
    const vecs = densifySceneXZ(raw, 1.8);
    const tempCurve = buildWalkCenterCurve(vecs);
    if (!tempCurve) continue;
    // 裁剪到园区边界
    const sampleCount = Math.max(64, vecs.length * 6);
    const sampled = tempCurve.getPoints(sampleCount);
    const clipped = clipPointsToPark(sampled);
    const curve = clipped.length === 2
      ? new THREE.LineCurve3(clipped[0], clipped[1])
      : new THREE.CatmullRomCurve3(clipped, false, "centripetal", 0.5);
    const sub = createArrowSpritesAlongCurve(curve, 12);
    group.add(sub);
  }
}

/* ── 园区静态路网（白色道路）参数 ── */
const PARK_ROAD_COLOR = 0xffffff;
const PARK_ROAD_OPACITY = 0.88;
const PARK_ROAD_TUBE_RADIUS = 0.45;
const PARK_ROAD_TUBE_RADIAL_SEGMENTS = 10;
const PARK_ROAD_Y = 0.8;

/**
 * 路线预览（智能规划）与花车巡游折线。
 */
export class LineOverlays {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.route = new THREE.Group();
    this.route.name = "RoutePreview";
    this.parade = new THREE.Group();
    this.parade.name = "ParadeRoute";
    this.parade.visible = false;
    /** 园区固定路网（白色道路），常驻显示，不会被路线预览清空 */
    this.parkRoads = new THREE.Group();
    this.parkRoads.name = "ParkRoads";
    scene.add(this.parkRoads);
    scene.add(this.route);
    scene.add(this.parade);
    /** @type {THREE.Mesh | null} */
    this._walkTube = null;
    /** @type {THREE.Group | null} */
    this._walkArrows = null;
    /** @type {THREE.Camera | null} */
    this._camera = null;
    /** @type {null | { start: number, durationMs: number, indexCount: number }} */
    this._anim = null;
  }

  /**
   * 加载并渲染园区固定路网（白色管道，贴近地面）。
   * @param {Array<{ id?: string, points: Array<{ x: number, y?: number, z: number }> }>} roads
   */
  setParkRoads(roads) {
    disposeLineGroup(this.parkRoads);
    if (!roads?.length) return;

    for (const road of roads) {
      const pts = road?.points;
      if (!Array.isArray(pts) || pts.length < 2) continue;

      const raw = pts.map((p) => new THREE.Vector3(p.x, PARK_ROAD_Y, p.z));
      const vecs = densifySceneXZ(raw, 1.8);
      const tempCurve = buildWalkCenterCurve(vecs);
      if (!tempCurve) continue;

      // 边界裁剪
      const sampleCount = Math.max(48, vecs.length * 4);
      const sampled = tempCurve.getPoints(sampleCount).map(
        (v) => new THREE.Vector3(v.x, PARK_ROAD_Y, v.z)
      );
      const clipped = clipPointsToPark(sampled);
      if (clipped.length < 2) continue;

      const curve = clipped.length === 2
        ? new THREE.LineCurve3(clipped[0], clipped[1])
        : new THREE.CatmullRomCurve3(clipped, false, "centripetal", 0.5);

      const tubularSegments = curve instanceof THREE.LineCurve3
        ? Math.min(160, Math.max(12, Math.ceil(curve.v0.distanceTo(curve.v1) / 1.5)))
        : Math.min(480, Math.max(48, clipped.length * 8));

      const geom = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        PARK_ROAD_TUBE_RADIUS,
        PARK_ROAD_TUBE_RADIAL_SEGMENTS,
        false
      );
      const mat = new THREE.MeshBasicMaterial({
        color: PARK_ROAD_COLOR,
        transparent: true,
        opacity: PARK_ROAD_OPACITY,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      mesh.name = `park-road:${road.id || ""}`;
      // 渲染顺序：高于地面但低于导航路线，确保路网始终可见
      mesh.renderOrder = 2;
      this.parkRoads.add(mesh);
    }
  }

  /** @param {THREE.Camera} camera */
  setCamera(camera) {
    this._camera = camera;
  }

  /** @deprecated Line2 已移除，保留空实现避免 main 报错 */
  setRouteLineResolution() {}

  tick() {
    if (this._walkArrows) {
      this._walkArrows.traverse((ch) => {
        if (!(ch instanceof THREE.Sprite)) return;
        const tan = ch.userData.tangent;
        if (!tan) return;
        ch.material.rotation = Math.atan2(tan.x, tan.z) + Math.PI;
      });
    }

    if (!this._anim || !this._walkTube?.geometry) return;
    const now = performance.now();
    const t = Math.min(1, (now - this._anim.start) / this._anim.durationMs);
    const eased = 1 - (1 - t) ** 2;
    const total = this._anim.indexCount;
    this._walkTube.geometry.setDrawRange(0, Math.max(3, Math.floor(total * eased)));
    if (t >= 1) {
      this._walkTube.geometry.setDrawRange(0, Infinity);
      if (this._walkArrows) this._walkArrows.visible = true;
      this._anim = null;
    }
  }

  /** @param {Array<{ position: { x: number, y: number, z: number } }>} ordered */
  setRoutePreview(ordered) {
    this._clearWalkState();
    disposeLineGroup(this.route);
    if (!ordered?.length) return;

    const yLift = 0.8;
    const pts = ordered.map(
      (o) => new THREE.Vector3(o.position.x, yLift + (o.position.y || 0), o.position.z)
    );
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166 });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    this.route.add(line);
  }

  /**
   * @param {Array<{ x: number, y?: number, z: number }>} points
   * @param {{ animate?: boolean, segments?: Array<{ points: unknown[] }>, provider?: string }} [opts]
   */
  setDenseWalkRoute(points, opts = {}) {
    this._clearWalkState();
    disposeLineGroup(this.route);
    if (!points?.length) return;

    const raw = points.map((p) => new THREE.Vector3(p.x, ROUTE_TUBE_CENTER_Y, p.z));
    const vecs = densifySceneXZ(raw, 1.8);
    const tempCurve = buildWalkCenterCurve(vecs);
    if (!tempCurve) return;

    // 从曲线采样密集点并裁剪到园区边界
    const sampleCount = Math.max(64, vecs.length * 6);
    const sampled = tempCurve.getPoints(sampleCount);
    const clipped = clipPointsToPark(sampled);
    const curve = clipped.length === 2
      ? new THREE.LineCurve3(clipped[0], clipped[1])
      : new THREE.CatmullRomCurve3(clipped, false, "centripetal", 0.5);

    const tubularSegments = tubularSegmentsForWalk(curve, clipped.length);
    const geom = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      WALK_TUBE_RADIUS,
      WALK_TUBE_RADIAL_SEGMENTS,
      false
    );
    const isStraight = opts.provider === "straight";
    const mat = new THREE.MeshBasicMaterial({
      color: isStraight ? ROUTE_TUBE_STRAIGHT_COLOR : ROUTE_TUBE_COLOR,
      transparent: true,
      opacity: isStraight ? ROUTE_TUBE_STRAIGHT_OPACITY : ROUTE_TUBE_OPACITY,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    mesh.name = "WalkTube";
    this.route.add(mesh);
    this._walkTube = mesh;

    const arrows = new THREE.Group();
    arrows.name = "WalkArrows";
    addSegmentArrowSprites(arrows, opts.segments);
    if (!arrows.children.length) {
      arrows.add(createArrowSpritesAlongCurve(curve, ARROW_SPACING));
    }
    arrows.visible = !opts.animate;
    this.route.add(arrows);
    this._walkArrows = arrows;

    if (opts.animate && geom.index) {
      const indexCount = geom.index.count;
      geom.setDrawRange(0, 0);
      this._anim = { start: performance.now(), durationMs: WALK_ANIM_MS, indexCount };
    }
  }

  _clearWalkState() {
    this._walkTube = null;
    this._walkArrows = null;
    this._anim = null;
  }

  clearRoutePreview() {
    this._clearWalkState();
    disposeLineGroup(this.route);
  }

  /** @param {Array<{ x: number, y?: number, z: number }>} points */
  setParadePolyline(points) {
    disposeLineGroup(this.parade);
    if (!points?.length) return;

    const pts = points.map((p) => new THREE.Vector3(p.x, (p.y ?? 0.4) + 0.05, p.z));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xff66dd });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    this.parade.add(line);
  }

  setParadeVisible(v) {
    this.parade.visible = Boolean(v);
  }
}
