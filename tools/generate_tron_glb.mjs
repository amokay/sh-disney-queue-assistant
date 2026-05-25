import { Document, NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'fs';

// ============================================================
// 几何辅助函数
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
    0,1,2, 0,2,3,   4,5,6, 4,6,7,   8,9,10, 8,10,11,
    12,13,14, 12,14,15,   16,17,18, 16,18,19,   20,21,22, 20,22,23,
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
  const positions = [];
  const normals = [];
  const indices = [];
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
      const first = lat * (segments + 1) + lon, second = first + segments + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
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

function countTriangles(geom) { return geom.indices.length / 3; }

// ============================================================
// 向量辅助函数
// ============================================================

function vec3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vec3Add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function vec3Scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vec3Len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
function vec3Normalize(a) {
  const l = vec3Len(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}
function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// ============================================================
// Catmull-Rom 样条插值
// ============================================================

function catmullRomPoint(p0, p1, p2, p3, t) {
  const tt = t * t, ttt = tt * t;
  const q = 0.5;
  const b1 = q * (-ttt + 2 * tt - t);
  const b2 = q * (-ttt + tt) + (2 * ttt - 3 * tt + 1);
  const b3 = q * (ttt - 2 * tt + t) + (-2 * ttt + 3 * tt);
  const b4 = q * (ttt - tt);
  return [
    b1 * p0[0] + b2 * p1[0] + b3 * p2[0] + b4 * p3[0],
    b1 * p0[1] + b2 * p1[1] + b3 * p2[1] + b4 * p3[1],
    b1 * p0[2] + b2 * p1[2] + b3 * p2[2] + b4 * p3[2],
  ];
}

function catmullRomSpline(controlPoints, segmentsPerSpan) {
  const pts = [];
  const n = controlPoints.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[Math.min(n - 1, i + 1)];
    const p3 = controlPoints[Math.min(n - 1, i + 2)];
    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      pts.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }
  pts.push(controlPoints[n - 1]);
  return pts;
}

// ============================================================
// 核心 — 飘带生成函数
// ============================================================

/**
 * 沿3D路径生成飘带状曲面
 * @param {Array} controlPoints - 控制点数组 [[x,y,z], ...]，至少4个点
 * @param {number} width - 飘带宽度
 * @param {number} thickness - 飘带厚度
 * @param {number} segments - 细分段数（越多越光滑）
 * @param {number} twistAngle - 沿路径的总扭转角度（弧度）
 */
function createRibbon(controlPoints, width, thickness, segments, twistAngle = 0) {
  const positions = [];
  const normals = [];
  const indices = [];

  // 生成样条上的细分点
  const segmentsPerSpan = Math.ceil(segments / (controlPoints.length - 1));
  const splinePts = catmullRomSpline(controlPoints, segmentsPerSpan);

  // 重采样到 segments+1 个均匀点
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const idx = t * (splinePts.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, splinePts.length - 1);
    const frac = idx - lo;
    pts.push([
      splinePts[lo][0] + frac * (splinePts[hi][0] - splinePts[lo][0]),
      splinePts[lo][1] + frac * (splinePts[hi][1] - splinePts[lo][1]),
      splinePts[lo][2] + frac * (splinePts[hi][2] - splinePts[lo][2]),
    ]);
  }

  const hw = width / 2;
  const ht = thickness / 2;

  // 计算每个样条点的局部坐标系（Frenet-like帧）
  const frames = [];
  let prevUp = [0, 1, 0];

  for (let i = 0; i <= segments; i++) {
    let tangent;
    if (i === 0) tangent = vec3Normalize(vec3Sub(pts[1], pts[0]));
    else if (i === segments) tangent = vec3Normalize(vec3Sub(pts[segments], pts[segments - 1]));
    else tangent = vec3Normalize(vec3Sub(pts[i + 1], pts[i - 1]));

    let normal = vec3Cross(tangent, prevUp);
    let nLen = vec3Len(normal);
    if (nLen < 1e-6) {
      const altUp = Math.abs(tangent[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
      normal = vec3Cross(tangent, altUp);
      nLen = vec3Len(normal);
    }
    normal = vec3Normalize(normal);
    let binormal = vec3Normalize(vec3Cross(tangent, normal));
    prevUp = normal;
    frames.push({ tangent, normal, binormal });
  }

  // 为每个样条点计算4个截面角点（含扭转）
  // 角点顺序: 0=外右, 1=外左, 2=内左, 3=内右
  const corners = [];
  for (let i = 0; i <= segments; i++) {
    const { normal, binormal } = frames[i];
    const twist = twistAngle * (i / segments);
    const ct = Math.cos(twist), st = Math.sin(twist);
    const rn = vec3Add(vec3Scale(normal, ct), vec3Scale(binormal, st));
    const rb = vec3Add(vec3Scale(normal, -st), vec3Scale(binormal, ct));

    const p = pts[i];
    corners.push([
      vec3Add(vec3Add(p, vec3Scale(rn, ht)), vec3Scale(rb, hw)),  // 0: 外右
      vec3Add(vec3Sub(p, vec3Scale(rb, hw)), vec3Scale(rn, ht)),  // 1: 外左
      vec3Add(vec3Sub(p, vec3Scale(rb, hw)), vec3Scale(rn, -ht)), // 2: 内左
      vec3Add(vec3Add(p, vec3Scale(rn, -ht)), vec3Scale(rb, hw)), // 3: 内右
    ]);
  }

  let vOff = 0;

  // 连接相邻截面生成4个侧面
  for (let i = 0; i < segments; i++) {
    const c0 = corners[i];
    const c1 = corners[i + 1];
    const f0 = frames[i];
    const f1 = frames[i + 1];

    // 外侧面（top face）: 角0,1 -> next 0,1
    const topN = vec3Normalize(vec3Add(f0.normal, f1.normal));
    positions.push(...c0[0], ...c0[1], ...c1[0], ...c1[1]);
    normals.push(...topN, ...topN, ...topN, ...topN);
    indices.push(vOff, vOff + 2, vOff + 1, vOff + 1, vOff + 2, vOff + 3);
    vOff += 4;

    // 内侧面（bottom face）: 角2,3 -> next 2,3
    const botN = vec3Normalize(vec3Add(vec3Scale(f0.normal, -1), vec3Scale(f1.normal, -1)));
    positions.push(...c0[2], ...c0[3], ...c1[2], ...c1[3]);
    normals.push(...botN, ...botN, ...botN, ...botN);
    indices.push(vOff, vOff + 1, vOff + 2, vOff + 1, vOff + 3, vOff + 2);
    vOff += 4;

    // 左侧面（-binormal）: 角1,2 -> next 1,2
    const leftN = vec3Normalize(vec3Add(vec3Scale(f0.binormal, -1), vec3Scale(f1.binormal, -1)));
    positions.push(...c0[1], ...c0[2], ...c1[1], ...c1[2]);
    normals.push(...leftN, ...leftN, ...leftN, ...leftN);
    indices.push(vOff, vOff + 2, vOff + 1, vOff + 1, vOff + 2, vOff + 3);
    vOff += 4;

    // 右侧面（+binormal）: 角3,0 -> next 3,0
    const rightN = vec3Normalize(vec3Add(f0.binormal, f1.binormal));
    positions.push(...c0[3], ...c0[0], ...c1[3], ...c1[0]);
    normals.push(...rightN, ...rightN, ...rightN, ...rightN);
    indices.push(vOff, vOff + 1, vOff + 2, vOff + 1, vOff + 3, vOff + 2);
    vOff += 4;
  }

  // 起始端盖
  const sc = corners[0];
  positions.push(...sc[0], ...sc[1], ...sc[2], ...sc[3]);
  const startN = vec3Scale(frames[0].tangent, -1);
  normals.push(...startN, ...startN, ...startN, ...startN);
  indices.push(vOff, vOff + 2, vOff + 1, vOff, vOff + 3, vOff + 2);
  vOff += 4;

  // 终止端盖
  const ec = corners[segments];
  positions.push(...ec[0], ...ec[1], ...ec[2], ...ec[3]);
  const endN = frames[segments].tangent;
  normals.push(...endN, ...endN, ...endN, ...endN);
  indices.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// ============================================================
// 飘带下表面发光面板
// ============================================================

function createRibbonGlowPanel(controlPoints, width, thickness, segments, twistAngle = 0) {
  const positions = [];
  const normals = [];
  const indices = [];

  const panelWidth = width * 0.7;
  const hw = panelWidth / 2;
  const offset = thickness / 2 + 0.05;

  const segmentsPerSpan = Math.ceil(segments / (controlPoints.length - 1));
  const splinePts = catmullRomSpline(controlPoints, segmentsPerSpan);

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const idx = t * (splinePts.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, splinePts.length - 1);
    const frac = idx - lo;
    pts.push([
      splinePts[lo][0] + frac * (splinePts[hi][0] - splinePts[lo][0]),
      splinePts[lo][1] + frac * (splinePts[hi][1] - splinePts[lo][1]),
      splinePts[lo][2] + frac * (splinePts[hi][2] - splinePts[lo][2]),
    ]);
  }

  const frames = [];
  let prevUp = [0, 1, 0];
  for (let i = 0; i <= segments; i++) {
    let tangent;
    if (i === 0) tangent = vec3Normalize(vec3Sub(pts[1], pts[0]));
    else if (i === segments) tangent = vec3Normalize(vec3Sub(pts[segments], pts[segments - 1]));
    else tangent = vec3Normalize(vec3Sub(pts[i + 1], pts[i - 1]));

    let normal = vec3Cross(tangent, prevUp);
    let nLen = vec3Len(normal);
    if (nLen < 1e-6) {
      const altUp = Math.abs(tangent[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
      normal = vec3Cross(tangent, altUp);
      nLen = vec3Len(normal);
    }
    normal = vec3Normalize(normal);
    let binormal = vec3Normalize(vec3Cross(tangent, normal));
    prevUp = normal;
    frames.push({ tangent, normal, binormal });
  }

  // 生成面板顶点（只在下表面，偏移 offset）
  for (let i = 0; i <= segments; i++) {
    const { normal, binormal } = frames[i];
    const twist = twistAngle * (i / segments);
    const ct = Math.cos(twist), st = Math.sin(twist);
    const rn = vec3Add(vec3Scale(normal, ct), vec3Scale(binormal, st));
    const rb = vec3Add(vec3Scale(normal, -st), vec3Scale(binormal, ct));

    const p = vec3Add(pts[i], vec3Scale(rn, -offset));
    positions.push(
      ...vec3Add(p, vec3Scale(rb, hw)),   // 右
      ...vec3Sub(p, vec3Scale(rb, hw)),   // 左
    );
    const faceN = vec3Scale(rn, -1);
    normals.push(...faceN, ...faceN);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// ============================================================
// 椭圆盘（底座平台用）
// ============================================================

function createEllipticDisc(radiusX, radiusZ, height, segments) {
  const positions = [];
  const normals = [];
  const indices = [];
  const h2 = height / 2;

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const c = Math.cos(theta), s = Math.sin(theta);
    let nx = c / radiusX, nz = s / radiusZ;
    const nLen = Math.sqrt(nx * nx + nz * nz);
    nx /= nLen; nz /= nLen;
    positions.push(radiusX * c, h2, radiusZ * s);   normals.push(nx, 0, nz);
    positions.push(radiusX * c, -h2, radiusZ * s);  normals.push(nx, 0, nz);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }

  let base = positions.length / 3;
  positions.push(0, h2, 0); normals.push(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusX * Math.cos(theta), h2, radiusZ * Math.sin(theta));
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));

  base = positions.length / 3;
  positions.push(0, -h2, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions.push(radiusX * Math.cos(theta), -h2, radiusZ * Math.sin(theta));
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) indices.push(base, base + 1 + ((i + 1) % segments), base + 1 + i);

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// ============================================================
// 两点间梁（圆柱体）
// ============================================================

function createBeamBetween(x1, y1, z1, x2, y2, z2, radius, seg) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 0.01) return createBox(0.01, 0.01, 0.01);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mz = (z1 + z2) / 2;
  const rotZ = Math.atan2(Math.sqrt(dx * dx + dz * dz), dy);
  const rotY = Math.atan2(dz, -dx);
  const geom = createCylinder(radius, radius, length, seg);
  return transformGeometry(geom, mx, my, mz, rotY, rotZ);
}

// ============================================================
// 获取飘带在指定 t 参数处的位置
// ============================================================

function getRibbonPointAt(controlPoints, thickness, segments, twist, t) {
  const segmentsPerSpan = Math.ceil(segments / (controlPoints.length - 1));
  const splinePts = catmullRomSpline(controlPoints, segmentsPerSpan);
  const idx = t * (splinePts.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, splinePts.length - 1);
  const frac = idx - lo;
  return [
    splinePts[lo][0] + frac * (splinePts[hi][0] - splinePts[lo][0]),
    splinePts[lo][1] + frac * (splinePts[hi][1] - splinePts[lo][1]) - thickness / 2,
    splinePts[lo][2] + frac * (splinePts[hi][2] - splinePts[lo][2]),
  ];
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

const matSilverMetal = createMaterial('silver_metal', [0.78, 0.80, 0.84], 0.30, 0.85);
const matDarkMetal   = createMaterial('dark_metal',   [0.22, 0.24, 0.28], 0.35, 0.75);
const matConcrete    = createMaterial('concrete',     [0.50, 0.50, 0.52], 0.90, 0.0);
const matRailing     = createMaterial('railing',      [0.55, 0.58, 0.62], 0.30, 0.80);
const matBlueGlow    = doc.createMaterial('blue_glow')
  .setBaseColorFactor([0.15, 0.5, 1.0, 1.0])
  .setRoughnessFactor(0.15)
  .setMetallicFactor(0.0)
  .setEmissiveFactor([0.15, 0.5, 1.0]);

// ============================================================
// 几何分组（按材质）
// ============================================================

const silverMetalGeoms = [];
const darkMetalGeoms   = [];
const concreteGeoms    = [];
const railingGeoms    = [];
const blueGlowGeoms   = [];

// ============================================================
// 1. 飘带/丝带结构（5条，不对称弧线！）+ 蓝色发光面板
// ============================================================

const ribbonConfigs = [
  {
    name: 'ribbon1_outer',
    controlPoints: [
      [28, 3, 18],
      [15, 22, 10],
      [-5, 30, 0],
      [-20, 20, -10],
      [-32, 4, -16],
    ],
    width: 3.0, thickness: 0.40, segments: 32, twist: Math.PI * 0.1,
  },
  {
    name: 'ribbon2',
    controlPoints: [
      [26, 4, 13],
      [12, 20, 6],
      [-6, 28, -2],
      [-18, 18, -12],
      [-30, 5, -18],
    ],
    width: 2.8, thickness: 0.38, segments: 32, twist: Math.PI * 0.1,
  },
  {
    name: 'ribbon3_center',
    controlPoints: [
      [24, 5, 8],
      [10, 25, 2],
      [-8, 32, -4],
      [-22, 22, -14],
      [-28, 6, -20],
    ],
    width: 3.0, thickness: 0.42, segments: 32, twist: Math.PI * 0.1,
  },
  {
    name: 'ribbon4',
    controlPoints: [
      [22, 3, 3],
      [8, 18, -2],
      [-10, 26, -8],
      [-24, 16, -16],
      [-26, 4, -22],
    ],
    width: 2.6, thickness: 0.36, segments: 32, twist: Math.PI * 0.1,
  },
  {
    name: 'ribbon5_inner',
    controlPoints: [
      [20, 4, -2],
      [6, 16, -5],
      [-12, 24, -12],
      [-26, 14, -18],
      [-24, 3, -24],
    ],
    width: 2.5, thickness: 0.34, segments: 32, twist: Math.PI * 0.1,
  },
];

for (const rc of ribbonConfigs) {
  const ribbonGeom = createRibbon(rc.controlPoints, rc.width, rc.thickness, rc.segments, rc.twist);
  silverMetalGeoms.push(ribbonGeom);

  const glowGeom = createRibbonGlowPanel(rc.controlPoints, rc.width, rc.thickness, rc.segments, rc.twist);
  blueGlowGeoms.push(glowGeom);
}

// ============================================================
// 2. V形支撑柱
// ============================================================

for (const rc of ribbonConfigs) {
  const quarterPts = [
    getRibbonPointAt(rc.controlPoints, rc.thickness, rc.segments, rc.twist, 0.25),
    getRibbonPointAt(rc.controlPoints, rc.thickness, rc.segments, rc.twist, 0.75),
  ];

  for (const qpt of quarterPts) {
    const [qx, qy, qz] = qpt;
    const spreadX = 2.5;
    // 左脚
    darkMetalGeoms.push(createBeamBetween(qx - spreadX, 0, qz, qx, qy, qz, 0.25, 8));
    // 右脚
    darkMetalGeoms.push(createBeamBetween(qx + spreadX, 0, qz, qx, qy, qz, 0.25, 8));
    // 交叉横梁
    const crossY = qy * 0.4;
    darkMetalGeoms.push(createBeamBetween(qx - spreadX * 0.6, crossY, qz, qx + spreadX * 0.6, crossY, qz, 0.12, 6));

    // 支撑柱底部蓝色光环
    blueGlowGeoms.push(transformGeometry(
      createCylinder(0.5, 0.5, 0.12, 10), qx - spreadX, 0.06, qz
    ));
    blueGlowGeoms.push(transformGeometry(
      createCylinder(0.5, 0.5, 0.12, 10), qx + spreadX, 0.06, qz
    ));
  }

  // 中央支撑柱（最高点处）
  const midPt = getRibbonPointAt(rc.controlPoints, rc.thickness, rc.segments, rc.twist, 0.5);
  darkMetalGeoms.push(createBeamBetween(midPt[0], 0, midPt[2], midPt[0], midPt[1], midPt[2], 0.35, 10));
}

// ============================================================
// 3. 入口弯曲步道
// ============================================================

const walkwaySteps = 20;
const walkwayStartZ = 22;
const walkwayEndZ = 5;
const walkwayStartX = 0;
const walkwayEndX = -4;
const walkwayWidth = 5;
const walkwayThickness = 0.25;

for (let i = 0; i < walkwaySteps; i++) {
  const t0 = i / walkwaySteps;
  const t1 = (i + 1) / walkwaySteps;

  const x0 = walkwayStartX + (walkwayEndX - walkwayStartX) * t0;
  const z0 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t0;
  const x1 = walkwayStartX + (walkwayEndX - walkwayStartX) * t1;
  const z1 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t1;
  const xMid = (x0 + x1) / 2;
  const zMid = (z0 + z1) / 2;

  const segLen = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);
  const angle = Math.atan2(z1 - z0, x1 - x0);

  concreteGeoms.push(transformGeometry(
    createBox(segLen, walkwayThickness, walkwayWidth),
    xMid, walkwayThickness / 2, zMid,
    Math.PI / 2 - angle, 0
  ));
}

// ============================================================
// 4. 步道两侧栏杆
// ============================================================

const railPostR = 0.04;
const railPostH = 1.0;
const railSpacing = 1.5;
const totalWalkwayLen = Math.sqrt(
  (walkwayEndX - walkwayStartX) ** 2 + (walkwayEndZ - walkwayStartZ) ** 2
);
const numRailPosts = Math.floor(totalWalkwayLen / railSpacing);

for (let i = 0; i <= numRailPosts; i++) {
  const t = i / numRailPosts;
  const x = walkwayStartX + (walkwayEndX - walkwayStartX) * t;
  const z = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t;

  railingGeoms.push(transformGeometry(
    createCylinder(railPostR, railPostR, railPostH, 6),
    x - walkwayWidth / 2, railPostH / 2 + walkwayThickness, z
  ));
  railingGeoms.push(transformGeometry(
    createCylinder(railPostR, railPostR, railPostH, 6),
    x + walkwayWidth / 2, railPostH / 2 + walkwayThickness, z
  ));
}

// 水平横杆（上下各一根）
for (const side of [-1, 1]) {
  for (const railY of [walkwayThickness + 0.4, walkwayThickness + 0.85]) {
    for (let i = 0; i < walkwaySteps; i++) {
      const t0 = i / walkwaySteps;
      const t1 = (i + 1) / walkwaySteps;
      const x0 = walkwayStartX + (walkwayEndX - walkwayStartX) * t0 + side * walkwayWidth / 2;
      const z0 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t0;
      const x1 = walkwayStartX + (walkwayEndX - walkwayStartX) * t1 + side * walkwayWidth / 2;
      const z1 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t1;
      const xMid = (x0 + x1) / 2;
      const zMid = (z0 + z1) / 2;
      const segLen = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);
      const angle = Math.atan2(z1 - z0, x1 - x0);
      railingGeoms.push(transformGeometry(
        createBox(segLen, 0.04, 0.04),
        xMid, railY, zMid,
        Math.PI / 2 - angle, 0
      ));
    }
  }
}

// 栏杆底部蓝色发光条
for (const side of [-1, 1]) {
  for (let i = 0; i < walkwaySteps; i++) {
    const t0 = i / walkwaySteps;
    const t1 = (i + 1) / walkwaySteps;
    const x0 = walkwayStartX + (walkwayEndX - walkwayStartX) * t0 + side * walkwayWidth / 2;
    const z0 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t0;
    const x1 = walkwayStartX + (walkwayEndX - walkwayStartX) * t1 + side * walkwayWidth / 2;
    const z1 = walkwayStartZ + (walkwayEndZ - walkwayStartZ) * t1;
    const xMid = (x0 + x1) / 2;
    const zMid = (z0 + z1) / 2;
    const segLen = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);
    const angle = Math.atan2(z1 - z0, x1 - x0);
    blueGlowGeoms.push(transformGeometry(
      createBox(segLen, 0.05, 0.08),
      xMid, walkwayThickness + 0.03, zMid,
      Math.PI / 2 - angle, 0
    ));
  }
}

