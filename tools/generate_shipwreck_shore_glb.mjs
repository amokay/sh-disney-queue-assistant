import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数（沿用 carousel / pirates / tron 同款 API）
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
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ]);
  return { positions, normals, indices };
}

function createCylinder(radiusTop, radiusBottom, height, segments = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  const h2 = height / 2;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
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
  positions.push(0, h2, 0);
  normals.push(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusTop * Math.cos(theta), h2, radiusTop * Math.sin(theta));
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));
  }
  base = positions.length / 3;
  positions.push(0, -h2, 0);
  normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusBottom * Math.cos(theta), -h2, radiusBottom * Math.sin(theta));
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

function createCone(radius, height, segments = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  const h2 = height / 2;
  const slant = Math.sqrt(radius * radius + height * height);
  const ny = radius / slant;
  const nr = height / slant;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    positions.push(0, h2, 0);
    normals.push(c * nr, ny, s * nr);
    positions.push(radius * c, -h2, radius * s);
    normals.push(c * nr, ny, s * nr);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2;
    indices.push(a, c, b);
  }
  const base = positions.length / 3;
  positions.push(0, -h2, 0);
  normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radius * Math.cos(theta), -h2, radius * Math.sin(theta));
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

function createSphere(radius, segments = 8) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat / segments) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const x = cosP * sinT;
      const y = cosT;
      const z = sinP * sinT;
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
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= majorSeg; i++) {
    const u = (i / majorSeg) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= minorSeg; j++) {
      const v = (j / minorSeg) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const x = (majorR + minorR * cv) * cu;
      const y = minorR * sv;
      const z = (majorR + minorR * cv) * su;
      positions.push(x, y, z);
      normals.push(cv * cu, sv, cv * su);
    }
  }
  const stride = minorSeg + 1;
  for (let i = 0; i < majorSeg; i++) {
    for (let j = 0; j < minorSeg; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
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

// ---------- 海盗船配色（深棕船体 / 米白船帆 / 黑旗 / 金色装饰） ----------
// 全部 metalness=0，靠 emissive 自发光使颜色在无环境贴图场景里依旧鲜明
const matHullDark   = createMaterial('hull_dark_oak',  [0.05, 0.05, 0.05], 0.55, 0.0, [0.02, 0.02, 0.02]);
const matHullPlank  = createMaterial('hull_plank',     [0.05, 0.05, 0.05], 0.50, 0.0, [0.02, 0.02, 0.02]);
const matDeckWood   = createMaterial('deck_wood',      [0.62, 0.46, 0.28], 0.45, 0.0, [0.18, 0.12, 0.06]);
const matMastWood   = createMaterial('mast_wood',      [0.40, 0.26, 0.14], 0.50, 0.0, [0.12, 0.07, 0.03]);
const matSail       = createMaterial('sail_canvas',    [0.05, 0.05, 0.05], 0.70, 0.0, [0.02, 0.02, 0.02]);
const matFlagBlack  = createMaterial('flag_black',     [0.06, 0.06, 0.06], 0.55, 0.0, [0.02, 0.02, 0.02]);
const matSkullWhite = createMaterial('skull_bone',     [0.96, 0.94, 0.88], 0.40, 0.0, [0.40, 0.38, 0.32]);
const matGold       = createMaterial('trim_gold',      [0.92, 0.74, 0.22], 0.30, 0.0, [0.38, 0.26, 0.06]);
const matRope       = createMaterial('rigging_rope',   [0.55, 0.42, 0.26], 0.65, 0.0, [0.16, 0.12, 0.06]);
const matCannon     = createMaterial('cannon_iron',    [0.18, 0.18, 0.18], 0.40, 0.0, [0.04, 0.04, 0.04]);
const matRedAccent  = createMaterial('hull_red_band',  [0.62, 0.16, 0.12], 0.45, 0.0, [0.22, 0.04, 0.03]);

// ============================================================
// 几何分组（每组对应一种材质 → 一个 primitive）
// ============================================================
const hullDarkGeoms  = [];
const hullPlankGeoms = [];
const deckGeoms      = [];
const mastGeoms      = [];
const sailGeoms      = [];
const flagGeoms      = [];
const skullGeoms     = [];
const goldGeoms      = [];
const ropeGeoms      = [];
const cannonGeoms    = [];
const redGeoms       = [];

// ============================================================
// 海盗船设计（沿 X 轴方向，+X = 船首 bow，-X = 船尾 stern）
// 单位为本地几何单位（最终通过 model_transforms.scale 缩放到场景）
// ============================================================

// ---------- 1. 下层船壳 Lower Hull（深棕橡木，分层收窄做出龙骨弧线） ----------
// 思路：沿 X 方向用多段「梯形板」叠出弧形船底；末端用 cone 收口做尖船首。
const hullSlabs = [
  // [xStart, xEnd, halfWidthStart, halfWidthEnd, yCenter, height]
  { xs: -10, xe:  10, ws: 3.4,  we: 3.4,  y: -1.6, h: 0.7 }, // 龙骨底层
  { xs: -11, xe:  11, ws: 3.7,  we: 3.7,  y: -0.95, h: 0.7 },
  { xs: -12, xe:  12, ws: 3.85, we: 3.85, y: -0.30, h: 0.7 },
  { xs: -13, xe:  13, ws: 3.95, we: 3.95, y:  0.40, h: 0.7 }, // 顶层（甲板下沿）
];
for (const s of hullSlabs) {
  const len = s.xe - s.xs;
  const cx = (s.xe + s.xs) / 2;
  hullDarkGeoms.push(transformGeometry(createBox(len, s.h, s.ws * 2), cx, s.y, 0));
}

// 船首尖端（bow）—— 用一个绕 Z 轴旋转的圆锥指向 +X，做出尖锐的劈水船头
hullDarkGeoms.push(transformGeometry(
  createCone(2.0, 4.0, 8), // 半径 2，长度 4
  14.5, -0.5, 0,
  0,                    // rotY
  -Math.PI / 2,         // rotZ：让 cone 顶端指向 +X
  1, 1, 1,
));
// 船首龙骨竖直加固板
hullDarkGeoms.push(transformGeometry(createBox(3.0, 1.6, 0.6), 14.0, 0.0, 0));

// 船尾（stern）方形包板：海盗船经典平船尾
hullDarkGeoms.push(transformGeometry(createBox(1.4, 3.4, 7.6), -13.4, 0.5, 0));
// 船尾上方装饰外飘檐板（多层木板）
hullPlankGeoms.push(transformGeometry(createBox(1.0, 0.4, 8.4), -13.5, 1.6, 0));
hullPlankGeoms.push(transformGeometry(createBox(0.8, 0.3, 8.0), -13.6, 2.1, 0));

// 船舷上方第二层木板（deeper-tone plank）：在主船体上加金黄色装饰带
hullPlankGeoms.push(transformGeometry(createBox(26.0, 0.55, 8.10), 0.0, 0.95, 0));

// 中部红色饰带（视觉层次）
redGeoms.push(transformGeometry(createBox(24.5, 0.18, 8.18), 0.0, 0.55, 0));
redGeoms.push(transformGeometry(createBox(24.5, 0.18, 8.18), 0.0, 1.20, 0));

// ---------- 2. 主甲板 Main Deck（柚木色） ----------
deckGeoms.push(transformGeometry(createBox(26.5, 0.20, 7.5), 0.0, 1.40, 0));
// 甲板木板纹理感：横向几条窄板
for (let i = 0; i < 6; i++) {
  const px = -10 + i * 4.0;
  goldGeoms.push(transformGeometry(createBox(0.10, 0.06, 7.4), px, 1.51, 0));
}

// ---------- 3. 船首楼 Forecastle（船头抬高一层小甲板） ----------
deckGeoms.push(transformGeometry(createBox(5.5, 0.25, 7.4), 10.5, 2.50, 0));
hullDarkGeoms.push(transformGeometry(createBox(5.5, 1.05, 0.30), 10.5, 1.95, 3.55));   // 前侧栏底
hullDarkGeoms.push(transformGeometry(createBox(5.5, 1.05, 0.30), 10.5, 1.95, -3.55));
hullDarkGeoms.push(transformGeometry(createBox(0.30, 1.05, 7.4), 13.25, 1.95, 0));     // 前端围板

// ---------- 4. 船尾楼 Quarterdeck & 船长室 Cabin ----------
// 抬高的后甲板
deckGeoms.push(transformGeometry(createBox(7.0, 0.25, 7.4), -10.0, 2.50, 0));
// 船长室主体
hullDarkGeoms.push(transformGeometry(createBox(5.6, 2.60, 6.4), -10.5, 3.92, 0));
// 屋顶（柚木色斜板，用稍扁的 box + 微旋转模拟）
deckGeoms.push(transformGeometry(createBox(6.2, 0.30, 6.8), -10.5, 5.32, 0));
// 屋顶金色脊
goldGeoms.push(transformGeometry(createBox(5.8, 0.18, 0.18), -10.5, 5.55, 0));
// 船长室窗户（金色方框 + 黑色玻璃）
for (const z of [-2.0, 0, 2.0]) {
  goldGeoms.push(transformGeometry(createBox(0.10, 0.90, 0.90), -7.70, 4.20, z));
  flagGeoms.push(transformGeometry(createBox(0.05, 0.70, 0.70), -7.65, 4.20, z));
}
// 船尾雕花（金色装饰条）
for (let i = 0; i < 3; i++) {
  goldGeoms.push(transformGeometry(createBox(0.10, 0.08, 6.6), -13.20, 2.80 + i * 0.50, 0));
}
// 船尾金色花饰球
goldGeoms.push(transformGeometry(createSphere(0.32, 6), -13.4, 5.55, 0));

// ---------- 5. 船首装饰雕刻 Figurehead（金色） ----------
// 龙骨延伸出的金色女神/海妖雕像（用 sphere + cone 简化）
goldGeoms.push(transformGeometry(createSphere(0.55, 6), 16.6, 0.40, 0));      // 头
goldGeoms.push(transformGeometry(createCone(0.45, 1.2, 8), 16.0, -0.30, 0, 0, -Math.PI / 2)); // 身体
goldGeoms.push(transformGeometry(createBox(1.4, 0.18, 0.10), 15.9, 0.40, 0)); // 双臂
goldGeoms.push(transformGeometry(createSphere(0.18, 5), 16.85, 0.95, 0));     // 小皇冠尖顶

// ---------- 6. 船舷栏杆 Railings（沿主甲板四周） ----------
// 长边围栏（左右两侧）
for (const z of [3.65, -3.65]) {
  // 顶部扶手
  hullPlankGeoms.push(transformGeometry(createBox(20.0, 0.10, 0.18), 0, 2.05, z));
  // 立柱
  for (let i = -9; i <= 9; i += 2) {
    if (i >= 7 || i <= -7) continue; // 让位给 forecastle / quarterdeck
    hullPlankGeoms.push(transformGeometry(createBox(0.18, 0.55, 0.18), i, 1.78, z));
  }
}
// 主甲板与船首楼之间的台阶护栏（金色横杆）
goldGeoms.push(transformGeometry(createBox(0.10, 0.10, 7.0), 7.6, 2.10, 0));
goldGeoms.push(transformGeometry(createBox(0.10, 0.10, 7.0), -6.4, 2.10, 0));

// ---------- 7. 三根桅杆 Masts ----------
// 桅杆 X 位置 / 总高 / 半径 / yardarm 信息
const masts = [
  { name: 'fore',  x:  9.0, height: 16.0, radius: 0.30, yards: [{ y: 7.0, len: 8.5, sailH: 4.5 }, { y: 11.5, len: 6.5, sailH: 3.5 }] },
  { name: 'main',  x:  0.0, height: 20.0, radius: 0.36, yards: [{ y: 8.0, len: 10.0, sailH: 5.0 }, { y: 13.0, len: 8.0, sailH: 4.2 }, { y: 17.0, len: 5.5, sailH: 3.0 }] },
  { name: 'mizzen', x: -8.5, height: 14.5, radius: 0.26, yards: [{ y: 6.5, len: 7.0, sailH: 4.0 }, { y: 10.5, len: 5.5, sailH: 3.2 }] },
];

for (const m of masts) {
  const baseY = 1.55; // 主甲板顶面
  const topY = baseY + m.height;
  // 桅杆主柱
  mastGeoms.push(transformGeometry(createCylinder(m.radius * 0.8, m.radius, m.height, 10), m.x, baseY + m.height / 2, 0));
  // 桅杆顶端小球
  goldGeoms.push(transformGeometry(createSphere(m.radius * 1.4, 5), m.x, topY + 0.15, 0));
  // 桅杆基座金色环
  goldGeoms.push(transformGeometry(createTorus(m.radius * 1.5, 0.10, 12, 4), m.x, baseY + 0.20, 0));

  // Yardarms（横帆杆）+ 帆
  for (const y of m.yards) {
    const yardY = baseY + y.y;
    // 横杆（沿 Z 方向横向）
    mastGeoms.push(transformGeometry(createCylinder(0.10, 0.10, y.len, 6), m.x, yardY, 0, Math.PI / 2));
    // 风帆：略弯曲的弧形帆，用一块薄 box 作为基础 + 两块梯形侧片
    const sailY = yardY - y.sailH / 2;
    sailGeoms.push(transformGeometry(createBox(0.12, y.sailH, y.len * 0.92), m.x, sailY, 0));
    // 帆底部稍微向风方向凸起：再叠一层略偏的薄 box
    sailGeoms.push(transformGeometry(createBox(0.30, y.sailH * 0.85, y.len * 0.78), m.x + 0.18, sailY + 0.05, 0));
    // 帆顶帆底金色绳带
    goldGeoms.push(transformGeometry(createBox(0.16, 0.06, y.len * 0.92), m.x, yardY - 0.05, 0));
    goldGeoms.push(transformGeometry(createBox(0.16, 0.06, y.len * 0.92), m.x, yardY - y.sailH + 0.05, 0));
  }

  // 张帆斜索（rigging）：从甲板到 yardarm 端点拉斜绳
  for (const y of m.yards) {
    const yardY = baseY + y.y;
    const half = y.len / 2;
    for (const sign of [-1, 1]) {
      // 简化：用一根细圆柱从 yardarm 端点连到甲板边缘
      const dx = 0;
      const dz = sign * half;
      const ex = m.x + dx;
      const ez = dz;
      const sx = m.x;
      const sz = sign * 3.5;
      const midX = (ex + sx) / 2;
      const midZ = (ez + sz) / 2;
      const midY = (yardY + 1.55) / 2;
      const dx2 = ex - sx, dy2 = yardY - 1.55, dz2 = ez - sz;
      const len = Math.hypot(dx2, dy2, dz2);
      // 角度：先绕 Z 旋转将垂直 cylinder 倾斜到 dy/dxz 比例，然后绕 Y 旋转到 xz 平面方向
      const horiz = Math.hypot(dx2, dz2);
      const tilt = Math.atan2(horiz, dy2);
      const yaw = Math.atan2(dx2, dz2);
      ropeGeoms.push(transformGeometry(
        createCylinder(0.05, 0.05, len, 4),
        midX, midY, midZ,
        yaw, tilt,
      ));
    }
  }
}

// ---------- 8. 主桅瞭望台 Crow's Nest ----------
const crowY = 1.55 + 17.5; // 主桅靠上位置
mastGeoms.push(transformGeometry(createCylinder(0.95, 0.95, 0.30, 12), 0, crowY, 0));
hullDarkGeoms.push(transformGeometry(createTorus(0.90, 0.12, 12, 4), 0, crowY + 0.20, 0));
// 瞭望台 4 根小立柱
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  hullDarkGeoms.push(transformGeometry(createBox(0.10, 0.45, 0.10), Math.cos(a) * 0.85, crowY + 0.40, Math.sin(a) * 0.85));
}

// ---------- 9. 主桅顶骷髅旗 Skull Flag ----------
const flagPoleY = 1.55 + 20.0;
const flagY = flagPoleY + 0.5;
// 旗子主体（黑色矩形薄板）
flagGeoms.push(transformGeometry(createBox(0.08, 1.6, 2.4), 0, flagY, 1.4));
// 骷髅头（白色球）
skullGeoms.push(transformGeometry(createSphere(0.32, 7), 0.06, flagY + 0.20, 1.30));
// 骷髅眼眶（黑色小立方）
flagGeoms.push(transformGeometry(createBox(0.05, 0.10, 0.12), 0.10, flagY + 0.27, 1.18));
flagGeoms.push(transformGeometry(createBox(0.05, 0.10, 0.12), 0.10, flagY + 0.27, 1.42));
// 交叉骨（两根白色细杆）
skullGeoms.push(transformGeometry(createCylinder(0.06, 0.06, 1.2, 5), 0.06, flagY - 0.30, 1.30, 0, Math.PI / 4));
skullGeoms.push(transformGeometry(createCylinder(0.06, 0.06, 1.2, 5), 0.06, flagY - 0.30, 1.30, 0, -Math.PI / 4));
// 桅杆顶尖（继续向上一截）
mastGeoms.push(transformGeometry(createCylinder(0.10, 0.10, 1.2, 6), 0, flagPoleY + 0.6, 0));

// ---------- 10. 船首斜桁 Bowsprit + Jib 三角帆 ----------
mastGeoms.push(transformGeometry(
  createCylinder(0.18, 0.28, 6.0, 8),
  17.0, 1.20, 0,
  0,
  Math.PI / 2 - 0.20,  // 略微抬头
));
// 三角帆（用细长薄 box 模拟）
sailGeoms.push(transformGeometry(createBox(0.10, 2.6, 3.4), 16.4, 2.30, 0, 0, -0.35));

// ---------- 11. 船舵 Helm Wheel（船尾楼前甲板上） ----------
const wheelX = -7.0, wheelY = 3.30;
// 舵柱
mastGeoms.push(transformGeometry(createBox(0.30, 1.40, 0.30), wheelX, wheelY - 0.30, 0));
// 舵轮（torus，沿 Z 轴朝向）
goldGeoms.push(transformGeometry(createTorus(0.55, 0.08, 16, 5), wheelX, wheelY, 0, Math.PI / 2));
// 舵轮内圈
goldGeoms.push(transformGeometry(createTorus(0.32, 0.05, 12, 4), wheelX, wheelY, 0, Math.PI / 2));
// 8 根辐条
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  // 内端到外端把手
  goldGeoms.push(transformGeometry(createBox(0.06, 0.06, 0.50), wheelX, wheelY + Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0, a));
  // 外侧握柄突出
  goldGeoms.push(transformGeometry(createCylinder(0.07, 0.07, 0.22, 5), wheelX - 0.0, wheelY + Math.sin(a) * 0.65, Math.cos(a) * 0.65));
}

