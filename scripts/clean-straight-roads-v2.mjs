#!/usr/bin/env node
// 第二轮严格清理：针对长距离路线采用分级阈值
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
function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return dist2D(p, a);
  const cross = (p.x - a.x) * dz - (p.z - a.z) * dx;
  return Math.abs(cross) / len;
}

// 用户截图重点标注区域的关键词
const ZONE_KEYWORDS = [
  'pirates',
  'treasure',
  'explorer',
  'canoes',
  'shipwreck',
  'soaring',
  'camp-discovery',
  'roaring',
  'thunder',
  'adventure',
];

const toDelete = [];
const kept = [];

for (const road of roads) {
  const id = road.id || '';
  const pts = Array.isArray(road.points) ? road.points : [];
  if (pts.length < 2) {
    toDelete.push({ id, reason: 'too-few-points', startEndDist: 0, ratio: 0, offsetRatio: 0 });
    continue;
  }
  const start = pts[0];
  const end = pts[pts.length - 1];
  const startEndDist = dist2D(start, end);
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) pathLen += dist2D(pts[i - 1], pts[i]);
  const ratio = startEndDist > 1e-6 ? pathLen / startEndDist : 0;
  let maxOffset = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], start, end);
    if (d > maxOffset) maxOffset = d;
  }
  const offsetRatio = pathLen > 1e-6 ? maxOffset / pathLen : 0;

  const inZone = ZONE_KEYWORDS.some((k) => id.includes(k));

  // 分级阈值：路线越长，要求的弯曲度越高（真实道路在长距离上必有显著绕行）
  let requiredRatio = 1.15;
  let requiredOffset = 0.05; // 5%
  if (startEndDist > 30) {
    requiredRatio = 2.5;
    requiredOffset = 0.18;
  } else if (startEndDist > 20) {
    requiredRatio = 1.5;
    requiredOffset = 0.12;
  } else if (startEndDist > 15) {
    requiredRatio = 1.35;
    requiredOffset = 0.09;
  } else if (startEndDist > 10) {
    requiredRatio = 1.2;
    requiredOffset = 0.06;
  }

  // 用户重点反馈区域加严：宝藏湾/探险岛在 dist>10 时要求 ratio>=1.5 或 offset>=10%
  if (inZone && startEndDist > 10) {
    requiredRatio = Math.max(requiredRatio, 1.5);
    requiredOffset = Math.max(requiredOffset, 0.1);
  }

  const failRatio = ratio < requiredRatio;
  const failOffset = offsetRatio < requiredOffset;
  const shouldDelete = failRatio || failOffset;

  if (shouldDelete) {
    const reasons = [];
    if (failRatio) reasons.push(`ratio=${ratio.toFixed(3)}<${requiredRatio}`);
    if (failOffset)
      reasons.push(
        `offset=${(offsetRatio * 100).toFixed(2)}%<${(requiredOffset * 100).toFixed(0)}%`
      );
    if (inZone) reasons.push('zone');
    toDelete.push({
      id,
      pointCount: pts.length,
      startEndDist: +startEndDist.toFixed(3),
      ratio: +ratio.toFixed(3),
      maxOffset: +maxOffset.toFixed(3),
      offsetRatio: +(offsetRatio * 100).toFixed(2),
      isLong: startEndDist > 15,
      inZone,
      reason: reasons.join('; '),
    });
  } else {
    kept.push(road);
  }
}

toDelete.sort((a, b) => (b.startEndDist || 0) - (a.startEndDist || 0));

console.log('=== 第二轮严格清理：删除路线 ===');
console.log(['#', 'id', 'pts', 'dist', 'ratio', 'offset%', 'zone', 'reason'].join(' | '));
toDelete.forEach((r, i) => {
  console.log(
    [
      i + 1,
      r.id,
      r.pointCount,
      r.startEndDist,
      r.ratio,
      r.offsetRatio,
      r.inZone ? 'Y' : 'N',
      r.reason,
    ].join(' | ')
  );
});

const longDeleted = toDelete.filter((r) => r.isLong).length;
const zoneDeleted = toDelete.filter((r) => r.inZone).length;
console.log('');
console.log(`原路线数: ${roads.length}`);
console.log(
  `删除路线数: ${toDelete.length}（长距离>15: ${longDeleted}，重点区域: ${zoneDeleted}）`
);
console.log(`保留路线数: ${kept.length}`);

const out = {
  ...data,
  generatedAt: new Date().toISOString(),
  roads: kept,
};
fs.writeFileSync(ROADS_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`已写入: ${ROADS_PATH}`);
