import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数（沿用 shipwreck / pirates / tron 同款 API）
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

// ---------- 爱丽丝迷宫配色 ----------
// 全部 metalness=0，靠 emissive 自发光使颜色在无环境贴图场景里依旧鲜明
const matStoneArch  = createMaterial('stone_arch',   [0.35, 0.38, 0.32], 0.9, 0.0, [0.16, 0.17, 0.14]);
const matArchInner  = createMaterial('arch_inner',   [0.25, 0.15, 0.30], 0.8, 0.0, [0.12, 0.07, 0.14]);
const matIronGate   = createMaterial('iron_gate',    [0.08, 0.08, 0.08], 0.4, 0.0, [0.04, 0.04, 0.04]);
const matPadlock    = createMaterial('padlock',      [0.30, 0.22, 0.10], 0.5, 0.0, [0.14, 0.10, 0.04]);
const matHedge      = createMaterial('hedge_green',  [0.15, 0.35, 0.10], 0.9, 0.0, [0.07, 0.16, 0.04]);
const matVine       = createMaterial('vine_branch',  [0.12, 0.25, 0.08], 0.8, 0.0, [0.05, 0.12, 0.03]);
const matBerry      = createMaterial('berry',        [0.30, 0.05, 0.15], 0.6, 0.0, [0.14, 0.02, 0.07]);

// ============================================================
// 几何分组
// ============================================================
const stoneGeoms    = [];
const innerGeoms    = [];
const ironGeoms     = [];
const padlockGeoms  = [];
const hedgeGeoms    = [];
const vineGeoms     = [];
const berryGeoms    = [];

// ============================================================
// 爱丽丝迷宫入口设计
// 整体尺寸：宽约 10 单位，高约 14 单位（类似海盗船尺寸比例）
// 中心点在模型底部中心
// ============================================================

// ---------- 1. 石头拱门 Stone Arch ----------
// 两根石柱（左右）
const pillarW = 1.2, pillarH = 8.0, pillarD = 1.5;
const pillarX = 3.0; // 左右间距

// 左柱
stoneGeoms.push(transformGeometry(createBox(pillarW, pillarH, pillarD), -pillarX, pillarH / 2, 0));
// 右柱
stoneGeoms.push(transformGeometry(createBox(pillarW, pillarH, pillarD), pillarX, pillarH / 2, 0));

// 柱子顶部装饰（略微外扩的石帽）
stoneGeoms.push(transformGeometry(createBox(pillarW + 0.3, 0.5, pillarD + 0.3), -pillarX, pillarH + 0.25, 0));
stoneGeoms.push(transformGeometry(createBox(pillarW + 0.3, 0.5, pillarD + 0.3), pillarX, pillarH + 0.25, 0));

// 柱子底部基座
stoneGeoms.push(transformGeometry(createBox(pillarW + 0.4, 0.6, pillarD + 0.4), -pillarX, 0.3, 0));
stoneGeoms.push(transformGeometry(createBox(pillarW + 0.4, 0.6, pillarD + 0.4), pillarX, 0.3, 0));

// 尖拱顶部 - 用多段方块近似哥特式尖拱形状
const archSegments = 12;
const archRadius = pillarX; // 拱的半径等于柱间距
const archBaseY = pillarH;  // 拱从柱顶开始
const archThickness = 1.2;
const archDepth = 1.5;

for (let i = 0; i <= archSegments; i++) {
  // 尖拱形状：用两段弧线在顶部交汇
  const t = i / archSegments; // 0~1
  let x, y;
  if (t <= 0.5) {
    // 左弧
    const angle = (t * 2) * (Math.PI * 0.55); // 稍微超过半圆
    x = -archRadius + archRadius * Math.sin(angle);
    y = archBaseY + archRadius * 1.3 * Math.sin(angle * 0.9 + 0.1);
  } else {
    // 右弧（对称）
    const angle = ((1 - t) * 2) * (Math.PI * 0.55);
    x = archRadius - archRadius * Math.sin(angle);
    y = archBaseY + archRadius * 1.3 * Math.sin(angle * 0.9 + 0.1);
  }
  stoneGeoms.push(transformGeometry(
    createBox(archThickness * 0.8, archThickness, archDepth * 0.9),
    x, y, 0
  ));
}

// 拱顶尖顶石（keystone）
stoneGeoms.push(transformGeometry(createBox(1.0, 1.5, pillarD), 0, archBaseY + archRadius * 1.35, 0));
// keystone 装饰尖
stoneGeoms.push(transformGeometry(createCylinder(0.0, 0.5, 1.0, 4), 0, archBaseY + archRadius * 1.35 + 1.2, 0));

// 拱门内侧面（暗紫色面板）
innerGeoms.push(transformGeometry(createBox(pillarX * 2 - pillarW, pillarH - 0.5, 0.3), 0, pillarH / 2 + 0.25, -0.5));
// 拱门内侧上弧面
innerGeoms.push(transformGeometry(createBox(pillarX * 2 - pillarW - 0.5, 2.0, 0.3), 0, archBaseY + 1.5, -0.5));

