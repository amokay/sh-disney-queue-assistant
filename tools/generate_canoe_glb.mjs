import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数（沿用 alice-maze / shipwreck / pirates / tron 同款 API）
// ============================================================

function createBox(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = new Float32Array([
    -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z,
    -x, -y, -z,  -x,  y, -z,   x,  y, -z,   x, -y, -z,
    -x,  y, -z,  -x,  y,  z,   x,  y,  z,   x,  y, -z,
    -x, -y, -z,   x, -y, -z,   x, -y,  z,  -x, -y,  z,
     x, -y, -z,   x,  y, -z,   x,  y,  z,   x, -y,  z,
    -x, -y, -z,  -x, -y,  z,  -x,  y,  z,  -x,  y, -z,
  ]);
  const normals = new Float32Array([
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11,
    12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23,
  ]);
  return { positions, normals, indices };
}

function createCylinder(radiusTop, radiusBottom, height, segments = 12) {
  const positions = []; const normals = []; const indices = [];
  const h2 = height / 2;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const c = Math.cos(theta), s = Math.sin(theta);
    positions.push(radiusTop * c, h2, radiusTop * s);
    normals.push(c, 0, s);
    positions.push(radiusBottom * c, -h2, radiusBottom * s);
    normals.push(c, 0, s);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  let base = positions.length / 3;
  positions.push(0, h2, 0); normals.push(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusTop * Math.cos(theta), h2, radiusTop * Math.sin(theta));
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));
  base = positions.length / 3;
  positions.push(0, -h2, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusBottom * Math.cos(theta), -h2, radiusBottom * Math.sin(theta));
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

function createSphere(radius, segments = 8) {
  const positions = []; const normals = []; const indices = [];
  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat / segments) * Math.PI;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * Math.PI * 2;
      const x = Math.cos(phi) * sinT, y = cosT, z = Math.sin(phi) * sinT;
      positions.push(radius * x, radius * y, radius * z);
      normals.push(x, y, z);
    }
  }
  for (let lat = 0; lat < segments; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const first = lat * (segments + 1) + lon;
      const second = first + segments + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

function createTorus(majorR, minorR, majorSeg = 16, minorSeg = 6) {
  const positions = []; const normals = []; const indices = [];
  for (let i = 0; i <= majorSeg; i++) {
    const u = (i / majorSeg) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minorSeg; j++) {
      const v = (j / minorSeg) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      positions.push((majorR + minorR * cv) * cu, minorR * sv, (majorR + minorR * cv) * su);
      normals.push(cv * cu, sv, cv * su);
    }
  }
  const stride = minorSeg + 1;
  for (let i = 0; i < majorSeg; i++) {
    for (let j = 0; j < minorSeg; j++) {
      const a = i * stride + j, b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1), d = i * stride + (j + 1);
      indices.push(a, b, d); indices.push(b, c, d);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

function transformGeometry(geom, tx, ty, tz, rotY = 0, rotZ = 0, scale = 1, scaleY = null, scaleZ = null) {
  const sx = scale, sy = scaleY ?? scale, sz = scaleZ ?? scale;
  const positions = new Float32Array(geom.positions);
  const normals = new Float32Array(geom.normals);
  const cy = Math.cos(rotY), sy_ = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz_ = Math.sin(rotZ);
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i] * sx, y = positions[i + 1] * sy, z = positions[i + 2] * sz;
    let x1 = x * cz - y * sz_; let y1 = x * sz_ + y * cz; x = x1; y = y1;
    let x2 = x * cy + z * sy_; let z2 = -x * sy_ + z * cy; x = x2; z = z2;
    positions[i] = x + tx; positions[i + 1] = y + ty; positions[i + 2] = z + tz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    let x = normals[i], y = normals[i + 1], z = normals[i + 2];
    let x1 = x * cz - y * sz_; let y1 = x * sz_ + y * cz; x = x1; y = y1;
    let x2 = x * cy + z * sy_; let z2 = -x * sy_ + z * cy; x = x2; z = z2;
    const len = Math.hypot(x, y, z) || 1;
    normals[i] = x / len; normals[i + 1] = y / len; normals[i + 2] = z / len;
  }
  return { positions, normals, indices: new Uint16Array(geom.indices) };
}

