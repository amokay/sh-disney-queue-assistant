#!/usr/bin/env node
// 严格清理 park_roads.json 中的直线路径
import fs from 'fs';
import path from 'path';

const ROADS_PATH = path.resolve(
  process.cwd(),
  'frontend/assets/data/park_roads.json'
);

const data = JSON.parse(fs.readFileSync(ROADS_PATH, 'utf8'));
const roads = Array.isArray(data.roads) ? data.roads : [];

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// 点 p 到线段 a-b 的垂直距离（2D）
function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return dist2D(p, a);
  // 叉积绝对值除以底边长度
  const cross = (p.x - a.x) * dz - (p.z - a.z) * dx;
  return Math.abs(cross) / len;
}

const STRAIGHT_RATIO = 1.15; // 弯曲度阈值
const MAX_OFFSET_RATIO = 0.05; // 最大偏移占总长比例
const LONG_DIST_THRESHOLD = 15; // 长距离阈值（场景单位）

const toDelete = [];
const kept = [];

for (const road of roads) {
  const pts = Array.isArray(road.points) ? road.points : [];
  if (pts.length < 2) {
    // 无效路线一并删除
    toDelete.push({
      id: road.id,
      pointCount: pts.length,
      startEndDist: 0,
      ratio: 0,
      maxOffset: 0,
      reason: 'too-few-points',
    });
    continue;
  }

  const start = pts[0];
  const end = pts[pts.length - 1];
  const startEndDist = dist2D(start, end);

  // 累计路径长度
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    pathLen += dist2D(pts[i - 1], pts[i]);
  }

  const ratio = startEndDist > 1e-6 ? pathLen / startEndDist : 0;

  // 中间点最大垂直偏移
  let maxOffset = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], start, end);
    if (d > maxOffset) maxOffset = d;
  }

  const offsetRatio = pathLen > 1e-6 ? maxOffset / pathLen : 0;

  // 判定是否为直线
  const isStraightByRatio = ratio < STRAIGHT_RATIO;
  const isStraightByOffset = offsetRatio < MAX_OFFSET_RATIO;
  const isLong = startEndDist > LONG_DIST_THRESHOLD;

  let shouldDelete = false;
  const reasons = [];

  if (isStraightByRatio) {
    shouldDelete = true;
    reasons.push(`ratio=${ratio.toFixed(3)}<${STRAIGHT_RATIO}`);
  }
  if (isStraightByOffset) {
    shouldDelete = true;
    reasons.push(
      `offsetRatio=${(offsetRatio * 100).toFixed(2)}%<${MAX_OFFSET_RATIO * 100}%`
    );
  }

  // 长距离直线优先删除（已在以上条件中覆盖；此处加权标记 reason）
  if (isLong && shouldDelete) {
    reasons.push(`long-dist(${startEndDist.toFixed(2)}>15)`);
  }

  if (shouldDelete) {
    toDelete.push({
      id: road.id,
      pointCount: pts.length,
      startEndDist: +startEndDist.toFixed(3),
      ratio: +ratio.toFixed(3),
      maxOffset: +maxOffset.toFixed(3),
      offsetRatio: +(offsetRatio * 100).toFixed(2),
      isLong,
      reason: reasons.join('; '),
    });
  } else {
    kept.push(road);
  }
}

// 排序：长距离优先
toDelete.sort((a, b) => (b.startEndDist || 0) - (a.startEndDist || 0));

console.log('=== 被判定为直线（待删除）的路线 ===');
console.log(
  ['#', 'id', 'pts', 'dist', 'ratio', 'maxOffset', 'offset%', 'long', 'reason'].join(' | ')
);
toDelete.forEach((r, i) => {
  console.log(
    [
      i + 1,
      r.id,
      r.pointCount,
      r.startEndDist,
      r.ratio,
      r.maxOffset,
      r.offsetRatio,
      r.isLong ? 'Y' : 'N',
      r.reason,
    ].join(' | ')
  );
});

const longDeleted = toDelete.filter((r) => r.isLong).length;
console.log('');
console.log(`原路线数: ${roads.length}`);
console.log(`删除路线数: ${toDelete.length}（其中长距离直线: ${longDeleted}）`);
console.log(`保留路线数: ${kept.length}`);

const out = {
  ...data,
  generatedAt: new Date().toISOString(),
  roads: kept,
};

fs.writeFileSync(ROADS_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`已写入: ${ROADS_PATH}`);