// ============================================================
// 5. 底座平台
// ============================================================

concreteGeoms.push(transformGeometry(createEllipticDisc(35, 25, 0.6, 28), -2, -0.3, 0));

// ============================================================
// 6. TRON 标识牌
// ============================================================

darkMetalGeoms.push(transformGeometry(createBox(7, 3, 0.15), 8, 4, 18));
blueGlowGeoms.push(transformGeometry(createBox(6.5, 2.5, 0.05), 8, 4, 18.1));
darkMetalGeoms.push(transformGeometry(createCylinder(0.15, 0.15, 4, 8), 8, 2, 18));

// ============================================================
// 7. 飘带端部蓝色发光标记
// ============================================================

for (const rc of ribbonConfigs) {
  const startPt = rc.controlPoints[0];
  const endPt = rc.controlPoints[rc.controlPoints.length - 1];

  blueGlowGeoms.push(transformGeometry(
    createBox(0.1, 1.0, rc.width * 0.7), startPt[0], startPt[1] + 0.5, startPt[2]
  ));
  blueGlowGeoms.push(transformGeometry(
    createBox(0.1, 1.0, rc.width * 0.7), endPt[0], endPt[1] + 0.5, endPt[2]
  ));
}

// ============================================================
// 半球穹顶辅助函数
// ============================================================

