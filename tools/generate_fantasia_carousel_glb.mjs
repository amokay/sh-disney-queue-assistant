import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数（沿用 pirates / tron 脚本同款 API）
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

function createCylinder(radiusTop, radiusBottom, height, segments = 16) {
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

function createCone(radius, height, segments = 16) {
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

function createTorus(majorR, minorR, majorSeg = 24, minorSeg = 8) {
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
      const nx = cv * cu;
      const ny = sv;
      const nz = cv * su;
      normals.push(nx, ny, nz);
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

function transformGeometry(geom, tx, ty, tz, rotY = 0, rotZ = 0, scale = 1) {
  const positions = new Float32Array(geom.positions);
  const normals = new Float32Array(geom.normals);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i] * scale, y = positions[i + 1] * scale, z = positions[i + 2] * scale;
    let x1 = x * cz - y * sz; let y1 = x * sz + y * cz; x = x1; y = y1;
    let x2 = x * cy + z * sy; let z2 = -x * sy + z * cy; x = x2; z = z2;
    positions[i] = x + tx; positions[i + 1] = y + ty; positions[i + 2] = z + tz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    let x = normals[i], y = normals[i + 1], z = normals[i + 2];
    let x1 = x * cz - y * sz; let y1 = x * sz + y * cz; x = x1; y = y1;
    let x2 = x * cy + z * sy; let z2 = -x * sy + z * cy; x = x2; z = z2;
    normals[i] = x; normals[i + 1] = y; normals[i + 2] = z;
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

function countTriangles(geom) {
  return geom.indices.length / 3;
}

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

// ---------- 材质（城堡配色 Castle Palette） ----------
// 参考迪士尼奇幻童话城堡：玫瑰粉墙面、宝蓝屋顶、金色装饰
// 非金属：metallic 0.05, roughness 0.28-0.35
// 金属：metallic 0.6-0.75, roughness 0.25-0.32
// 大面积区域加微弱自发光避免暗沉
const matPedestal2  = createMaterial('pedestal_pearl',    [0.95, 0.60, 0.70], 0.30, 0.00, [0.15, 0.08, 0.10]);
const matBase       = createMaterial('base_ivory',        [0.98, 0.93, 0.88], 0.30, 0.05, [0.05, 0.04, 0.03]);
const matUpperRim   = createMaterial('upper_rose_gold',   [0.94, 0.60, 0.65], 0.32, 0.10, [0.04, 0.02, 0.02]);
const matCanopy     = createMaterial('canopy_castle_blue',[0.55, 0.72, 0.92], 0.28, 0.05, [0.02, 0.03, 0.05]);
const matGold       = createMaterial('gold_castle',       [0.85, 0.68, 0.22], 0.28, 0.70);
const matSpireGold  = createMaterial('spire_royal_blue',  [0.15, 0.28, 0.55], 0.25, 0.10, [0.02, 0.04, 0.08]);
const matHorseBlue  = createMaterial('horse_castle_blue',      [0.65, 0.78, 0.92], 0.32, 0.05, [0.02, 0.03, 0.04]);
const matHorsePink  = createMaterial('horse_castle_pink',      [0.95, 0.72, 0.76], 0.32, 0.05, [0.04, 0.02, 0.03]);
const matHorseGold  = createMaterial('horse_castle_cream',     [0.96, 0.92, 0.80], 0.32, 0.05, [0.04, 0.04, 0.03]);
const matGemGreen   = createMaterial('gem_castle_gold',   [0.85, 0.70, 0.20], 0.25, 0.55);
const matGemBlue    = createMaterial('gem_castle_blue',   [0.20, 0.40, 0.78], 0.25, 0.35, [0.02, 0.04, 0.08]);
const matGemPink    = createMaterial('gem_castle_rose',   [0.82, 0.35, 0.45], 0.28, 0.30, [0.05, 0.02, 0.03]);

// ============================================================
// 几何分组
// ============================================================

const pedestalUpperGeoms = [];
const baseGeoms       = [];
const upperRimGeoms   = [];
const canopyGeoms     = [];
const goldGeoms       = [];
const spireGeoms      = [];
const horseBlueGeoms  = [];
const horsePinkGeoms  = [];
const horseGoldGeoms  = [];
const gemGreenGeoms   = [];
const gemBlueGeoms    = [];
const gemPinkGeoms    = [];

// ======================================================================
// 0. 装饰性单层底座（Decorative Pedestal） —— 位于现有圆形平台下方
// ======================================================================
// 单层：r=8, h=0.5，珍珠白
const pedestalUpperR = 8.0;
const pedestalUpperH = 0.5;
const pedestalTotalH = pedestalUpperH; // 0.5，整体模型向上偏移量

pedestalUpperGeoms.push(transformGeometry(createCylinder(pedestalUpperR, pedestalUpperR, pedestalUpperH, 28), 0, pedestalUpperH / 2, 0));

// 金色镶边圆环装饰：底座顶部边缘
goldGeoms.push(transformGeometry(createTorus(pedestalUpperR, 0.16, 30, 4), 0, pedestalUpperH, 0));
// 底座底部一圈金边（地面接触线）
goldGeoms.push(transformGeometry(createTorus(pedestalUpperR, 0.14, 32, 4), 0, 0.02, 0));

// ======================================================================
// 1. 圆形底座（Base Platform，珍珠白）
//    注：以下所有 y 坐标基于「pedestal 顶面 = 0」的局部坐标，
//    最后会通过 Y_OFFSET = pedestalTotalH 整体上移。
// ======================================================================
const baseR = 9.0;
const baseH = 0.8;
baseGeoms.push(transformGeometry(createCylinder(baseR, baseR, baseH, 24), 0, baseH / 2, 0));

// ======================================================================
// 2. 上层平台（Upper Platform，珍珠白 + 鲜艳粉色边缘）
// ======================================================================
const upperR = 7.0;
const upperH = 0.4;
const upperY = baseH + upperH / 2;
baseGeoms.push(transformGeometry(createCylinder(upperR, upperR, upperH, 20), 0, upperY, 0));
const platformTopY = baseH + upperH; // 1.2

// 平台边缘镶边：上层亮粉色圆环 + 底座金色镶边
upperRimGeoms.push(transformGeometry(createTorus(upperR, 0.14, 28, 5), 0, platformTopY, 0));
goldGeoms.push(transformGeometry(createTorus(baseR, 0.16, 28, 4), 0, baseH, 0));
// 主平台顶面再加一圈细金边作为内圈装饰
goldGeoms.push(transformGeometry(createTorus(upperR - 0.05, 0.06, 24, 4), 0, platformTopY + 0.02, 0));

// ======================================================================
// 3. 支撑立柱 ×8（Support Columns）
// ======================================================================
const colCount = 8;
const colRadius = 6.5;
const colHeight = 8.0;
const colCenterY = platformTopY + colHeight / 2;
for (let i = 0; i < colCount; i++) {
  const a = (i / colCount) * Math.PI * 2;
  const cx = Math.cos(a) * colRadius;
  const cz = Math.sin(a) * colRadius;
  goldGeoms.push(transformGeometry(createCylinder(0.3, 0.3, colHeight, 8), cx, colCenterY, cz));
  // 立柱顶端小球装饰
  goldGeoms.push(transformGeometry(createSphere(0.4, 5), cx, platformTopY + colHeight + 0.3, cz));
}
const colTopY = platformTopY + colHeight; // 9.2

// ======================================================================
// 4. 穹顶/伞盖（Canopy Dome）—— 圆锥体
// ======================================================================
const domeBaseR = 9.0;
const domeHeight = 4.0;
const domeCenterY = colTopY + domeHeight / 2;
canopyGeoms.push(transformGeometry(createCone(domeBaseR, domeHeight, 24), 0, domeCenterY, 0));

// 穹顶下方一圈薄圆盘做封顶（视觉上避免穿洞）
canopyGeoms.push(transformGeometry(createCylinder(domeBaseR * 0.999, domeBaseR * 0.999, 0.05, 24), 0, colTopY + 0.025, 0));

const domeTopY = colTopY + domeHeight; // 13.2

// ======================================================================
// 5. 金色尖顶（Golden Spire）—— 细长圆锥 + 顶端小球
// ======================================================================
const spireH = 2.6;
spireGeoms.push(transformGeometry(createCone(0.5, spireH, 12), 0, domeTopY + spireH / 2, 0));
spireGeoms.push(transformGeometry(createSphere(0.35, 6), 0, domeTopY + spireH + 0.3, 0));
// 顶尖一根细针
spireGeoms.push(transformGeometry(createCylinder(0.04, 0.04, 0.6, 5), 0, domeTopY + spireH + 0.85, 0));

// ======================================================================
// 6. 装饰边缘（Decorative Rim）
//    穹顶底部的环形装饰带：圆环 + 一圈小立方体
// ======================================================================
goldGeoms.push(transformGeometry(createTorus(domeBaseR, 0.22, 28, 5), 0, colTopY + 0.05, 0));
goldGeoms.push(transformGeometry(createTorus(domeBaseR - 0.6, 0.12, 24, 4), 0, colTopY + 0.5, 0));

const rimBoxCount = 16;
for (let i = 0; i < rimBoxCount; i++) {
  const a = (i / rimBoxCount) * Math.PI * 2;
  const rx = Math.cos(a) * (domeBaseR - 0.05);
  const rz = Math.sin(a) * (domeBaseR - 0.05);
  goldGeoms.push(transformGeometry(createBox(0.4, 0.55, 0.4), rx, colTopY - 0.27, rz, -a, 0));
}

// 穹顶外缘下垂的吊饰宝石球（12 个，翠绿/宝蓝/玫红交替）
const hangCount = 12;
const gemArrs = [gemGreenGeoms, gemBlueGeoms, gemPinkGeoms];
for (let i = 0; i < hangCount; i++) {
  const a = (i / hangCount) * Math.PI * 2 + Math.PI / hangCount;
  const rx = Math.cos(a) * domeBaseR;
  const rz = Math.sin(a) * domeBaseR;
  // 金色吊绳（细短杆）
  goldGeoms.push(transformGeometry(createCylinder(0.04, 0.04, 0.35, 4), rx, colTopY - 0.42, rz));
  // 宝石小球
  gemArrs[i % 3].push(transformGeometry(createSphere(0.24, 5), rx, colTopY - 0.72, rz));
}

// 立柱之间的装饰宝石（8 个，挂在每根立柱上方鼓出装饰位置之间）
for (let i = 0; i < colCount; i++) {
  const a = (i / colCount) * Math.PI * 2 + Math.PI / colCount;
  const rx = Math.cos(a) * (colRadius + 0.4);
  const rz = Math.sin(a) * (colRadius + 0.4);
  gemArrs[i % 3].push(transformGeometry(createSphere(0.18, 5), rx, platformTopY + colHeight * 0.55, rz));
}

// ======================================================================
// 7. 飞马 / 坐骑 ×12（Pegasus Horses）
//    简化造型：椭圆体身体（缩放 sphere） + 4 圆柱腿 + 球头 + 锥耳 +连接杆
// ======================================================================
function addHorse(cx, cz, color, facingAngle) {
  const arr = color === 'blue' ? horseBlueGeoms : color === 'pink' ? horsePinkGeoms : horseGoldGeoms;

  const horseY = platformTopY + 1.7; // 骑乘平台之上
  const cosF = Math.cos(facingAngle);
  const sinF = Math.sin(facingAngle);

  // 局部偏移辅助（沿马身朝向 +x，侧向为 +z）
  const place = (lx, ly, lz) => [
    cx + lx * cosF - lz * sinF,
    horseY + ly,
    cz + lx * sinF + lz * cosF,
  ];

  // 身体：用一个椭圆形球（5 segs）
  arr.push(transformGeometry(createSphere(0.62, 5), ...place(0, 0, 0)));
  arr.push(transformGeometry(createSphere(0.45, 5), ...place(0.55, 0.05, 0)));

  // 4 条腿（前两条略前，后两条略后）
  const legR = 0.09;
  const legH = 1.1;
  const legOffsets = [
    [0.4, -0.30],
    [0.4,  0.30],
    [-0.4, -0.30],
    [-0.4,  0.30],
  ];
  for (const [lx, lz] of legOffsets) {
    arr.push(transformGeometry(createCylinder(legR, legR, legH, 4), ...place(lx, -0.55, lz)));
  }

  // 颈部（向前上方倾斜的圆柱）
  arr.push(transformGeometry(createCylinder(0.16, 0.20, 0.7, 4), ...place(0.75, 0.55, 0), 0, -0.45));
  // 头部
  arr.push(transformGeometry(createSphere(0.28, 5), ...place(1.05, 0.9, 0)));
  // 双耳（圆锥）
  arr.push(transformGeometry(createCone(0.07, 0.22, 3), ...place(0.98, 1.15, -0.12)));
  arr.push(transformGeometry(createCone(0.07, 0.22, 3), ...place(0.98, 1.15,  0.12)));
  // 尾巴（短锥）
  arr.push(transformGeometry(createCone(0.10, 0.45, 4), ...place(-1.0, 0.4, 0), 0, 0.5));

  // 连接到顶部的细金色竖杆
  const poleH = 6.2;
  goldGeoms.push(transformGeometry(createCylinder(0.06, 0.06, poleH, 5), cx, horseY + 0.4 + poleH / 2 - 0.5, cz));
}

const palette = ['blue', 'pink', 'gold'];
const innerR = 3.2;
const outerR = 5.4;

// 内圈 6 匹
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const cx = Math.cos(a) * innerR;
  const cz = Math.sin(a) * innerR;
  // 朝向：圆周切向（逆时针）
  const facing = a + Math.PI / 2;
  addHorse(cx, cz, palette[i % 3], facing);
}

// 外圈 6 匹（错位 30°）
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  const cx = Math.cos(a) * outerR;
  const cz = Math.sin(a) * outerR;
  const facing = a + Math.PI / 2;
  addHorse(cx, cz, palette[(i + 1) % 3], facing);
}

// ======================================================================
// 8. 中心柱（Central Pole）
// ======================================================================
const centralH = colTopY + 0.5; // 略高于立柱顶端
goldGeoms.push(transformGeometry(createCylinder(0.45, 0.45, centralH, 12), 0, centralH / 2, 0));
// 中心柱顶端装饰（小球+短锥）
goldGeoms.push(transformGeometry(createSphere(0.55, 6), 0, centralH + 0.3, 0));
goldGeoms.push(transformGeometry(createCone(0.35, 0.7, 8), 0, centralH + 0.95, 0));

// ============================================================
// 整体上移：除 pedestal 之外的所有几何上移 pedestalTotalH，
// 使原先的「底座底面」刚好坍在新 pedestal 的顶面上。
// ============================================================
function offsetGeomsY(geoms, dy) {
  for (const g of geoms) {
    for (let i = 1; i < g.positions.length; i += 3) g.positions[i] += dy;
  }
}
const Y_OFFSET = pedestalTotalH;
for (const arr of [baseGeoms, upperRimGeoms, canopyGeoms, spireGeoms,
                   horseBlueGeoms, horsePinkGeoms, horseGoldGeoms,
                   gemGreenGeoms, gemBlueGeoms, gemPinkGeoms]) {
  offsetGeomsY(arr, Y_OFFSET);
}
// goldGeoms 特殊处理：pedestal 边缘 2 个环不偏移，其余偏移。
// 由于 pedestal 金边是最先 push 进去的 2 个元素，其余都需要偏移。
for (let k = 2; k < goldGeoms.length; k++) {
  const g = goldGeoms[k];
  for (let i = 1; i < g.positions.length; i += 3) g.positions[i] += Y_OFFSET;
}

// ============================================================
// 合并几何并构建 Primitive
// ============================================================

function makePrimitive(geoms, material) {
  const merged = mergeGeometries(geoms);
  const posAcc = doc.createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(merged.positions);
  const normAcc = doc.createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(merged.normals);
  const idxAcc = doc.createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(merged.indices);
  return doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setIndices(idxAcc)
    .setMaterial(material);
}

const pedestalUpperPrim = makePrimitive(pedestalUpperGeoms, matPedestal2);
const basePrim       = makePrimitive(baseGeoms, matBase);
const upperRimPrim   = makePrimitive(upperRimGeoms, matUpperRim);
const canopyPrim     = makePrimitive(canopyGeoms, matCanopy);
const goldPrim       = makePrimitive(goldGeoms, matGold);
const spirePrim      = makePrimitive(spireGeoms, matSpireGold);
const horseBluePrim  = makePrimitive(horseBlueGeoms, matHorseBlue);
const horsePinkPrim  = makePrimitive(horsePinkGeoms, matHorsePink);
const horseGoldPrim  = makePrimitive(horseGoldGeoms, matHorseGold);
const gemGreenPrim   = makePrimitive(gemGreenGeoms, matGemGreen);
const gemBluePrim    = makePrimitive(gemBlueGeoms, matGemBlue);
const gemPinkPrim    = makePrimitive(gemPinkGeoms, matGemPink);

const pedestalUpperMesh = doc.createMesh().addPrimitive(pedestalUpperPrim);
const baseMesh      = doc.createMesh().addPrimitive(basePrim);
const upperRimMesh  = doc.createMesh().addPrimitive(upperRimPrim);
const canopyMesh    = doc.createMesh().addPrimitive(canopyPrim);
const goldMesh      = doc.createMesh().addPrimitive(goldPrim);
const spireMesh     = doc.createMesh().addPrimitive(spirePrim);
const horseBlueMesh = doc.createMesh().addPrimitive(horseBluePrim);
const horsePinkMesh = doc.createMesh().addPrimitive(horsePinkPrim);
const horseGoldMesh = doc.createMesh().addPrimitive(horseGoldPrim);
const gemGreenMesh  = doc.createMesh().addPrimitive(gemGreenPrim);
const gemBlueMesh   = doc.createMesh().addPrimitive(gemBluePrim);
const gemPinkMesh   = doc.createMesh().addPrimitive(gemPinkPrim);

const pedestalUpperNode = doc.createNode('pedestal_upper').setMesh(pedestalUpperMesh);
const baseNode      = doc.createNode('base_platforms').setMesh(baseMesh);
const upperRimNode  = doc.createNode('upper_rim').setMesh(upperRimMesh);
const canopyNode    = doc.createNode('canopy_dome').setMesh(canopyMesh);
const goldNode      = doc.createNode('gold_parts').setMesh(goldMesh);
const spireNode     = doc.createNode('spire').setMesh(spireMesh);
const horseBlueNode = doc.createNode('horses_blue').setMesh(horseBlueMesh);
const horsePinkNode = doc.createNode('horses_pink').setMesh(horsePinkMesh);
const horseGoldNode = doc.createNode('horses_gold').setMesh(horseGoldMesh);
const gemGreenNode  = doc.createNode('gems_green').setMesh(gemGreenMesh);
const gemBlueNode   = doc.createNode('gems_blue').setMesh(gemBlueMesh);
const gemPinkNode   = doc.createNode('gems_pink').setMesh(gemPinkMesh);

const scene = doc.createScene('fantasia_carousel_scene')
  .addChild(pedestalUpperNode)
  .addChild(baseNode)
  .addChild(upperRimNode)
  .addChild(canopyNode)
  .addChild(goldNode)
  .addChild(spireNode)
  .addChild(horseBlueNode)
  .addChild(horsePinkNode)
  .addChild(horseGoldNode)
  .addChild(gemGreenNode)
  .addChild(gemBlueNode)
  .addChild(gemPinkNode);

doc.getRoot().setDefaultScene(scene);

// ============================================================
// 统计
// ============================================================

function sumTris(geoms) { return geoms.reduce((s, g) => s + countTriangles(g), 0); }

const info = {
  totalTriangles:
    sumTris(pedestalUpperGeoms) +
    sumTris(baseGeoms) + sumTris(upperRimGeoms) + sumTris(canopyGeoms) + sumTris(goldGeoms) +
    sumTris(spireGeoms) + sumTris(horseBlueGeoms) + sumTris(horsePinkGeoms) + sumTris(horseGoldGeoms) +
    sumTris(gemGreenGeoms) + sumTris(gemBlueGeoms) + sumTris(gemPinkGeoms),
  pedestalUpperTriangles: sumTris(pedestalUpperGeoms),
  baseTriangles: sumTris(baseGeoms),
  upperRimTriangles: sumTris(upperRimGeoms),
  canopyTriangles: sumTris(canopyGeoms),
  goldTriangles: sumTris(goldGeoms),
  spireTriangles: sumTris(spireGeoms),
  horseBlueTriangles: sumTris(horseBlueGeoms),
  horsePinkTriangles: sumTris(horsePinkGeoms),
  horseGoldTriangles: sumTris(horseGoldGeoms),
  gemGreenTriangles: sumTris(gemGreenGeoms),
  gemBlueTriangles: sumTris(gemBlueGeoms),
  gemPinkTriangles: sumTris(gemPinkGeoms),
};

// ============================================================
// 导出
// ============================================================

const OUTPUT_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/source/landmarks/05_fantasia-carousel.glb';

const io = new NodeIO();
await io.write(OUTPUT_PATH, doc);

const { statSync } = await import('fs');
const stat = statSync(OUTPUT_PATH);

console.log('GLB generated:', OUTPUT_PATH);
console.log('File size:', (stat.size / 1024).toFixed(1), 'KB');
console.log('Stats:', JSON.stringify(info, null, 2));

writeFileSync(OUTPUT_PATH.replace('.glb', '_info.json'), JSON.stringify({ ...info, fileSizeBytes: stat.size }, null, 2));