function mergeGeometries(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) { vCount += g.positions.length / 3; iCount += g.indices.length; }
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const useUint32 = vCount > 65535;
  const indices = useUint32 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    positions.set(g.positions, vOff * 3);
    normals.set(g.normals, vOff * 3);
    for (let i = 0; i < g.indices.length; i++) indices[iOff + i] = g.indices[i] + vOff;
    vOff += g.positions.length / 3;
    iOff += g.indices.length;
  }
  return { positions, normals, indices };
}

function countTriangles(geom) { return geom.indices.length / 3; }

// ============================================================
// 创建 GLTF Document
// ============================================================

const doc = new Document();
const buffer = doc.createBuffer();

function createMaterial(name, baseColor, roughness, metalness, emissive = null) {
  const mat = doc.createMaterial(name)
    .setBaseColorFactor([...baseColor, 1.0])
    .setRoughnessFactor(roughness)
    .setMetallicFactor(metalness);
  if (emissive) mat.setEmissiveFactor(emissive);
  return mat;
}

// ---------- 探险家独木舟配色 ----------
const matDockPlank   = createMaterial('dock_plank',    [0.55, 0.40, 0.25], 0.9,  0.0, [0.26, 0.19, 0.11]);
const matDockPile    = createMaterial('dock_pile',     [0.30, 0.20, 0.10], 0.9,  0.0, [0.14, 0.09, 0.04]);
const matBoatHull    = createMaterial('boat_hull',     [0.40, 0.25, 0.12], 0.85, 0.0, [0.19, 0.11, 0.05]);
const matPaddle      = createMaterial('paddle_wood',   [0.50, 0.35, 0.18], 0.8,  0.0, [0.24, 0.16, 0.08]);
const matSkin        = createMaterial('skin',          [0.85, 0.70, 0.55], 0.7,  0.0, [0.40, 0.33, 0.26]);
const matVestOrange  = createMaterial('vest_orange',   [0.90, 0.45, 0.10], 0.7,  0.0, [0.45, 0.22, 0.04]);
const matVestYellow  = createMaterial('vest_yellow',   [0.95, 0.85, 0.20], 0.7,  0.0, [0.47, 0.42, 0.09]);
const matWater       = createMaterial('water',         [0.15, 0.45, 0.50], 0.5,  0.0, [0.07, 0.22, 0.24]);
const matGround      = createMaterial('ground',        [0.35, 0.28, 0.18], 0.9,  0.0, [0.16, 0.13, 0.08]);
const matBush        = createMaterial('bush_green',    [0.15, 0.38, 0.12], 0.9,  0.0, [0.07, 0.18, 0.05]);
const matRock        = createMaterial('rock_grey',     [0.40, 0.40, 0.38], 0.95, 0.0, [0.19, 0.19, 0.18]);

// ============================================================
// 几何分组
// ============================================================
const dockPlankGeoms = [];
const dockPileGeoms  = [];
const hullGeoms      = [];
const paddleGeoms    = [];
const skinGeoms      = [];
const vestOrangeGeoms= [];
const vestYellowGeoms= [];
const waterGeoms     = [];
const groundGeoms    = [];
const bushGeoms      = [];
const rockGeoms      = [];

// ============================================================
// 探险家独木舟 微缩场景
// 整体布局：码头位于 X 正方向（右侧），船停在码头左侧 (X 负方向)
// 船身沿 Z 轴（前后）展开，长向尺寸约 8 单位
// ============================================================

// ---------- 0. 底座（泥土/岩石椭圆平台）& 水面 ----------
// 椭圆通过 createCylinder + scale 实现
const groundCyl = createCylinder(7.5, 7.0, 0.6, 28);
groundGeoms.push(transformGeometry(groundCyl, 0, -0.3, 0, 0, 0, 1.0, 1.0, 1.5));

// 水面：略小且更扁的椭圆，蓝绿色
const waterCyl = createCylinder(6.2, 5.8, 0.15, 24);
waterGeoms.push(transformGeometry(waterCyl, -1.0, 0.05, 0, 0, 0, 1.0, 1.0, 1.45));