// ---------- 12. 大炮 Cannons（船舷两侧 ×6） ----------
const cannonXs = [-4.0, 0.0, 4.0];
for (const cx of cannonXs) {
  for (const sign of [-1, 1]) {
    const cz = sign * 3.85;
    // 炮筒
    cannonGeoms.push(transformGeometry(
      createCylinder(0.18, 0.22, 1.6, 8),
      cx, 1.35, cz,
      0,
      Math.PI / 2,  // 让炮筒朝向 ±Z
    ));
    // 炮口黑圈
    cannonGeoms.push(transformGeometry(createTorus(0.20, 0.04, 8, 4), cx, 1.35, cz + sign * 0.82, 0, Math.PI / 2));
    // 炮架（深棕木）
    hullDarkGeoms.push(transformGeometry(createBox(0.55, 0.30, 0.55), cx, 1.20, cz - sign * 0.20));
    // 炮窗（船体上的方形开口暗示，用红色饰板）
    redGeoms.push(transformGeometry(createBox(0.70, 0.55, 0.06), cx, 1.10, sign * 4.05));
  }
}

// ---------- 13. 锚 Anchor（挂在船首侧） ----------
cannonGeoms.push(transformGeometry(createCylinder(0.10, 0.10, 1.6, 6), 13.5, 0.30, 3.95));   // 锚杆
cannonGeoms.push(transformGeometry(createTorus(0.55, 0.10, 12, 4), 13.5, -0.55, 3.95, 0, 0)); // 锚弯钩（圆环示意）
cannonGeoms.push(transformGeometry(createBox(0.60, 0.10, 0.10), 13.5, 0.95, 3.95));          // 锚顶横木
// 锚链（短）
ropeGeoms.push(transformGeometry(createCylinder(0.06, 0.06, 1.0, 4), 13.5, 1.50, 3.95));

