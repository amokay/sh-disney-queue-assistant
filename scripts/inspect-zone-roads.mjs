#!/usr/bin/env node
// 重点检查宝藏湾/探险岛区域路线的弯曲度
import fs from 'fs';
import path from 'path';

const ROADS_PATH = path.resolve(
  process.cwd(),
  'frontend/assets/data/park_roads.json'
);

const data = JSON.parse(fs.readFileSync(ROADS_PATH, 'utf8'));
const roads = Array.isArray(data.roads) ? data.roads : [];

const KEYWORDS = [
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
  'wp-treasure',
  'wp-adventure',
];

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

function analyze(road) {
  const pts = road.points || [];
  if (pts.length < 2) return null;
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
  return { startEndDist, pathLen, ratio, maxOffset, offsetRatio, n: pts.length };
}

console.log('=== 关键区域剩余路线分析 ===');
console.log('id | pts | dist | ratio | maxOffset | offset%');

const matched = [];
for (const road of roads) {
  const id = road.id || '';
  if (!KEYWORDS.some((k) => id.includes(k))) continue;
  const a = analyze(road);
  if (!a) continue;
  matched.push({ id, ...a });
}
matched.sort((x, y) => y.startEndDist - x.startEndDist);
for (const r of matched) {
  console.log(
    [
      r.id,
      r.n,
      r.startEndDist.toFixed(2),
      r.ratio.toFixed(3),
      r.maxOffset.toFixed(2),
      (r.offsetRatio * 100).toFixed(2) + '%',
    ].join(' | ')
  );
}
console.log(`\n命中关键区域路线总数: ${matched.length}`);

console.log('\n=== 全部剩余路线（按起终点距离倒序，前30）===');
const all = roads
  .map((r) => ({ id: r.id, ...analyze(r) }))
  .filter((r) => r && r.startEndDist != null);
all.sort((x, y) => y.startEndDist - x.startEndDist);
for (const r of all.slice(0, 30)) {
  console.log(
    [
      r.id,
      r.n,
      r.startEndDist.toFixed(2),
      r.ratio.toFixed(3),
      r.maxOffset.toFixed(2),
      (r.offsetRatio * 100).toFixed(2) + '%',
    ].join(' | ')
  );
}
