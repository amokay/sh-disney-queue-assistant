import { postSessionLocation } from "./api/session.js";
import { fetchGeoReference, latLngToSceneXZ, sceneXZToLatLng } from "./geoProject.js";
import { getStoredSessionId } from "./ui/sessionStore.js";

/**
 * 奇幻童话城堡：GCJ 与 geo_reference + Main_castle 模型对齐
 * （旧 seed 31.14194,121.65771 会偏到约 -40,-26，不在城堡上）
 */
export const CASTLE_GEO = {
  id: "castle",
  name: "奇幻童话城堡",
  gcj_lat: 31.143558,
  gcj_lng: 121.659627,
};

/** 与 model_transforms.json Main_castle.position.xz 一致 */
export const CASTLE_SCENE = { x: -23.550396429517647, z: -43.26499782406449 };

/** 无 session 时也在地图上显示 LBS（入园检测 / 演示） */
export async function showLocationOnMap(lat, lng) {
  const ref = await fetchGeoReference();
  if (!ref) return null;
  const { x, z } = latLngToSceneXZ(lat, lng, ref);
  dispatchUserLocation({
    gcj_lat: lat,
    gcj_lng: lng,
    scene_x: x,
    scene_z: z,
  });
  return { scene_x: x, scene_z: z };
}

export function dispatchUserLocation(detail) {
  window.dispatchEvent(new CustomEvent("user-location-updated", { detail }));
}

/**
 * 上报定位并同步地图标记
 */
export async function reportLocation(sessionId, lat, lng) {
  const data = await postSessionLocation(sessionId, lat, lng);
  const loc = data.location || {};
  dispatchUserLocation({
    sessionId,
    gcj_lat: loc.gcj_lat ?? lat,
    gcj_lng: loc.gcj_lng ?? lng,
    scene_x: loc.scene_x,
    scene_z: loc.scene_z,
  });
  return data;
}

/** 园内演示：默认站在奇幻童话城堡 */
export async function simulateCastleLocation(sessionId) {
  return reportLocation(sessionId, CASTLE_GEO.gcj_lat, CASTLE_GEO.gcj_lng);
}

/** 默认城堡位置（无 session 时仅更新地图蓝标） */
export async function showDefaultCastleLocation() {
  return showLocationOnMap(CASTLE_GEO.gcj_lat, CASTLE_GEO.gcj_lng);
}

/**
 * 从场景 xz 设定 LBS（⇧⌘+点击地图）；有 session 时同步后端。
 */
export async function setLocationFromSceneXZ(x, z) {
  const ref = await fetchGeoReference();
  if (!ref) throw new Error("缺少 geo_reference.json");
  const { lat, lng } = sceneXZToLatLng(x, z, ref);
  const sessionId = getStoredSessionId();
  if (sessionId) {
    await reportLocation(sessionId, lat, lng);
  } else {
    dispatchUserLocation({
      gcj_lat: lat,
      gcj_lng: lng,
      scene_x: x,
      scene_z: z,
    });
  }
  window.dispatchEvent(
    new CustomEvent("lbs-location-set", {
      detail: { scene_x: x, scene_z: z, gcj_lat: lat, gcj_lng: lng, sessionId },
    })
  );
  return { lat, lng, scene_x: x, scene_z: z };
}

/**
 * 行中真实 GPS 定位（可选，园内真机使用）
 */
export function startLocationReporter(sessionId, handlers = {}) {
  if (!navigator.geolocation) {
    handlers.onError?.("当前浏览器不支持定位");
    return () => {};
  }

  let lastSent = 0;
  const minInterval = 12000;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastSent < minInterval) return;
      lastSent = now;
      void reportLocation(sessionId, pos.coords.latitude, pos.coords.longitude)
        .then(() => handlers.onSuccess?.())
        .catch((e) => handlers.onError?.(String(e?.message || e)));
    },
    (err) => handlers.onError?.(err.message || "定位失败"),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/** 模拟站在某景点入口 */