// ---------- 1. 码头 Dock ----------
// 码头位置：右侧（X 正方向），栈桥沿 Z 方向（与船平行）
const dockX = 2.6;       // 码头中心 X
const dockY = 0.55;      // 码头平面 Y
const dockLen = 6.0;     // Z 方向长度
const dockWid = 2.4;     // X 方向宽度

// 1.1 木板：4 条横向木板沿 Z 方向铺设，每条长度 = dockWid，宽度 = dockLen / 4
const plankCount = 4;
const plankLen = dockLen / plankCount;
for (let i = 0; i < plankCount; i++) {
  const pz = -dockLen / 2 + plankLen / 2 + i * plankLen;
  // 轻微高度差 + 纵深错位营造接缝感
  const yJitter = (i % 2 === 0 ? 0.0 : 0.04);
  dockPlankGeoms.push(transformGeometry(
    createBox(dockWid, 0.22, plankLen - 0.08),
    dockX, dockY + yJitter, pz
  ));
}

// 1.2 木板下方横梁（深色）撑住木板
for (let i = 0; i < 2; i++) {
  const bz = -dockLen / 2 + dockLen * (0.2 + i * 0.6);
  dockPileGeoms.push(transformGeometry(
    createBox(dockWid + 0.1, 0.18, 0.25),
    dockX, dockY - 0.18, bz
  ));
}

// 1.3 支撑木桩（圆柱木桩从水面插入平台下方支撑）— 6 根
const pilePositions = [
  [dockX - dockWid * 0.4, -dockLen * 0.4],
  [dockX + dockWid * 0.4, -dockLen * 0.4],
  [dockX - dockWid * 0.4,  0.0],
  [dockX + dockWid * 0.4,  0.0],
  [dockX - dockWid * 0.4,  dockLen * 0.4],
  [dockX + dockWid * 0.4,  dockLen * 0.4],
];
for (const [px, pz] of pilePositions) {
  dockPileGeoms.push(transformGeometry(
    createCylinder(0.18, 0.22, 1.6, 8),
    px, dockY - 0.5, pz
  ));
}

// 1.4 系船桩（短粗圆柱 3 个）— 沿码头靠船一侧（朝向 -X）
const bollardEdgeX = dockX - dockWid / 2 - 0.05;
const bollardZs = [-dockLen * 0.3, 0.0, dockLen * 0.3];
for (const bz of bollardZs) {
  // 桩主体
  dockPileGeoms.push(transformGeometry(
    createCylinder(0.18, 0.22, 0.7, 10),
    bollardEdgeX, dockY + 0.35, bz
  ));
  // 桩顶圆帽
  dockPileGeoms.push(transformGeometry(
    createSphere(0.22, 6),
    bollardEdgeX, dockY + 0.72, bz
  ));
}

// 1.5 码头外缘一圈薄沿（防滑边）
dockPlankGeoms.push(transformGeometry(
  createBox(0.15, 0.08, dockLen),
  dockX + dockWid / 2 - 0.05, dockY + 0.13, 0
));
dockPlankGeoms.push(transformGeometry(
  createBox(0.15, 0.08, dockLen),
  dockX - dockWid / 2 + 0.05, dockY + 0.13, 0
));

// ============================================================
// 2. 独木舟 Canoe / 龙舟形态
// 船中心：(boatX, boatY, 0)，船头朝 +Z（前进方向）
// 船身长 8 单位（Z），宽约 1.4（X），高约 0.7（Y）
// ============================================================
const boatX = -0.4;
const boatY = 0.55;
const boatLen = 8.0;
const boatWid = 1.4;
const boatHeight = 0.6;

// 2.1 船体：用多段梯形截面 + 前后收窄构造细长船形
// 沿 Z 方向切 11 段，每段为带宽度变化的 box（"中间宽-两端尖" 的纺锤形）
const hullSegments = 11;
for (let i = 0; i < hullSegments; i++) {
  const t = (i + 0.5) / hullSegments; // 0..1
  const z = -boatLen / 2 + t * boatLen;
  // 宽度沿位置变化：两端尖，中间宽（用 sin 包络）
  const widthFactor = Math.sin(t * Math.PI); // 0..1..0
  const segWid = boatWid * (0.18 + 0.82 * widthFactor);
  const segLen = boatLen / hullSegments * 1.02;
  // 截面 box：宽 = segWid，高 = boatHeight，深 = segLen
  hullGeoms.push(transformGeometry(
    createBox(segWid, boatHeight, segLen),
    boatX, boatY, z
  ));
  // 船底略凹的 V 型外观：底部斜向收窄（用一个底部偏窄的小 box）
  hullGeoms.push(transformGeometry(
    createBox(segWid * 0.55, boatHeight * 0.45, segLen),
    boatX, boatY - boatHeight * 0.45, z
  ));
}