// ---------- 14. 甲板小细节：货箱、绳卷、舱口盖 ----------
// 货箱
hullPlankGeoms.push(transformGeometry(createBox(1.1, 0.8, 1.1), 5.0, 1.95, 2.4));
hullPlankGeoms.push(transformGeometry(createBox(1.0, 0.7, 1.0), 5.6, 1.90, 2.6));
hullPlankGeoms.push(transformGeometry(createBox(1.2, 0.9, 1.2), -3.0, 2.00, -2.6));
goldGeoms.push(transformGeometry(createBox(1.12, 0.05, 1.12), 5.0, 2.36, 2.4)); // 货箱金属包边
// 中央舱口盖
deckGeoms.push(transformGeometry(createBox(2.4, 0.12, 2.4), 2.0, 1.62, 0));
goldGeoms.push(transformGeometry(createTorus(0.18, 0.05, 8, 4), 2.0, 1.70, 0)); // 舱口拉环
// 盘绳
for (let i = 0; i < 3; i++) {
  ropeGeoms.push(transformGeometry(createTorus(0.30 - i * 0.05, 0.05, 10, 3), -4.5, 1.65 + i * 0.04, 2.6));
}

// ---------- 15. 船底下面的薄阴影板（让甲板下方不透空） ----------
hullDarkGeoms.push(transformGeometry(createBox(24.0, 0.10, 6.8), 0, -1.95, 0));