export async function mockLocationAtAttraction(sessionId, attraction) {
  const lat = attraction.entry_gcj_lat ?? attraction.gcj_lat;
  const lng = attraction.entry_gcj_lng ?? attraction.gcj_lng;
  if (lat == null || lng == null) throw new Error("该景点无坐标");
  const name = attraction.name || attraction.id;
  return reportLocation(sessionId, lat, lng);
}

/* ======== 自动实时定位（幂等单例） ======== */

let _autoWatchId = null;
let _autoGeoRef = null;

/**
 * 自动开启持续 GPS 追踪并派发 user-location-updated 事件。
 * 幂等：多次调用不会产生多个 watcher。
 * @param {object} handlers
 * @param {(detail: {lat:number, lng:number, scene:{x:number, z:number}}) => void} [handlers.onUpdate]
 * @param {(errCode: number, msg: string) => void} [handlers.onError]
 * @returns {() => void} stop 函数
 */
export function startAutoLocationWatch(handlers = {}) {
  // 幂等：已有 watch 就不重复
  if (_autoWatchId != null) return stopAutoLocationWatch;

  if (!navigator.geolocation) {
    handlers.onError?.(0, "当前浏览器不支持定位");
    return () => {};
  }

  // 预加载 geoReference（确保首次回调能拿到）
  const refReady = fetchGeoReference().then((ref) => { _autoGeoRef = ref; });

  let lastSent = 0;
  const minInterval = 3000; // 3s 节流（UI 刷新），上报仍走 12s
  let reportThrottle = 0;

  _autoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastSent < minInterval) return;
      lastSent = now;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (!_autoGeoRef) {
        // ref 还没加载完，等它就绪后再处理
        refReady.then(() => {
          if (!_autoGeoRef) return;
          const { x, z } = latLngToSceneXZ(lat, lng, _autoGeoRef);
          dispatchUserLocation({ gcj_lat: lat, gcj_lng: lng, scene_x: x, scene_z: z });
          handlers.onUpdate?.({ lat, lng, scene: { x, z } });
        });
        return;
      }
      const { x, z } = latLngToSceneXZ(lat, lng, _autoGeoRef);

      // 派发事件（marker 更新）
      dispatchUserLocation({ gcj_lat: lat, gcj_lng: lng, scene_x: x, scene_z: z });

      // 回调
      handlers.onUpdate?.({ lat, lng, scene: { x, z } });

      // 节流上报后端（12s）
      if (now - reportThrottle >= 12000) {
        reportThrottle = now;
        const sid = getStoredSessionId();
        if (sid) {
          postSessionLocation(sid, lat, lng).catch(() => {});
        }
      }
    },
    (err) => {
      handlers.onError?.(err.code, err.message || "定位失败");
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );

  return stopAutoLocationWatch;
}

export function stopAutoLocationWatch() {
  if (_autoWatchId != null) {
    navigator.geolocation.clearWatch(_autoWatchId);
    _autoWatchId = null;
  }
}

export function isAutoWatchActive() {
  return _autoWatchId != null;
}

/* ======== 随机 Mock 园内 LBS ======== */

const EARTH_R = 6371000;