// 2.2 船头/船尾尖（两端用 cylinder 收尖造型）
hullGeoms.push(transformGeometry(
  createCylinder(0.0, boatWid * 0.12, 0.8, 6),
  boatX, boatY, boatLen / 2 + 0.35,
  0, Math.PI / 2  // 让圆柱沿 Z 方向，顶端朝船头
));
hullGeoms.push(transformGeometry(
  createCylinder(0.0, boatWid * 0.12, 0.8, 6),
  boatX, boatY, -boatLen / 2 - 0.35,
  Math.PI, Math.PI / 2  // 反向尖端
));

// 2.3 船头微翘（小球作翘起装饰）
hullGeoms.push(transformGeometry(createSphere(0.18, 6), boatX, boatY + 0.18, boatLen / 2 + 0.55));
hullGeoms.push(transformGeometry(createSphere(0.16, 6), boatX, boatY + 0.15, -boatLen / 2 - 0.55));

// 2.4 船舷（两侧薄板边沿，比船体略高）
const gunwaleH = 0.18;
const gunwaleSegs = 9;
for (let i = 0; i < gunwaleSegs; i++) {
  const t = (i + 0.5) / gunwaleSegs;
  const z = -boatLen / 2 + 0.3 + t * (boatLen - 0.6);
  const widthFactor = Math.sin(t * Math.PI);
  const halfW = (boatWid * (0.18 + 0.82 * widthFactor)) / 2;
  // 左舷
  hullGeoms.push(transformGeometry(
    createBox(0.10, gunwaleH, (boatLen - 0.6) / gunwaleSegs * 1.05),
    boatX - halfW + 0.04, boatY + boatHeight / 2 + gunwaleH / 2, z
  ));
  // 右舷
  hullGeoms.push(transformGeometry(
    createBox(0.10, gunwaleH, (boatLen - 0.6) / gunwaleSegs * 1.05),
    boatX + halfW - 0.04, boatY + boatHeight / 2 + gunwaleH / 2, z
  ));
}

// 2.5 船内座板（4 排横向座板）
const seatCount = 4;
const seatZStart = -boatLen / 2 + 1.4;
const seatZEnd   =  boatLen / 2 - 1.4;
const seatStep = (seatZEnd - seatZStart) / (seatCount - 1);
for (let i = 0; i < seatCount; i++) {
  const sz = seatZStart + i * seatStep;
  hullGeoms.push(transformGeometry(
    createBox(boatWid * 0.85, 0.06, 0.35),
    boatX, boatY + boatHeight / 2 + 0.02, sz
  ));
}

// ============================================================
// 3. 划船人物 — 8 人，左右各 4
// 每人：球形头 + 圆柱躯干（救生衣）+ 两根圆柱手臂
// 人物面朝前进方向（+Z）
// ============================================================
const personRows = 4;
const rowZStart = -boatLen / 2 + 1.4;
const rowZEnd   =  boatLen / 2 - 1.4;
const rowStep = (rowZEnd - rowZStart) / (personRows - 1);
const sideOffsetX = boatWid * 0.22; // 左右人在船内的偏移

const personData = []; // {x, y, z, side, vestColor}

for (let row = 0; row < personRows; row++) {
  const pz = rowZStart + row * rowStep;
  for (const side of [-1, 1]) {
    const px = boatX + side * sideOffsetX;
    const py = boatY + boatHeight / 2 + 0.05; // 坐在座板上
    // 救生衣颜色：行交替 橙/黄
    const vestYellow = (row % 2 === 1);
    personData.push({ x: px, y: py, z: pz, side, vestYellow });
  }
}