// ---------- 2. 铁艺栅栏门 Iron Gate ----------
const gateWidth = pillarX * 2 - pillarW - 0.4;
const gateHeight = pillarH - 0.5;
const barCount = 9;
const barSpacing = gateWidth / (barCount + 1);

// 竖向栅栏条
for (let i = 1; i <= barCount; i++) {
  const bx = -gateWidth / 2 + i * barSpacing;
  ironGeoms.push(transformGeometry(createCylinder(0.08, 0.08, gateHeight, 6), bx, gateHeight / 2 + 0.25, 0));
}

// 顶部横杆
ironGeoms.push(transformGeometry(createBox(gateWidth, 0.15, 0.15), 0, gateHeight + 0.25, 0));
// 底部横杆
ironGeoms.push(transformGeometry(createBox(gateWidth, 0.15, 0.15), 0, 0.6, 0));
// 中间横杆
ironGeoms.push(transformGeometry(createBox(gateWidth, 0.12, 0.12), 0, gateHeight * 0.5, 0));

// 顶部装饰弧形 - 用小段来模拟尖拱装饰
const decorSegments = 8;
for (let i = 0; i <= decorSegments; i++) {
  const t = i / decorSegments;
  const angle = t * Math.PI;
  const dx = (t - 0.5) * gateWidth * 0.8;
  const dy = Math.sin(angle) * 1.2;
  ironGeoms.push(transformGeometry(
    createSphere(0.06, 4),
    dx, gateHeight + 0.5 + dy, 0
  ));
}

// 装饰卷花（scroll pattern）- 用 torus 段模拟
// 左侧卷花
ironGeoms.push(transformGeometry(createTorus(0.35, 0.04, 10, 4), -gateWidth * 0.3, gateHeight * 0.7, 0.05, Math.PI / 2));
// 右侧卷花
ironGeoms.push(transformGeometry(createTorus(0.35, 0.04, 10, 4), gateWidth * 0.3, gateHeight * 0.7, 0.05, Math.PI / 2));
// 上方中央卷花
ironGeoms.push(transformGeometry(createTorus(0.25, 0.04, 10, 4), 0, gateHeight * 0.85, 0.05, Math.PI / 2));
// 底部小卷花装饰
ironGeoms.push(transformGeometry(createTorus(0.2, 0.03, 8, 4), -gateWidth * 0.25, gateHeight * 0.3, 0.05, Math.PI / 2));
ironGeoms.push(transformGeometry(createTorus(0.2, 0.03, 8, 4), gateWidth * 0.25, gateHeight * 0.3, 0.05, Math.PI / 2));

// ---------- 3. 门中间的大锁 Padlock ----------
// 锁体（方形）
padlockGeoms.push(transformGeometry(createBox(0.8, 1.0, 0.4), 0, gateHeight * 0.42, 0.3));
// 锁扣（U形上方，用半圆 torus）
padlockGeoms.push(transformGeometry(createTorus(0.3, 0.08, 10, 5), 0, gateHeight * 0.42 + 0.6, 0.3, Math.PI / 2));
// 钥匙孔（小圆柱）
ironGeoms.push(transformGeometry(createCylinder(0.06, 0.06, 0.3, 6), 0, gateHeight * 0.40, 0.52));

// ---------- 4. 绿色灌木 Hedges ----------
// 左侧灌木群（多个球体堆叠）
const leftHedgeX = -4.8;
hedgeGeoms.push(transformGeometry(createSphere(1.8, 7), leftHedgeX, 1.8, 0.5));
hedgeGeoms.push(transformGeometry(createSphere(1.4, 6), leftHedgeX - 0.8, 1.5, -0.8));
hedgeGeoms.push(transformGeometry(createSphere(1.2, 6), leftHedgeX + 0.5, 2.5, 0.3));
hedgeGeoms.push(transformGeometry(createSphere(1.0, 5), leftHedgeX - 0.3, 3.0, -0.2));
hedgeGeoms.push(transformGeometry(createSphere(1.5, 6), leftHedgeX + 0.3, 1.2, 1.2));

// 右侧灌木群
const rightHedgeX = 4.8;
hedgeGeoms.push(transformGeometry(createSphere(1.8, 7), rightHedgeX, 1.8, 0.5));
hedgeGeoms.push(transformGeometry(createSphere(1.4, 6), rightHedgeX + 0.8, 1.5, -0.6));
hedgeGeoms.push(transformGeometry(createSphere(1.2, 6), rightHedgeX - 0.5, 2.5, 0.4));
hedgeGeoms.push(transformGeometry(createSphere(1.0, 5), rightHedgeX + 0.3, 3.0, 0.0));
hedgeGeoms.push(transformGeometry(createSphere(1.5, 6), rightHedgeX - 0.3, 1.2, 1.0));