function createHemisphere(radiusX, radiusY, radiusZ, segments = 20) {
  const positions = [];
  const normals = [];
  const indices = [];
  const halfSegs = Math.ceil(segments / 2);
  for (let lat = 0; lat <= halfSegs; lat++) {
    const theta = (lat / segments) * Math.PI;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * Math.PI * 2;
      const nx = Math.cos(phi) * sinT;
      const ny = cosT;
      const nz = Math.sin(phi) * sinT;
      positions.push(radiusX * nx, radiusY * ny, radiusZ * nz);
      normals.push(nx, ny, nz);
    }
  }
  for (let lat = 0; lat < halfSegs; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const first = lat * (segments + 1) + lon;
      const second = first + segments + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// ============================================================
// 蓝色穹顶（覆盖飘带下方的半透明穹顶）
// ============================================================

const domeGeom = createHemisphere(34, 35, 26, 24);
blueGlowGeoms.push(transformGeometry(domeGeom, -2, 0.5, -2));

// ============================================================
// 合并几何 → 创建 Primitive
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

const silverPrim   = makePrimitive(silverMetalGeoms, matSilverMetal);
const darkPrim     = makePrimitive(darkMetalGeoms,   matDarkMetal);
const concretePrim = makePrimitive(concreteGeoms,    matConcrete);
const railingPrim = makePrimitive(railingGeoms,     matRailing);
const glowPrim    = makePrimitive(blueGlowGeoms,    matBlueGlow);

const silverMesh   = doc.createMesh().addPrimitive(silverPrim);
const darkMesh     = doc.createMesh().addPrimitive(darkPrim);
const concreteMesh = doc.createMesh().addPrimitive(concretePrim);
const railingMesh = doc.createMesh().addPrimitive(railingPrim);
const glowMesh    = doc.createMesh().addPrimitive(glowPrim);

// ============================================================
// 组装场景
// ============================================================

const silverNode   = doc.createNode('silver_ribbons').setMesh(silverMesh);
const darkNode     = doc.createNode('dark_metal').setMesh(darkMesh);
const concreteNode = doc.createNode('concrete').setMesh(concreteMesh);
const railingNode = doc.createNode('railing').setMesh(railingMesh);
const glowNode    = doc.createNode('blue_glow').setMesh(glowMesh);

const scene = doc.createScene('tron_scene')
  .addChild(silverNode)
  .addChild(darkNode)
  .addChild(concreteNode)
  .addChild(railingNode)
  .addChild(glowNode);

doc.getRoot().setDefaultScene(scene);

// ============================================================
// 统计信息
// ============================================================

let totalTris = 0;
const groups = {
  silverMetalGeoms,
  darkMetalGeoms,
  concreteGeoms,
  railingGeoms,
  blueGlowGeoms,
};
const info = {};
for (const [name, geoms] of Object.entries(groups)) {
  const tris = geoms.reduce((s, g) => s + countTriangles(g), 0);
  info[name] = tris;
  totalTris += tris;
}
info.totalTriangles = totalTris;

// ============================================================
// 导出
// ============================================================

const OUTPUT_PATH = '/Users/wangmingyu/Desktop/shanghai-disney-twin/tools/tron_source.glb';

const io = new NodeIO();
await io.write(OUTPUT_PATH, doc);

console.log('GLB generated:', OUTPUT_PATH);
console.log('Stats:', JSON.stringify(info, null, 2));

writeFileSync(OUTPUT_PATH.replace('.glb', '_info.json'), JSON.stringify(info, null, 2));