for (const p of personData) {
  const vestList = p.vestYellow ? vestYellowGeoms : vestOrangeGeoms;
  // 躯干（圆柱体，救生衣）
  vestList.push(transformGeometry(
    createCylinder(0.18, 0.22, 0.55, 8),
    p.x, p.y + 0.27, p.z
  ));
  // 救生衣领口前片
  vestList.push(transformGeometry(
    createBox(0.36, 0.28, 0.05),
    p.x, p.y + 0.30, p.z + 0.20
  ));
  // 头部（球体）
  skinGeoms.push(transformGeometry(
    createSphere(0.16, 8),
    p.x, p.y + 0.65, p.z
  ));
  // 脖子（细圆柱）
  skinGeoms.push(transformGeometry(
    createCylinder(0.06, 0.07, 0.08, 6),
    p.x, p.y + 0.52, p.z
  ));
  // 两条手臂：从肩部伸向桨（外侧）
  // 桨握点位置（在船舷外侧）：
  const handDX = p.side * 0.55;
  const shoulderDX = p.side * 0.2;
  const armStartY = p.y + 0.42;
  const handY = p.y + 0.28;
  // 手臂：用一根斜置圆柱表示
  const armLen = Math.hypot(handDX - shoulderDX, armStartY - handY);
  const armAngleZ = Math.atan2(armStartY - handY, handDX - shoulderDX) - Math.PI / 2;
  // 默认 cylinder 沿 Y 轴，长度 armLen 后，绕 Z 轴旋转使其指向手部
  const armGeom = createCylinder(0.05, 0.05, armLen, 6);
  const armMidX = p.x + (shoulderDX + handDX) / 2;
  const armMidY = (armStartY + handY) / 2;
  // 前臂（伸向前方握桨）
  skinGeoms.push(transformGeometry(
    armGeom, armMidX, armMidY, p.z + 0.1, 0, armAngleZ
  ));
  // 第二根手臂（同侧，更靠后位置，营造划桨动作）
  skinGeoms.push(transformGeometry(
    createCylinder(0.05, 0.05, armLen * 0.95, 6),
    armMidX, armMidY, p.z - 0.05, 0, armAngleZ
  ));
}

// ============================================================
// 4. 船桨 — 每人一根，共 8 根，向外斜伸 ~30°
// 桨 = 长杆（圆柱）+ 末端扁椭圆桨叶
// ============================================================
for (const p of personData) {
  const tilt = 30 * Math.PI / 180;          // 桨向外倾斜 30°（绕 Z 轴）
  const paddleLen = 1.4;
  // 桨杆（默认竖向，旋转后向外侧倾斜）
  // 杆中心位置：从手部向外侧延伸
  const handX = p.x + p.side * 0.55;
  const handY = p.y + 0.32;
  const handZ = p.z + 0.08;
  // 杆方向：(p.side * sin(tilt), -cos(tilt), 0) — 向外向下
  const dirX = p.side * Math.sin(tilt);
  const dirY = -Math.cos(tilt);
  const shaftCenterX = handX + dirX * (paddleLen / 2);
  const shaftCenterY = handY + dirY * (paddleLen / 2);
  // 旋转角：默认 cylinder 沿 Y 轴；要倾斜 tilt 朝外，绕 Z 轴
  const rotZ = -p.side * tilt;
  paddleGeoms.push(transformGeometry(
    createCylinder(0.04, 0.04, paddleLen, 6),
    shaftCenterX, shaftCenterY, handZ, 0, rotZ
  ));
  // 桨叶（扁椭圆）— 在杆末端
  const bladeX = handX + dirX * paddleLen;
  const bladeY = handY + dirY * paddleLen;
  // 用 box 拍扁模拟桨叶（X 宽 0.32，Y 厚 0.04，Z 长 0.45）
  const bladeGeom = createBox(0.32, 0.05, 0.45);
  paddleGeoms.push(transformGeometry(
    bladeGeom, bladeX, bladeY, handZ, 0, rotZ
  ));
}