// ---------- 5. 藤蔓装饰 Vines ----------
// 拱门上方的藤蔓
function addVine(startX, startY, startZ, segments, dx, dy, dz) {
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const x = startX + dx * t + Math.sin(t * 4) * 0.3;
    const y = startY + dy * t;
    const z = startZ + dz * t + Math.cos(t * 3) * 0.2;
    vineGeoms.push(transformGeometry(
      createCylinder(0.06, 0.05, 0.8, 4),
      x, y, z,
      Math.sin(t * 3) * 0.5,
      Math.cos(t * 2) * 0.4
    ));
  }
}

// 左侧攀爬藤蔓
addVine(-pillarX - 0.3, 3.0, 0.5, 8, -1.5, 5.0, 0.5);
// 右侧攀爬藤蔓（更茂密）
addVine(pillarX + 0.3, 2.5, 0.5, 10, 2.0, 6.0, 0.8);
addVine(pillarX + 0.5, 4.0, -0.3, 7, 1.5, 4.5, -0.5);
// 拱顶垂下的藤蔓
addVine(-1.0, archBaseY + 2.0, 0.6, 6, 0.5, -2.5, 0.3);
addVine(1.5, archBaseY + 1.5, 0.5, 5, -0.3, -2.0, 0.2);

// ---------- 6. 浆果 Berries ----------
// 右侧藤蔓上的浆果群
const berryPositions = [
  [rightHedgeX + 1.2, 4.5, 0.8],
  [rightHedgeX + 1.5, 5.0, 0.6],
  [rightHedgeX + 1.0, 5.3, 1.0],
  [rightHedgeX + 1.8, 4.8, 0.4],
  [rightHedgeX + 0.8, 5.6, 0.7],
  [rightHedgeX + 1.3, 6.0, 0.9],
  [rightHedgeX + 2.0, 5.2, 0.5],
  [rightHedgeX + 1.6, 5.8, 1.1],
  // 左侧少量浆果
  [-pillarX - 0.5, 6.5, 0.4],
  [-pillarX - 0.8, 7.0, 0.6],
  [-pillarX - 0.3, 7.3, 0.3],
  // 拱顶附近
  [0.5, archBaseY + 0.5, 0.7],
  [-0.3, archBaseY + 0.8, 0.5],
];

for (const [bx, by, bz] of berryPositions) {
  berryGeoms.push(transformGeometry(createSphere(0.12, 4), bx, by, bz));
}

// 小浆果簇（3-4颗聚在一起）
const clusterPositions = [
  [rightHedgeX + 1.4, 3.8, 1.2],
  [rightHedgeX + 0.6, 4.2, 0.9],
  [-pillarX - 1.0, 5.5, 0.5],
];
for (const [cx, cy, cz] of clusterPositions) {
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    berryGeoms.push(transformGeometry(
      createSphere(0.09, 3),
      cx + Math.cos(angle) * 0.12, cy + Math.sin(angle) * 0.1, cz + 0.05 * i
    ));
  }
}

// 石柱上的苔藓纹理暗示（略绿的小突起）
for (const side of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    const py = 1.5 + i * 1.8;
    stoneGeoms.push(transformGeometry(
      createBox(0.15, 0.4, 0.2),
      side * pillarX + side * 0.65, py, Math.sin(i) * 0.4
    ));
  }
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
  { name: 'stone_arch',  geoms: stoneGeoms,   mat: matStoneArch },
  { name: 'arch_inner',  geoms: innerGeoms,   mat: matArchInner },
  { name: 'iron_gate',   geoms: ironGeoms,    mat: matIronGate },
  { name: 'padlock',     geoms: padlockGeoms, mat: matPadlock },
  { name: 'hedge_green', geoms: hedgeGeoms,   mat: matHedge },
  { name: 'vine_branch', geoms: vineGeoms,    mat: matVine },
  { name: 'berry',       geoms: berryGeoms,   mat: matBerry },
];

const scene = doc.createScene('alice_maze_scene');
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
const SOURCE_PATH    = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/source/landmarks/07_alice-maze.glb';
const OPTIMIZED_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/frontend/assets/models/optimized/landmarks/07_alice-maze.glb';

const io = new NodeIO();
await io.write(SOURCE_PATH, doc);
await io.write(OPTIMIZED_PATH, doc);

const { statSync } = await import('fs');
const stat = statSync(SOURCE_PATH);
console.log('GLB generated:', SOURCE_PATH);
console.log('             :', OPTIMIZED_PATH);
console.log('File size    :', (stat.size / 1024).toFixed(1), 'KB');
console.log('Stats        :', JSON.stringify(stats, null, 2));
console.log('\nTriangle budget check:', stats.totalTriangles <= 5000 ? 'PASS' : 'OVER BUDGET!', `(${stats.totalTriangles}/5000)`);
writeFileSync(SOURCE_PATH.replace('.glb', '_info.json'), JSON.stringify({ ...stats, fileSizeBytes: stat.size }, null, 2));