// ============================================================
// 整体抬高，让 y=0 位于龙骨最低点之下，避免穿地
// ============================================================
function offsetGeomsY(geoms, dy) {
  for (const g of geoms) {
    for (let i = 1; i < g.positions.length; i += 3) g.positions[i] += dy;
  }
}
const Y_OFFSET = 2.0;
for (const arr of [hullDarkGeoms, hullPlankGeoms, deckGeoms, mastGeoms, sailGeoms,
                   flagGeoms, skullGeoms, goldGeoms, ropeGeoms, cannonGeoms, redGeoms]) {
  offsetGeomsY(arr, Y_OFFSET);
}

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
  { name: 'hull_dark',  geoms: hullDarkGeoms,  mat: matHullDark },
  { name: 'hull_plank', geoms: hullPlankGeoms, mat: matHullPlank },
  { name: 'deck',       geoms: deckGeoms,      mat: matDeckWood },
  { name: 'mast',       geoms: mastGeoms,      mat: matMastWood },
  { name: 'sail',       geoms: sailGeoms,      mat: matSail },
  { name: 'flag',       geoms: flagGeoms,      mat: matFlagBlack },
  { name: 'skull',      geoms: skullGeoms,     mat: matSkullWhite },
  { name: 'gold',       geoms: goldGeoms,      mat: matGold },
  { name: 'rope',       geoms: ropeGeoms,      mat: matRope },
  { name: 'cannon',     geoms: cannonGeoms,    mat: matCannon },
  { name: 'red_band',   geoms: redGeoms,       mat: matRedAccent },
];

const scene = doc.createScene('shipwreck_shore_scene');
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
// 导出（写入 source 与 optimized 两份相同的 GLB）
// ============================================================
const SOURCE_PATH    = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/source/landmarks/06_shipwreck-shore.glb';
const OPTIMIZED_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/optimized/landmarks/06_shipwreck-shore.glb';

const io = new NodeIO();
await io.write(SOURCE_PATH, doc);
await io.write(OPTIMIZED_PATH, doc);

const { statSync } = await import('fs');
const stat = statSync(SOURCE_PATH);
console.log('GLB generated:', SOURCE_PATH);
console.log('             :', OPTIMIZED_PATH);
console.log('File size    :', (stat.size / 1024).toFixed(1), 'KB');
console.log('Stats        :', JSON.stringify(stats, null, 2));
writeFileSync(SOURCE_PATH.replace('.glb', '_info.json'), JSON.stringify({ ...stats, fileSizeBytes: stat.size }, null, 2));
