/**
 * 浏览器端 park_roads.json 路网寻路（Dijkstra）
 * 后端 parkRoadGraphService.js 的轻量前端移植版
 * 用于 pages 静态部署时的导航 fallback
 */

const MERGE_THRESHOLD = 1.5;

// ─── 最小堆 ──────────────────────────────────────────────────
class MinHeap {
  constructor() { this.d = []; }
  push(item) { this.d.push(item); this._up(this.d.length - 1); }
  pop() {
    const top = this.d[0], last = this.d.pop();
    if (this.d.length > 0) { this.d[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.d.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[i].dist < this.d[p].dist) { [this.d[i], this.d[p]] = [this.d[p], this.d[i]]; i = p; }
      else break;
    }
  }
  _down(i) {
    const n = this.d.length;
    while (true) {
      let s = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.d[l].dist < this.d[s].dist) s = l;
      if (r < n && this.d[r].dist < this.d[s].dist) s = r;
      if (s !== i) { [this.d[i], this.d[s]] = [this.d[s], this.d[i]]; i = s; }
      else break;
    }
  }
}

// ─── 图状态 ──────────────────────────────────────────────────
let graph = null; // { nodes: [{x,z}], adj: [[{to,weight}]] }
let buildPromise = null;

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function findOrCreateNode(nodes, nodeIndex, x, z) {
  const kx = Math.round(x * 2), kz = Math.round(z * 2);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = nodeIndex.get(`${kx + dx}_${kz + dz}`);
      if (bucket) {
        for (const idx of bucket) {
          if (dist2D(nodes[idx].x, nodes[idx].z, x, z) < MERGE_THRESHOLD) return idx;
        }
      }
    }
  }
  const idx = nodes.length;
  nodes.push({ x, z });
  const key = `${kx}_${kz}`;
  if (!nodeIndex.has(key)) nodeIndex.set(key, []);
  nodeIndex.get(key).push(idx);
  return idx;
}

async function buildGraph() {
  // 尝试多个路径，兼容不同部署目录结构
  const paths = [
    "./assets/3d/config/park_roads.json",
    "../assets/3d/config/park_roads.json",
  ];
  let raw = null;
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) { raw = await res.json(); break; }
    } catch {}
  }
  if (!raw || !raw.roads) throw new Error("无法加载 park_roads.json");

  const nodes = [];
  const nodeIndex = new Map();
  const adjMap = new Map();

  function addEdge(a, b, weight) {
    if (!adjMap.has(a)) adjMap.set(a, new Map());
    if (!adjMap.has(b)) adjMap.set(b, new Map());
    const existing = adjMap.get(a).get(b);
    if (existing === undefined || weight < existing) {
      adjMap.get(a).set(b, weight);
      adjMap.get(b).set(a, weight);
    }
  }

  for (const road of raw.roads) {
    const pts = road.points;
    if (!pts || pts.length < 2) continue;
    let prevIdx = null;
    for (const pt of pts) {
      const curIdx = findOrCreateNode(nodes, nodeIndex, pt.x, pt.z);
      if (prevIdx !== null && prevIdx !== curIdx) {
        const w = dist2D(nodes[prevIdx].x, nodes[prevIdx].z, nodes[curIdx].x, nodes[curIdx].z);
        addEdge(prevIdx, curIdx, w);
      }
      prevIdx = curIdx;
    }
  }

  // 连通分量桥接
  bridgeComponents(nodes, adjMap, addEdge);

  // 转为邻接表数组
  const adj = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) adj[i] = [];
  for (const [from, neighbors] of adjMap) {
    for (const [to, weight] of neighbors) adj[from].push({ to, weight });
  }

  graph = { nodes, adj };
  console.log(`[pathfinder] 路网图构建完成: ${nodes.length} 节点`);
}

function bridgeComponents(nodes, adjMap, addEdge) {
  const n = nodes.length;
  if (n === 0) return;
  const visited = new Array(n).fill(false);
  const components = [];

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const queue = [start];
    visited[start] = true;
    const comp = [];
    while (queue.length) {
      const u = queue.shift();
      comp.push(u);
      const neighbors = adjMap.get(u);
      if (neighbors) {
        for (const to of neighbors.keys()) {
          if (!visited[to]) { visited[to] = true; queue.push(to); }
        }
      }
    }
    components.push(comp);
  }

  if (components.length <= 1) return;

  let mainIdx = 0;
  for (let i = 1; i < components.length; i++) {
    if (components[i].length > components[mainIdx].length) mainIdx = i;
  }
  const mainComp = components[mainIdx];

  for (let ci = 0; ci < components.length; ci++) {
    if (ci === mainIdx) continue;
    const isolated = components[ci];
    let bestDist = Infinity, bestA = -1, bestB = -1;
    for (const a of isolated) {
      for (const b of mainComp) {
        const d = dist2D(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
        if (d < bestDist) { bestDist = d; bestA = a; bestB = b; }
      }
    }
    if (bestA >= 0 && bestB >= 0) addEdge(bestA, bestB, bestDist);
  }
}

function findNearestNode(x, z) {
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = dist2D(graph.nodes[i].x, graph.nodes[i].z, x, z);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return { idx: bestIdx, dist: bestDist };
}

function dijkstra(startIdx, endIdx) {
  const n = graph.nodes.length;
  const distArr = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  distArr[startIdx] = 0;
  const heap = new MinHeap();
  heap.push({ idx: startIdx, dist: 0 });

  while (heap.size > 0) {
    const { idx: u, dist: d } = heap.pop();
    if (visited[u]) continue;
    visited[u] = 1;
    if (u === endIdx) break;

    for (const edge of graph.adj[u]) {
      const v = edge.to;
      if (visited[v]) continue;
      const nd = d + edge.weight;
      if (nd < distArr[v]) {
        distArr[v] = nd;
        prev[v] = u;
        heap.push({ idx: v, dist: nd });
      }
    }
  }

  if (distArr[endIdx] === Infinity) return null;

  const path = [];
  let cur = endIdx;
  while (cur !== -1) { path.push(cur); cur = prev[cur]; }
  path.reverse();
  return { path, totalDist: distArr[endIdx] };
}

/**
 * 前端寻路主入口
 * @param {number} startX 起点场景X
 * @param {number} startZ 起点场景Z
 * @param {number} endX 终点场景X
 * @param {number} endZ 终点场景Z
 * @returns {Promise<{points: Array, segments: Array}|null>}
 */
export async function findWalkRoute(startX, startZ, endX, endZ) {
  // 确保图已构建（只构建一次）
  if (!graph) {
    if (!buildPromise) buildPromise = buildGraph();
    await buildPromise;
  }
  if (!graph) return null;

  const startNode = findNearestNode(startX, startZ);
  const endNode = findNearestNode(endX, endZ);
  if (startNode.idx < 0 || endNode.idx < 0) return null;
  if (startNode.dist > 30 || endNode.dist > 30) return null;

  const result = dijkstra(startNode.idx, endNode.idx);
  if (!result) return null;

  // 构造路径
  const points = [{ x: startX, y: 0.3, z: startZ }];
  for (const nodeIdx of result.path) {
    const node = graph.nodes[nodeIdx];
    points.push({ x: node.x, y: 0.3, z: node.z });
  }
  points.push({ x: endX, y: 0.3, z: endZ });

  // 去重
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    if (dist2D(prev.x, prev.z, points[i].x, points[i].z) > 0.01) {
      cleaned.push(points[i]);
    }
  }

  return { points: cleaned, segments: [] };
}
