/**
 * 基于 park_roads.json 路网的图寻路服务
 * - 读取路网数据，构建加权无向图
 * - 距离 < 1.5 的节点合并为同一路口
 * - Dijkstra 最短路径算法（最小堆实现）
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MERGE_THRESHOLD = 1.5; // 节点合并阈值（场景单位）
const SCALE_METERS_PER_UNIT = 5; // 1场景单位 ≈ 5米
const WALK_SPEED_MPS = 1.2; // 步行速度 m/s

// ─── 最小堆（优先队列）───────────────────────────────────────────────
class MinHeap {
  constructor() {
    this.data = [];
  }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  get size() {
    return this.data.length;
  }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].dist < this.data[parent].dist) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].dist < this.data[smallest].dist) smallest = l;
      if (r < n && this.data[r].dist < this.data[smallest].dist) smallest = r;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else break;
    }
  }
}

// ─── 图结构 ──────────────────────────────────────────────────────────
let graph = null; // { nodes: [{x, z}], adj: [[ {to, weight} ]] }

function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 查找或创建节点（合并距离 < MERGE_THRESHOLD 的点）
 */
function findOrCreateNode(nodes, nodeIndex, x, z) {
  // 先从空间索引中找
  const key = `${Math.round(x * 2)}_${Math.round(z * 2)}`;
  const candidates = nodeIndex.get(key);
  if (candidates) {
    for (const idx of candidates) {
      if (dist2D(nodes[idx].x, nodes[idx].z, x, z) < MERGE_THRESHOLD) {
        return idx;
      }
    }
  }
  // 检查相邻格子
  const kx = Math.round(x * 2);
  const kz = Math.round(z * 2);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const nk = `${kx + dx}_${kz + dz}`;
      const bucket = nodeIndex.get(nk);
      if (bucket) {
        for (const idx of bucket) {
          if (dist2D(nodes[idx].x, nodes[idx].z, x, z) < MERGE_THRESHOLD) {
            return idx;
          }
        }
      }
    }
  }
  // 创建新节点
  const idx = nodes.length;
  nodes.push({ x, z });
  if (!nodeIndex.has(key)) nodeIndex.set(key, []);
  nodeIndex.get(key).push(idx);
  return idx;
}

function buildGraph() {
  const roadsPath = join(__dirname, "../../frontend/assets/data/park_roads.json");
  const raw = JSON.parse(readFileSync(roadsPath, "utf-8"));
  const roads = raw.roads || [];

  const nodes = []; // [{x, z}]
  const nodeIndex = new Map(); // 空间哈希 → node indices
  const adjMap = new Map(); // nodeIdx → Map<nodeIdx, weight>

  function addEdge(a, b, weight) {
    if (!adjMap.has(a)) adjMap.set(a, new Map());
    if (!adjMap.has(b)) adjMap.set(b, new Map());
    const existing = adjMap.get(a).get(b);
    if (existing === undefined || weight < existing) {
      adjMap.get(a).set(b, weight);
      adjMap.get(b).set(a, weight);
    }
  }

  for (const road of roads) {
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

  // --- 连通分量桥接：消除孤岛，确保全图可达 ---
  bridgeComponents(nodes, adjMap, addEdge);

  // 转换为邻接表数组
  const adj = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    adj[i] = [];
  }
  for (const [from, neighbors] of adjMap) {
    for (const [to, weight] of neighbors) {
      adj[from].push({ to, weight });
    }
  }

  graph = { nodes, adj };
  console.log(`[parkRoadGraph] 图构建完成: ${nodes.length} 节点, ${roads.length} 条路线`);
}