/** haversine 距离（m） — 本地副本，避免循环引用 parkGeofence */
function _haversineDist(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 内部：判断点是否在园区 3200m 范围内 */
function _isInsidePark(lat, lng) {
  return _haversineDist(lat, lng, CASTLE_GEO.gcj_lat, CASTLE_GEO.gcj_lng) <= 3200;
}

/**
 * 可玩区景点 BBOX（较实际景点四至外扩 ~5m）。
 * 实际景点范围：lat ∈ [31.140956, 31.145607]，lng ∈ [121.656592, 121.665397]。
 * 该 BBOX 与 600m 圆心采样双重交集，确保 mock 点始终落在用户可视 3D 景点区。
 */
const PLAYABLE_BBOX = {
  minLat: 31.1400, maxLat: 31.1460,
  minLng: 121.6560, maxLng: 121.6660,
};
function _isInsidePlayableBBox(lat, lng) {
  return lat >= PLAYABLE_BBOX.minLat && lat <= PLAYABLE_BBOX.maxLat
      && lng >= PLAYABLE_BBOX.minLng && lng <= PLAYABLE_BBOX.maxLng;
}

/**
 * 通用 mock 位置派发 + 上报（复用真实路径逻辑）。
 * @param {number} lat
 * @param {number} lng
 */
export async function emitMockLocation(lat, lng) {
  const ref = await fetchGeoReference();
  if (!ref) return;
  const { x, z } = latLngToSceneXZ(lat, lng, ref);
  dispatchUserLocation({ gcj_lat: lat, gcj_lng: lng, scene_x: x, scene_z: z, source: 'mock' });
  // 上报后端（按现有协议，无需 source 字段）
  const sid = getStoredSessionId();
  if (sid) {
    postSessionLocation(sid, lat, lng).catch(() => {});
  }
}

/**
 * 在园区内随机取一个 GCJ 点（面积均匀极坐标采样）。
 * @param {{ radius?: number, maxRetries?: number }} [options]
 * @returns {{ lat: number, lng: number }}
 */
export function mockRandomInParkLocation(options = {}) {
  // 园区内的景点 GCJ-02 坐标（从数据库导出）
  const POI_NODES = [
    { id: "castle", lat: 31.143558, lng: 121.659627 },
    { id: "tron", lat: 31.14328, lng: 121.65942 },
    { id: "soaring", lat: 31.1435, lng: 121.6558 },
    { id: "pirates", lat: 31.1412, lng: 121.6591 },
    { id: "thunder", lat: 31.1403, lng: 121.655 },
    { id: "pooh", lat: 31.1424, lng: 121.6568 },
    { id: "mine", lat: 31.142, lng: 121.6564 },
    { id: "buzz", lat: 31.143, lng: 121.6588 },
  ];

  // 定义可行走的路线段（景点之间的连接关系）
  const EDGES = [
    ["castle", "tron"],
    ["castle", "pooh"],
    ["castle", "buzz"],
    ["castle", "mine"],
    ["castle", "soaring"],
    ["pooh", "mine"],
    ["mine", "pirates"],
    ["pirates", "thunder"],
    ["thunder", "soaring"],
    ["buzz", "tron"],
    ["pooh", "buzz"],
  ];

  // 随机选择一条边
  const edge = EDGES[Math.floor(Math.random() * EDGES.length)];
  const from = POI_NODES.find((p) => p.id === edge[0]);
  const to = POI_NODES.find((p) => p.id === edge[1]);

  if (!from || !to) {
    return { lat: CASTLE_GEO.gcj_lat, lng: CASTLE_GEO.gcj_lng };
  }

  // 在两点之间随机插值（线性），加微小偏移模拟路线宽度
  const t = Math.random();
  const lat = from.lat + (to.lat - from.lat) * t;
  const lng = from.lng + (to.lng - from.lng) * t;

  // 加 ±5 米的随机偏移，模拟路线有一定宽度
  const jitterRadius = 5; // 米
  const jitterAngle = Math.random() * 2 * Math.PI;
  const dLat = (jitterRadius * Math.cos(jitterAngle)) / EARTH_R * (180 / Math.PI);
  const dLng = (jitterRadius * Math.sin(jitterAngle)) / (EARTH_R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);

  return { lat: lat + dLat, lng: lng + dLng };
}

/* ---- Mock Loop ---- */
let _mockLoopTimer = null;
let _mockLoopActive = false;

/**
 * 每 N 秒刷新一次 mock 园内随机位置，模拟用户走动。
 * @param {{ interval?: number, radius?: number }} [options]
 */
export function startMockLocationLoop(options = {}) {
  if (_mockLoopActive) return; // 防重复
  _mockLoopActive = true;
  const interval = options.interval ?? 30000;

  const tick = () => {
    const { lat, lng } = mockRandomInParkLocation({ radius: options.radius });
    emitMockLocation(lat, lng);
  };
  tick(); // 立即首次
  _mockLoopTimer = setInterval(tick, interval);
}

export function stopMockLocationLoop() {
  if (_mockLoopTimer != null) {
    clearInterval(_mockLoopTimer);
    _mockLoopTimer = null;
  }
  _mockLoopActive = false;
}

export function isMockLoopActive() {
  return _mockLoopActive;
}
