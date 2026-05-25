import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数
// ============================================================

function createBox(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = new Float32Array([
    // front
    -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z,
    // back
    -x, -y, -z,  -x,  y, -z,   x,  y, -z,   x, -y, -z,
    // top
    -x,  y, -z,  -x,  y,  z,   x,  y,  z,   x,  y, -z,
    // bottom
    -x, -y, -z,   x, -y, -z,   x, -y,  z,  -x, -y,  z,
    // right
     x, -y, -z,   x,  y, -z,   x,  y,  z,   x, -y,  z,
    // left
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

  // side
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

  // top cap
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

  // bottom cap
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

  // side
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

  // bottom cap
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
  const indices = new Uint16Array(iCount);
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

function createMaterial(name, baseColor, roughness, metalness) {
  return doc.createMaterial(name)
    .setBaseColorFactor([...baseColor, 1.0])
    .setRoughnessFactor(roughness)
    .setMetallicFactor(metalness);
}

// ---------- 原有材质 ----------
const matStone = createMaterial('stone', [0.35, 0.28, 0.18], 0.85, 0.0);
const matDarkWood = createMaterial('dark_wood', [0.239, 0.125, 0.063], 0.90, 0.0);
const matWeatheredWood = createMaterial('weathered_wood', [0.420, 0.298, 0.165], 0.85, 0.0);
const matMetal = createMaterial('metal', [0.290, 0.290, 0.290], 0.45, 0.75);
const matBanner = createMaterial('banner', [0.102, 0.082, 0.063], 0.95, 0.0);

// ---------- 新增材质 ----------
const matCopperPatina = createMaterial('copper_patina', [0.29, 0.52, 0.42], 0.7, 0.4);
const matRoofTile = createMaterial('roof_tile', [0.28, 0.42, 0.30], 0.8, 0.0);
const matWarmLight = createMaterial('warm_light', [0.95, 0.85, 0.4], 0.3, 0.0);
const matPalmTrunk = createMaterial('palm_trunk', [0.35, 0.25, 0.15], 0.9, 0.0);
const matPalmLeaf = createMaterial('palm_leaf', [0.18, 0.45, 0.12], 0.85, 0.0);

// ============================================================
// 构建几何部件（按材质分组）
// ============================================================

const stoneGeoms = [];
const weatheredGeoms = [];
const metalGeoms = [];
const bannerGeoms = [];
const copperPatinaGeoms = [];
const roofTileGeoms = [];
const warmLightGeoms = [];
const palmTrunkGeoms = [];
const palmLeafGeoms = [];

// ======================================================================
// 1. stone: 主入口建筑
// ======================================================================
const archW = 7, archH = 8, buildingW = 42, buildingD = 15, buildingH = 11;
const pillarW = (buildingW - archW) / 2; // 17.5

// 左前墙柱
stoneGeoms.push(transformGeometry(createBox(pillarW, buildingH, 1), -21 + pillarW / 2, buildingH / 2, buildingD / 2 - 0.5));
// 右前墙柱
stoneGeoms.push(transformGeometry(createBox(pillarW, buildingH, 1), 21 - pillarW / 2, buildingH / 2, buildingD / 2 - 0.5));
// 前顶梁（拱门上方）
stoneGeoms.push(transformGeometry(createBox(archW, buildingH - archH, 1), 0, archH + (buildingH - archH) / 2, buildingD / 2 - 0.5));
// 左侧墙
stoneGeoms.push(transformGeometry(createBox(1, buildingH, buildingD), -buildingW / 2 + 0.5, buildingH / 2, 0));
// 右侧墙
stoneGeoms.push(transformGeometry(createBox(1, buildingH, buildingD), buildingW / 2 - 0.5, buildingH / 2, 0));
// 后墙
stoneGeoms.push(transformGeometry(createBox(buildingW, buildingH, 1), 0, buildingH / 2, -buildingD / 2 + 0.5));
// 屋顶板
stoneGeoms.push(transformGeometry(createBox(buildingW, 1, buildingD), 0, buildingH + 0.5, 0));

// 城垛（前边缘）
const crenelW = 1.5, crenelH = 1.2, crenelD = 0.8, crenelGap = 1.0;
const frontCrenelCount = 17;
const frontCrenelStartX = -((frontCrenelCount - 1) * (crenelW + crenelGap)) / 2;
for (let i = 0; i < frontCrenelCount; i++) {
  const x = frontCrenelStartX + i * (crenelW + crenelGap);
  stoneGeoms.push(transformGeometry(createBox(crenelW, crenelH, crenelD), x, buildingH + 1 + crenelH / 2, buildingD / 2 + crenelD / 2));
}

// 城垛（左边缘）
const sideCrenelCount = 6;
const sideCrenelStartZ = -((sideCrenelCount - 1) * (crenelW + crenelGap)) / 2;
for (let i = 0; i < sideCrenelCount; i++) {
  const z = sideCrenelStartZ + i * (crenelW + crenelGap);
  stoneGeoms.push(transformGeometry(createBox(crenelD, crenelH, crenelW), -buildingW / 2 - crenelD / 2, buildingH + 1 + crenelH / 2, z));
  stoneGeoms.push(transformGeometry(createBox(crenelD, crenelH, crenelW), buildingW / 2 + crenelD / 2, buildingH + 1 + crenelH / 2, z));
}

// ======================================================================
// 2. stone: 左侧圆形望楼（增强版）
// ======================================================================
const towerX = -25.5, towerR = 4.5, towerH = 22;

// 望楼底部石砌基座（比塔身稍粗的短圆柱）
stoneGeoms.push(transformGeometry(createCylinder(towerR + 0.8, towerR + 1.0, 3.0, 20), towerX, 1.5, 0));

// 望楼主体圆柱
stoneGeoms.push(transformGeometry(createCylinder(towerR, towerR, towerH, 20), towerX, towerH / 2 + 1.5, 0));

// 望楼中段多层小拱窗（3个窗洞，用深色box内凹表示）
const windowYPositions = [towerH * 0.35, towerH * 0.55, towerH * 0.75];
for (let wi = 0; wi < windowYPositions.length; wi++) {
  const wy = windowYPositions[wi] + 1.5; // offset for base
  // 前面窗洞
  stoneGeoms.push(transformGeometry(createBox(1.4, 2.2, 0.4), towerX, wy, towerR + 0.2));
  // 窗洞内部深色内凹（稍小，往前偏移一点模拟深度）
  stoneGeoms.push(transformGeometry(createBox(1.1, 1.8, 0.25), towerX, wy, towerR + 0.05));
}

// 望楼顶部圆柱基座（dome下的短圆柱）
copperPatinaGeoms.push(transformGeometry(createCylinder(towerR + 0.3, towerR + 0.3, 2.5, 20), towerX, towerH + 1.5 + 1.25, 0));

// 望楼穹顶（半球 = 全sphere，中心在圆柱顶部，下半隐藏在圆柱内）
copperPatinaGeoms.push(transformGeometry(createSphere(towerR + 0.3, 12), towerX, towerH + 1.5 + 2.5, 0));

// ======================================================================
// 3. stone: 后方要塞塔楼
// ======================================================================
const fortW = 16, fortD = 12, fortH = 28;
const fortX = 8, fortZ = -21.5;
stoneGeoms.push(transformGeometry(createBox(fortW, fortH, fortD), fortX, fortH / 2, fortZ));
// 塔楼顶平台
stoneGeoms.push(transformGeometry(createBox(fortW + 1, 0.8, fortD + 1), fortX, fortH + 0.4, fortZ));
// 塔楼城垛（前边缘）
const fortCrenelCount = 6;
const fortCrenelStartX = fortX - ((fortCrenelCount - 1) * (crenelW + crenelGap)) / 2;
for (let i = 0; i < fortCrenelCount; i++) {
  const x = fortCrenelStartX + i * (crenelW + crenelGap);
  stoneGeoms.push(transformGeometry(createBox(crenelW, crenelH, crenelD), x, fortH + 1 + crenelH / 2, fortZ + fortD / 2 + crenelD / 2));
}

// 要塞塔楼也加一个小穹顶
copperPatinaGeoms.push(transformGeometry(createCylinder(3.5, 3.5, 2.0, 16), fortX, fortH + 0.8 + 1.0, fortZ));
copperPatinaGeoms.push(transformGeometry(createSphere(3.5, 10), fortX, fortH + 0.8 + 2.0, fortZ));

// ======================================================================
// 4. stone: 左侧低墙
// ======================================================================
stoneGeoms.push(transformGeometry(createBox(12, 1.5, 0.8), -buildingW / 2 - 6, 0.75, buildingD / 2 + 6));

// ======================================================================
// 5. stone: 入口两侧石砌矮墩
// ======================================================================
stoneGeoms.push(transformGeometry(createBox(2.5, 0.6, 2.0), -5, 0.3, buildingD / 2 + 1.5));
stoneGeoms.push(transformGeometry(createBox(2.5, 0.6, 2.0), 5, 0.3, buildingD / 2 + 1.5));

// ======================================================================
// 6. 入口门廊细化：台阶式内凹拱门
// ======================================================================
// 3层逐渐缩小的box叠套，模拟内凹拱门深度
const archDepths = [0.8, 0.6, 0.4];
const archShrink = [0, 0.4, 0.8];
for (let i = 0; i < archDepths.length; i++) {
  const aw = archW - archShrink[i] * 2;
  const ah = archH - archShrink[i];
  const az = buildingD / 2 - 0.5 - i * 0.6;
  stoneGeoms.push(transformGeometry(createBox(aw, ah, archDepths[i]), 0, ah / 2, az));
}

// 入口两侧倾斜不规则岩石面（用旋转的box模拟）
stoneGeoms.push(transformGeometry(createBox(2.0, 4.0, 1.5), -archW / 2 - 1.0, 2.0, buildingD / 2 + 0.5, 0, 0.2));
stoneGeoms.push(transformGeometry(createBox(2.0, 4.0, 1.5), archW / 2 + 1.0, 2.0, buildingD / 2 + 0.5, 0, -0.2));

// 入口前方2-3级台阶
for (let s = 0; s < 3; s++) {
  const stepW = archW + 2 - s * 0.3;
  const stepD = 1.2;
  const stepH = 0.25;
  const stepZ = buildingD / 2 + 1.0 + (2 - s) * stepD;
  stoneGeoms.push(transformGeometry(createBox(stepW, stepH, stepD), 0, stepH / 2 + s * stepH, stepZ));
}

// ======================================================================
// 7. 屋顶细节：瓦片层 + 排水石槽
// ======================================================================
// 屋顶上不规则瓦片层（2-3层薄box错开排列）
for (let layer = 0; layer < 3; layer++) {
  const tileCount = 5 + layer * 2;
  const tileStartX = -buildingW / 2 + 3 + layer * 1.5;
  const tileW = 5, tileH = 0.15, tileD = 3;
  for (let t = 0; t < tileCount; t++) {
    const tx = tileStartX + t * (tileW + 0.5);
    if (tx + tileW / 2 > buildingW / 2 - 1) continue;
    const tz = -buildingD / 4 + (layer % 2) * buildingD / 4;
    stoneGeoms.push(transformGeometry(createBox(tileW, tileH, tileD), tx, buildingH + 1.0 + layer * 0.2, tz, 0, (layer % 2) * 0.05));
  }
}

// 屋顶边缘排水石槽装饰（前后各一条）
stoneGeoms.push(transformGeometry(createBox(buildingW - 2, 0.3, 0.5), 0, buildingH + 0.85, buildingD / 2 - 0.25));
stoneGeoms.push(transformGeometry(createBox(buildingW - 2, 0.3, 0.5), 0, buildingH + 0.85, -buildingD / 2 + 0.25));

// ======================================================================
// 8. 装饰细节：骷髅装饰（入口上方）
// ======================================================================
// 骷髅头颅（sphere）
stoneGeoms.push(transformGeometry(createSphere(0.5, 8), 0, archH + 1.5, buildingD / 2 - 0.1));
// 交叉骨头（2个小cylinder旋转交叉）
metalGeoms.push(transformGeometry(createCylinder(0.08, 0.08, 1.6, 6), -0.4, archH + 0.8, buildingD / 2 - 0.1, 0, 0.6));
metalGeoms.push(transformGeometry(createCylinder(0.08, 0.08, 1.6, 6), 0.4, archH + 0.8, buildingD / 2 - 0.1, 0, -0.6));

// ======================================================================
// 9. 围墙铁环装饰（2-3个扁cylinder）
// ======================================================================
const ironRingPositions = [
  [-buildingW / 2 + 0.5, 3.5, buildingD / 2 + 2],
  [-buildingW / 2 + 0.5, 3.5, buildingD / 2 + 6],
  [buildingW / 2 - 0.5, 3.5, buildingD / 2 + 4],
];
for (const [rx, ry, rz] of ironRingPositions) {
  metalGeoms.push(transformGeometry(createCylinder(0.35, 0.35, 0.06, 12), rx, ry, rz, Math.PI / 2, 0));
}

// ======================================================================
// 10. weathered_wood: 入口木立柱
// ======================================================================
const postR = 0.4, postH = 9;
weatheredGeoms.push(transformGeometry(createCylinder(postR, postR, postH, 12), -archW / 2, postH / 2, buildingD / 2));
weatheredGeoms.push(transformGeometry(createCylinder(postR, postR, postH, 12), archW / 2, postH / 2, buildingD / 2));

// ======================================================================
// 11. weathered_wood: 右侧木栏
// ======================================================================
const fenceX = buildingW / 2 + 0.8;
const fencePosts = 8;
const fenceStartZ = buildingD / 2 + 1;
const fenceEndZ = buildingD / 2 + 11;
for (let i = 0; i < fencePosts; i++) {
  const t = i / (fencePosts - 1);
  const z = fenceStartZ + t * (fenceEndZ - fenceStartZ);
  weatheredGeoms.push(transformGeometry(createCylinder(0.075, 0.075, 1.2, 6), fenceX, 0.6, z));
}
// 横木
weatheredGeoms.push(transformGeometry(createBox(0.08, 0.08, fenceEndZ - fenceStartZ), fenceX, 0.9, (fenceStartZ + fenceEndZ) / 2));
weatheredGeoms.push(transformGeometry(createBox(0.08, 0.08, fenceEndZ - fenceStartZ), fenceX, 1.3, (fenceStartZ + fenceEndZ) / 2));

// ======================================================================
// 12. metal: 灯笼（增强到14个，含暖光球体）
// ======================================================================
// 入口两侧道路灯笼（原有6个位置）
const lanternXs = [-11, -8, -5, 5, 8, 11];
const lanternZ = buildingD / 2 + 2.5;
for (const lx of lanternXs) {
  const side = lx < 0 ? -1 : 1;
  // 竖柱
  metalGeoms.push(transformGeometry(createBox(0.08, 1.5, 0.08), lx, 0.75, lanternZ));
  // 斜撑
  metalGeoms.push(transformGeometry(createBox(0.06, 1.4, 0.06), lx - side * 0.15, 0.7, lanternZ, 0, side * 0.15));
  // 横臂
  metalGeoms.push(transformGeometry(createBox(0.5, 0.06, 0.06), lx + side * 0.25, 1.5, lanternZ));
  // 灯笼球体（暖光材质）
  warmLightGeoms.push(transformGeometry(createSphere(0.15, 6), lx + side * 0.45, 1.35, lanternZ));
  // 金属小环（顶）
  metalGeoms.push(transformGeometry(createCylinder(0.03, 0.03, 0.08, 6), lx + side * 0.45, 1.5, lanternZ));
}

// 围墙顶部灯笼（4个，沿左墙）
const wallLanternZs = [2, 5, 8, 11];
for (const wz of wallLanternZs) {
  const wx = -buildingW / 2 - 0.3;
  const wy = buildingH * 0.6;
  // 竖柱
  metalGeoms.push(transformGeometry(createBox(0.06, 0.8, 0.06), wx, wy + 0.4, wz));
  // 横臂
  metalGeoms.push(transformGeometry(createBox(0.3, 0.04, 0.04), wx + 0.15, wy + 0.8, wz));
  // 灯笼球体
  warmLightGeoms.push(transformGeometry(createSphere(0.12, 6), wx + 0.3, wy + 0.65, wz));
}

// 侧翼建筑门前灯笼（2个）
const wingLanternPos = [
  [buildingW / 2 + 6, 3.5, buildingD / 2 + 3],
  [buildingW / 2 + 14, 3.5, buildingD / 2 + 3],
];
for (const [wlx, wly, wlz] of wingLanternPos) {
  // 竖柱
  metalGeoms.push(transformGeometry(createBox(0.06, 1.2, 0.06), wlx, wly - 0.6, wlz));
  // 灯笼球体
  warmLightGeoms.push(transformGeometry(createSphere(0.13, 6), wlx, wly + 0.15, wlz));
}

// 入口拱门内灯笼（2个，挂在高处）
for (const sideSign of [-1, 1]) {
  const ilx = sideSign * 2.5;
  const ily = archH - 0.5;
  const ilz = buildingD / 2 - 1.5;
  metalGeoms.push(transformGeometry(createCylinder(0.02, 0.02, 0.6, 6), ilx, ily + 0.3, ilz));
  warmLightGeoms.push(transformGeometry(createSphere(0.14, 6), ilx, ily - 0.1, ilz));
}

// ======================================================================
// 13. banner: 横幅
// ======================================================================
bannerGeoms.push(transformGeometry(createBox(16, 4.5, 0.05), -0.3, 27.3, 3));

// ======================================================================
// 13b. 骷髅旗帜（桅杆顶部）
// ======================================================================
// 旗杆（细竖杆，从桅杆顶端延伸）
metalGeoms.push(transformGeometry(createCylinder(0.06, 0.06, 6, 8), 0, 42, 3));
// 旗帜布面（黑色，用banner材质）
bannerGeoms.push(transformGeometry(createBox(4.5, 3.0, 0.04), 2.5, 43, 3));
// 骷髅头（白色sphere在旗帜正面）
stoneGeoms.push(transformGeometry(createSphere(0.6, 8), 2.5, 43.3, 3.06));
// 交叉骨头（2根白色小cylinder）
stoneGeoms.push(transformGeometry(createCylinder(0.07, 0.07, 2.0, 6), 2.5, 42.5, 3.06, 0, 0.5));
stoneGeoms.push(transformGeometry(createCylinder(0.07, 0.07, 2.0, 6), 2.5, 42.5, 3.06, 0, -0.5));

// ======================================================================
// 14. 船帆/破布（从横桁下方悬挂）
// ======================================================================
// yard1下方的主帆（3片薄box，略旋转模拟褶皱）
const sailYard1Y = 25 + 4.67 * Math.cos(8 * Math.PI / 180); // approximate yard1 Y
const sailYard1X = -4.67 * Math.sin(8 * Math.PI / 180);
const sail1CenterX = 0 + sailYard1X;
const sail1CenterY = sailYard1Y - 2;
const sail1Z = 3;

for (let si = 0; si < 3; si++) {
  const sx = sail1CenterX + (si - 1) * 2.5;
  const rotAmount = (si - 1) * 0.08; // slight rotation for fabric feel
  bannerGeoms.push(transformGeometry(
    createBox(3.5, 4.0, 0.03),
    sx, sail1CenterY, sail1Z,
    0, rotAmount
  ));
}

// yard2下方的副帆（2片薄box）
const sail2CenterY = 25 - 2.5;
for (let si = 0; si < 2; si++) {
  const sx = (si - 0.5) * 2.0;
  bannerGeoms.push(transformGeometry(
    createBox(2.5, 3.0, 0.03),
    sx, sail2CenterY, sail1Z,
    0, (si - 0.5) * 0.1
  ));
}

// ======================================================================
// 15. 绳索/缆绳（从桅杆顶端到建筑左右两侧）
// ======================================================================
// 6条缆绳：从桅杆顶端到建筑两侧不同位置
const mastTopY = 25 + 14; // mast center 25 + half height 14
const mastTopX = 0;
const mastTopZ = 3;

const ropeEndpoints = [
  // 左侧3条
  [-buildingW / 2, buildingH + 1, buildingD / 2],
  [-buildingW / 2, buildingH * 0.7, 0],
  [-buildingW / 2 - 2, buildingH + 1, -buildingD / 2],
  // 右侧3条
  [buildingW / 2, buildingH + 1, buildingD / 2],
  [buildingW / 2, buildingH * 0.7, 0],
  [buildingW / 2 + 2, buildingH + 1, -buildingD / 2],
];

for (const [ex, ey, ez] of ropeEndpoints) {
  // 用细cylinder近似直线缆绳
  const dx = ex - mastTopX;
  const dy = ey - mastTopY;
  const dz = ez - mastTopZ;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // 中点位置
  const mx = (mastTopX + ex) / 2;
  const my = (mastTopY + ey) / 2;
  const mz = (mastTopZ + ez) / 2;
  // 旋转角度
  const rotYAngle = Math.atan2(dx, dz);
  const rotZAngle = Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz));
  metalGeoms.push(transformGeometry(
    createCylinder(0.03, 0.03, len, 6),
    mx, my, mz,
    rotYAngle, rotZAngle
  ));
}

// ======================================================================
// 16. 棕榈树（4棵）
// ======================================================================
function addPalmTree(px, pz, trunkH, leanAngle, leanDir) {
  // 树干：弯曲的圆锥体（用rotZ模拟倾斜）
  palmTrunkGeoms.push(transformGeometry(
    createCylinder(0.25, 0.6, trunkH, 10),
    px, trunkH / 2, pz,
    leanDir, leanAngle
  ));

  // 计算树干顶部位置（近似）
  const topX = px + Math.sin(leanAngle) * Math.cos(leanDir) * trunkH * 0.5;
  const topY = trunkH * Math.cos(leanAngle) * 0.9;
  const topZ = pz + Math.sin(leanAngle) * Math.sin(leanDir) * trunkH * 0.5;

  // 顶部叶片：8个薄长box从中心向外辐射+倾斜
  const leafCount = 8;
  for (let li = 0; li < leafCount; li++) {
    const angle = (li / leafCount) * Math.PI * 2;
    const leafLen = 4.5 + Math.random() * 1.5;
    const leafW = 0.8;
    const leafThick = 0.06;
    const droopAngle = 0.5 + Math.random() * 0.3; // 下垂角度

    // 叶片中心位置
    const leafCx = topX + Math.cos(angle) * leafLen * 0.4;
    const leafCy = topY - Math.sin(droopAngle) * leafLen * 0.3;
    const leafCz = topZ + Math.sin(angle) * leafLen * 0.4;

    palmLeafGeoms.push(transformGeometry(
      createBox(leafLen, leafThick, leafW),
      leafCx, leafCy, leafCz,
      angle, droopAngle
    ));
  }
}

// 入口左侧棕榈树
addPalmTree(-10, buildingD / 2 + 6, 10, 0.15, 0);
// 入口右侧棕榈树
addPalmTree(12, buildingD / 2 + 7, 9, 0.12, Math.PI);
// 右侧区域棕榈树
addPalmTree(buildingW / 2 + 8, buildingD / 2 + 5, 11, 0.18, Math.PI * 0.7);
// 远处右侧棕榈树
addPalmTree(buildingW / 2 + 15, buildingD / 2 + 2, 8, 0.1, Math.PI * 1.3);

// ======================================================================
// 17. 侧翼建筑（右侧低矮附属建筑，2栋）
// ======================================================================
// 第一栋
const wing1W = 9, wing1H = 6, wing1D = 7;
const wing1X = buildingW / 2 + wing1W / 2 + 1;
const wing1Z = buildingD / 2 + wing1D / 2 - 2;
stoneGeoms.push(transformGeometry(createBox(wing1W, wing1H, wing1D), wing1X, wing1H / 2, wing1Z));

// 第一栋斜屋顶（用两个旋转的box组合成三角）
const roof1W = wing1W + 1;
const roof1D = wing1D + 1;
const roof1H = 3.0;
// 屋顶左半
roofTileGeoms.push(transformGeometry(createBox(roof1W, 0.3, roof1D * 0.6), wing1X, wing1H + roof1H * 0.5, wing1Z, 0, 0.45));
// 屋顶右半
roofTileGeoms.push(transformGeometry(createBox(roof1W, 0.3, roof1D * 0.6), wing1X, wing1H + roof1H * 0.5, wing1Z, 0, -0.45));
// 屋顶脊梁
roofTileGeoms.push(transformGeometry(createBox(roof1W + 0.5, 0.3, 0.4), wing1X, wing1H + roof1H * 0.8, wing1Z));

// 第二栋
const wing2W = 8, wing2H = 5, wing2D = 6;
const wing2X = wing1X + wing1W / 2 + wing2W / 2 + 1;
const wing2Z = wing1Z - 2;
stoneGeoms.push(transformGeometry(createBox(wing2W, wing2H, wing2D), wing2X, wing2H / 2, wing2Z));

// 第二栋斜屋顶
const roof2W = wing2W + 1;
const roof2D = wing2D + 1;
const roof2H = 2.5;
roofTileGeoms.push(transformGeometry(createBox(roof2W, 0.3, roof2D * 0.6), wing2X, wing2H + roof2H * 0.5, wing2Z, 0, 0.45));
roofTileGeoms.push(transformGeometry(createBox(roof2W, 0.3, roof2D * 0.6), wing2X, wing2H + roof2H * 0.5, wing2Z, 0, -0.45));
roofTileGeoms.push(transformGeometry(createBox(roof2W + 0.5, 0.3, 0.4), wing2X, wing2H + roof2H * 0.8, wing2Z));

// ============================================================
// 将分组几何合并为 Primitive
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

const stonePrim = makePrimitive(stoneGeoms, matStone);
const weatheredPrim = makePrimitive(weatheredGeoms, matWeatheredWood);
const metalPrim = makePrimitive(metalGeoms, matMetal);
const bannerPrim = makePrimitive(bannerGeoms, matBanner);
const copperPatinaPrim = makePrimitive(copperPatinaGeoms, matCopperPatina);
const roofTilePrim = makePrimitive(roofTileGeoms, matRoofTile);
const warmLightPrim = makePrimitive(warmLightGeoms, matWarmLight);
const palmTrunkPrim = makePrimitive(palmTrunkGeoms, matPalmTrunk);
const palmLeafPrim = makePrimitive(palmLeafGeoms, matPalmLeaf);

const stoneMesh = doc.createMesh().addPrimitive(stonePrim);
const weatheredMesh = doc.createMesh().addPrimitive(weatheredPrim);
const metalMesh = doc.createMesh().addPrimitive(metalPrim);
const bannerMesh = doc.createMesh().addPrimitive(bannerPrim);
const copperPatinaMesh = doc.createMesh().addPrimitive(copperPatinaPrim);
const roofTileMesh = doc.createMesh().addPrimitive(roofTilePrim);
const warmLightMesh = doc.createMesh().addPrimitive(warmLightPrim);
const palmTrunkMesh = doc.createMesh().addPrimitive(palmTrunkPrim);
const palmLeafMesh = doc.createMesh().addPrimitive(palmLeafPrim);

// ============================================================
// 桅杆结构（独立 Node，带旋转）
// ============================================================

function makeMeshFromGeom(geom, material) {
  const posAcc = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(geom.positions);
  const normAcc = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(geom.normals);
  const idxAcc = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(geom.indices);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setIndices(idxAcc)
    .setMaterial(material);
  return doc.createMesh().addPrimitive(prim);
}

// 主桅杆：高28m，中心Y=25
const mastGeom = createCylinder(0.35, 0.35, 28, 16);
const mastMesh = makeMeshFromGeom(mastGeom, matDarkWood);

// 横桁1：长16m，中心在桅杆2/3高处
const yard1Geom = createCylinder(0.25, 0.25, 16, 14);
const yard1Mesh = makeMeshFromGeom(yard1Geom, matDarkWood);

// 横桁2：长10m，中心在桅杆1/2高处
const yard2Geom = createCylinder(0.2, 0.2, 10, 12);
const yard2Mesh = makeMeshFromGeom(yard2Geom, matDarkWood);

// 四元数计算辅助
function quatFromYZ(yDeg, zDeg) {
  const y2 = (yDeg * Math.PI / 180) / 2;
  const z2 = (zDeg * Math.PI / 180) / 2;
  const sy = Math.sin(y2), cy = Math.cos(y2);
  const sz = Math.sin(z2), cz = Math.cos(z2);
  return [
    sy * sz,   // x
    sy * cz,   // y
    cy * sz,   // z
    cy * cz,   // w
  ];
}

function quatFromZ(zDeg) {
  const z2 = (zDeg * Math.PI / 180) / 2;
  return [0, 0, Math.sin(z2), Math.cos(z2)];
}

// 桅杆位置与旋转
const mastNode = doc.createNode('mast')
  .setMesh(mastMesh)
  .setTranslation([0, 25, 3])
  .setRotation(quatFromYZ(5, 8));

// 横桁1 位置计算（桅杆2/3高处）
const y1_local = 28 * (2 / 3) - 14;
const sin8 = Math.sin(8 * Math.PI / 180), cos8 = Math.cos(8 * Math.PI / 180);
const sin5 = Math.sin(5 * Math.PI / 180), cos5 = Math.cos(5 * Math.PI / 180);
let mx = -y1_local * sin8;
let my = y1_local * cos8;
let mz = 0;
let mx2 = mx * cos5 + mz * sin5;
let mz2 = -mx * sin5 + mz * cos5;
mx = mx2; mz = mz2;
const yard1Pos = [0 + mx, 25 + my, 3 + mz];

const yard1Node = doc.createNode('yard1')
  .setMesh(yard1Mesh)
  .setTranslation(yard1Pos)
  .setRotation(quatFromZ(-15));

// 横桁2 位置计算（桅杆1/2高处，即中心）
const yard2Pos = [0, 25, 3];

const yard2Node = doc.createNode('yard2')
  .setMesh(yard2Mesh)
  .setTranslation(yard2Pos)
  .setRotation(quatFromZ(-20));

// ============================================================
// 组装场景
// ============================================================

const stoneNode = doc.createNode('stone_building').setMesh(stoneMesh);
const weatheredNode = doc.createNode('weathered_wood').setMesh(weatheredMesh);
const metalNode = doc.createNode('metal_lanterns').setMesh(metalMesh);
const bannerNode = doc.createNode('banner').setMesh(bannerMesh);
const copperPatinaNode = doc.createNode('copper_patina').setMesh(copperPatinaMesh);
const roofTileNode = doc.createNode('roof_tile').setMesh(roofTileMesh);
const warmLightNode = doc.createNode('warm_light').setMesh(warmLightMesh);
const palmTrunkNode = doc.createNode('palm_trunks').setMesh(palmTrunkMesh);
const palmLeafNode = doc.createNode('palm_leaves').setMesh(palmLeafMesh);

const scene = doc.createScene('pirates_scene')
  .addChild(stoneNode)
  .addChild(weatheredNode)
  .addChild(metalNode)
  .addChild(bannerNode)
  .addChild(copperPatinaNode)
  .addChild(roofTileNode)
  .addChild(warmLightNode)
  .addChild(palmTrunkNode)
  .addChild(palmLeafNode)
  .addChild(mastNode)
  .addChild(yard1Node)
  .addChild(yard2Node);

doc.getRoot().setDefaultScene(scene);

// ============================================================
// 统计信息
// ============================================================

let totalTris = 0;
totalTris += stoneGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += weatheredGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += metalGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += bannerGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += copperPatinaGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += roofTileGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += warmLightGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += palmTrunkGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += palmLeafGeoms.reduce((s, g) => s + countTriangles(g), 0);
totalTris += countTriangles(mastGeom);
totalTris += countTriangles(yard1Geom);
totalTris += countTriangles(yard2Geom);

const info = {
  totalTriangles: totalTris,
  stoneTriangles: stoneGeoms.reduce((s, g) => s + countTriangles(g), 0),
  weatheredTriangles: weatheredGeoms.reduce((s, g) => s + countTriangles(g), 0),
  metalTriangles: metalGeoms.reduce((s, g) => s + countTriangles(g), 0),
  bannerTriangles: bannerGeoms.reduce((s, g) => s + countTriangles(g), 0),
  copperPatinaTriangles: copperPatinaGeoms.reduce((s, g) => s + countTriangles(g), 0),
  roofTileTriangles: roofTileGeoms.reduce((s, g) => s + countTriangles(g), 0),
  warmLightTriangles: warmLightGeoms.reduce((s, g) => s + countTriangles(g), 0),
  palmTrunkTriangles: palmTrunkGeoms.reduce((s, g) => s + countTriangles(g), 0),
  palmLeafTriangles: palmLeafGeoms.reduce((s, g) => s + countTriangles(g), 0),
  mastTriangles: countTriangles(mastGeom) + countTriangles(yard1Geom) + countTriangles(yard2Geom),
};

// ============================================================
// 导出
// ============================================================

const OUTPUT_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/tools/pirates_source.glb';

const io = new NodeIO();
await io.write(OUTPUT_PATH, doc);

console.log('GLB generated:', OUTPUT_PATH);
console.log('Stats:', JSON.stringify(info, null, 2));

// 同时写 info json 供后续脚本使用
writeFileSync(OUTPUT_PATH.replace('.glb', '_info.json'), JSON.stringify(info, null, 2));