/**
 * 连通分量桥接：识别孤立分量并连接到主分量
 * - BFS 识别所有连通分量
 * - 主分量 = 节点数最多的分量
 * - 对每个孤立分量找到与主分量的最近点对，添加桥接边
 * - 距离 >= 5.0 时记录警告但仍添加边，确保全局连通
 */
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
          if (!visited[to]) {
            visited[to] = true;
            queue.push(to);
          }
        }
      }
    }
    components.push(comp);
  }

  if (components.length <= 1) return;

  // 找主分量（节点数最多）
  let mainIdx = 0;
  for (let i = 1; i < components.length; i++) {
    if (components[i].length > components[mainIdx].length) mainIdx = i;
  }
  const mainComp = components[mainIdx];

  console.log(
    `[parkRoadGraph] 检测到 ${components.length} 个连通分量，主分量 ${mainComp.length} 节点；开始桥接孤立分量...`
  );

  for (let ci = 0; ci < components.length; ci++) {
    if (ci === mainIdx) continue;
    const isolated = components[ci];

    let bestDist = Infinity;
    let bestA = -1;
    let bestB = -1;

    for (const a of isolated) {
      for (const b of mainComp) {
        const d = dist2D(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
        if (d < bestDist) {
          bestDist = d;
          bestA = a;
          bestB = b;
        }
      }
    }

    if (bestA >= 0 && bestB >= 0) {
      if (bestDist >= 5.0) {
        console.warn(
          `[parkRoadGraph] 孤立分量(${isolated.length}节点) 与主分量最近距离 ${bestDist.toFixed(2)} 超过阈值 5.0，仍添加桥接边以保证连通`
        );
      } else {
        console.log(
          `[parkRoadGraph] 桥接孤立分量(${isolated.length}节点)：节点 ${bestA} <-> ${bestB}, 距离=${bestDist.toFixed(2)}`
        );
      }
      addEdge(bestA, bestB, bestDist);
    }
  }
}

/**
 * 找到图中距 (x, z) 最近的节点
 */
function findNearestNode(x, z) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = dist2D(graph.nodes[i].x, graph.nodes[i].z, x, z);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: bestDist };
}

/**
 * Dijkstra 最短路径
 */
function dijkstra(startIdx, endIdx) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  dist[startIdx] = 0;
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
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push({ idx: v, dist: nd });
      }
    }
  }

  if (dist[endIdx] === Infinity) return null;

  // 回溯路径
  const path = [];
  let cur = endIdx;
  while (cur !== -1) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse();
  return { path, totalDist: dist[endIdx] };
}

/**
 * 寻路主入口
 * @param {number} startX - 起点场景X
 * @param {number} startZ - 起点场景Z
 * @param {number} endX - 终点场景X
 * @param {number} endZ - 终点场景Z
 * @returns {Array|null} 路径点数组 [{x, y, z}] 或 null
 */
export function findPath(startX, startZ, endX, endZ) {
  if (!graph) buildGraph();

  const startNode = findNearestNode(startX, startZ);
  const endNode = findNearestNode(endX, endZ);

  if (startNode.idx < 0 || endNode.idx < 0) return null;

  // 如果起点或终点离路网太远（> 30单位），视为无效
  if (startNode.dist > 30 || endNode.dist > 30) return null;

  const result = dijkstra(startNode.idx, endNode.idx);
  if (!result) return null;

  // 构造路径点数组
  const points = [];

  // 添加真实起点（连接到最近路网节点）
  points.push({ x: startX, y: 0.3, z: startZ });

  // 添加路径上的所有节点
  for (const nodeIdx of result.path) {
    const node = graph.nodes[nodeIdx];
    points.push({ x: node.x, y: 0.3, z: node.z });
  }

  // 添加真实终点
  points.push({ x: endX, y: 0.3, z: endZ });

  // 去除重复的相邻点
  const cleaned = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    if (dist2D(prev.x, prev.z, points[i].x, points[i].z) > 0.01) {
      cleaned.push(points[i]);
    }
  }

  return cleaned;
}

/**
 * 计算路径总长度（场景单位）
 */
export function pathDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist2D(points[i - 1].x, points[i - 1].z, points[i].x, points[i].z);
  }
  return total;
}

/**
 * 场景距离转换为米
 */
export function sceneDistToMeters(sceneDist) {
  return sceneDist * SCALE_METERS_PER_UNIT;
}

/**
 * 获取步行时长（秒）
 */
export function walkDurationSeconds(distMeters) {
  return Math.round(distMeters / WALK_SPEED_MPS);
}

// 预热：模块加载时自动构建图
try {
  buildGraph();
} catch (e) {
  console.warn("[parkRoadGraph] 初始化失败，将在首次调用时重试:", e.message);
}