// ============================================================
// 5. 装饰 — 灌木 + 岩石
// ============================================================
// 码头边的绿色灌木球（3 处）
bushGeoms.push(transformGeometry(createSphere(0.6, 8), dockX + dockWid * 0.7,  0.55, -dockLen * 0.45));
bushGeoms.push(transformGeometry(createSphere(0.45, 7), dockX + dockWid * 0.85, 0.4,  -dockLen * 0.25));
bushGeoms.push(transformGeometry(createSphere(0.55, 8), dockX + dockWid * 0.65, 0.5,   dockLen * 0.45));
bushGeoms.push(transformGeometry(createSphere(0.4, 7),  dockX + dockWid * 0.85, 0.35,  dockLen * 0.30));
// 底座边缘一些小灌木点缀
bushGeoms.push(transformGeometry(createSphere(0.5, 7), -5.2, 0.35, -3.0));
bushGeoms.push(transformGeometry(createSphere(0.4, 6), -4.6, 0.30,  3.5));

// 灰色岩石（2 块）
rockGeoms.push(transformGeometry(createSphere(0.55, 6), -5.0, 0.25, -1.2, 0, 0, 1.0, 0.6, 1.2));
rockGeoms.push(transformGeometry(createSphere(0.38, 5), -4.4, 0.18,  1.8, 0, 0, 1.0, 0.55, 1.0));
rockGeoms.push(transformGeometry(createSphere(0.32, 5), dockX + dockWid * 0.6,  0.22, 0.0, 0, 0, 1.0, 0.55, 0.9));

// ============================================================
// 合并几何并构建 Primitive
// ============================================================
function makePrimitive(geoms, material) {
  const merged = mergeGeometries(geoms);
  const posAcc = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(merged.positions);
  const normAcc = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(merged.normals);
  const idxAcc = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(merged.indices);
  return doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setIndices(idxAcc)
    .setMaterial(material);
}

const prims = [
  { name: 'ground',       geoms: groundGeoms,      mat: matGround      },
  { name: 'water',        geoms: waterGeoms,       mat: matWater       },
  { name: 'dock_plank',   geoms: dockPlankGeoms,   mat: matDockPlank   },
  { name: 'dock_pile',    geoms: dockPileGeoms,    mat: matDockPile    },
  { name: 'boat_hull',    geoms: hullGeoms,        mat: matBoatHull    },
  { name: 'paddle',       geoms: paddleGeoms,      mat: matPaddle      },
  { name: 'skin',         geoms: skinGeoms,        mat: matSkin        },
  { name: 'vest_orange',  geoms: vestOrangeGeoms,  mat: matVestOrange  },
  { name: 'vest_yellow',  geoms: vestYellowGeoms,  mat: matVestYellow  },
  { name: 'bush',         geoms: bushGeoms,        mat: matBush        },
  { name: 'rock',         geoms: rockGeoms,        mat: matRock        },
];

const scene = doc.createScene('canoe_scene');
const stats = { totalTriangles: 0 };
for (const p of prims) {
  if (!p.geoms.length) continue;
  const prim = makePrimitive(p.geoms, p.mat);
  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode(p.name).setMesh(mesh);
  scene.addChild(node);
  const tris = p.geoms.reduce((s, g) => s + countTriangles(g), 0);
  stats[`${p.name}Triangles`] = tris;
  stats.totalTriangles += tris;
}
doc.getRoot().setDefaultScene(scene);

// ============================================================
// 导出 GLB
// ============================================================
const SOURCE_PATH    = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/source/landmarks/08_canoe.glb';
const OPTIMIZED_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/optimized/landmarks/08_canoe.glb';

const io = new NodeIO();
await io.write(SOURCE_PATH, doc);
await io.write(OPTIMIZED_PATH, doc);

const { statSync } = await import('fs');
const stat = statSync(SOURCE_PATH);
console.log('GLB generated:', SOURCE_PATH);
console.log('             :', OPTIMIZED_PATH);
console.log('File size    :', (stat.size / 1024).toFixed(1), 'KB');
console.log('Stats        :', JSON.stringify(stats, null, 2));
console.log('\nTriangle budget check:', stats.totalTriangles <= 6000 ? 'PASS' : 'OVER BUDGET!', `(${stats.totalTriangles}/6000)`);
writeFileSync(SOURCE_PATH.replace('.glb', '_info.json'), JSON.stringify({ ...stats, fileSizeBytes: stat.size }, null, 2));
