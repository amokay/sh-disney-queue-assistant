import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createScene } from "./scene.js";
import { CameraRig } from "./camera.js";
import { loadGLB } from "./loader.js";
import { addTreeInstances } from "./instances.js";
import { bindAttractionPicking } from "./interaction.js";
import {
  AUTO_LOAD_GLBS,
  SHOW_BACKEND_MARKERS,
  SHOW_ATTRACTION_LIST_PANEL,
  SHOW_DEMO_TREES,
  SHOW_MAP_PINS,
  ALLOW_DISCOVER_ALL_GLBS,
  SHOW_WAIT_LABELS_3D,
  SHOW_ORIGIN_CALIBRATION_MARKER,
  COPY_SCENE_XZ_ON_SHIFT_CLICK,
} from "./config.js";
import { loadModelsFromManifest, loadDiscoveredModels } from "./modelManifest.js";
import { fetchModelTransformRules, applyTransformToGroup } from "./modelTransforms.js";
import { fetchModelMaterialRules, applyMaterialRulesToRoot } from "./modelMaterials.js";
import { addMapPins } from "./mapPins.js";
import { LineOverlays, ROUTE_TUBE_CENTER_Y } from "./sceneLines.js";
import { fetchAttractions, fetchWaitTimes } from "./api/attractions.js";
import { mountLeftPanel } from "./ui/panel.js";
// import { mountDetailCard } from "./ui/detail.js";
import { showToast } from "./ui/toast.js";
import { showLoading, hideLoading } from "./ui/loading.js";
import { createWaitLabelOverlay } from "./waitLabels.js";
import { bindCalibrationXZPick } from "./calibrationPick.js";
import { bindLbsMapPick, enterManualPickMode } from "./lbsMapPick.js";
import {
  showDefaultCastleLocation,
  startAutoLocationWatch,
  stopAutoLocationWatch,
  mockRandomInParkLocation,
  emitMockLocation,
  startMockLocationLoop,
  stopMockLocationLoop,
  dispatchUserLocation,
} from "./geoLocation.js";
import { mountLbsStatusBar } from "./ui/lbsStatusBar.js";
import { collectGlbAttractionIds } from "./glbAttractionMap.js";
import { mountPlannerApp } from "./plannerApp.js";
import { UserLocationMarker } from "./userLocationMarker.js";
import { fetchWalkToNext } from "./api/planner.js";
import { createCarouselSpin } from "./carouselSpin.js";

function mergeAttractions(rawAttractions, waits) {
  const wmap = new Map((waits || []).map((w) => [w.id, w]));
  return (rawAttractions || []).map((a) => {
    const w = wmap.get(a.id);
    return {
      id: a.id,
      name: a.name,
      zone: a.zone,
      description: a.description,
      position: { x: a.position_x, y: a.position_y, z: a.position_z },
      waitMinutes: w?.waitMinutes ?? null,
      status: w?.status ?? "unknown",
      gcj_lat: a.gcj_lat ?? null,
      gcj_lng: a.gcj_lng ?? null,
    };
  });
}

const MARKER_SPHERE_R = 2.2;

/** 折线弧长中点（xz 沿路径），y 用于 CSS2D 标签 */
function polylineHalfwayPoint(points) {
  if (!points?.length) return null;
  const yLift = ROUTE_TUBE_CENTER_Y + 2.8;
  if (points.length === 1) {
    const p = points[0];
    return { x: p.x, y: yLift, z: p.z };
  }
  const verts = points.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z));
  let total = 0;
  const lens = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const l = verts[i].distanceTo(verts[i + 1]);
    lens.push(l);
    total += l;
  }
  if (total <= 1e-6) {
    const p = points[0];
    return { x: p.x, y: yLift, z: p.z };
  }
  const half = total * 0.5;
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= half) {
      const t = lens[i] <= 1e-9 ? 0 : (half - acc) / lens[i];
      const v = new THREE.Vector3().lerpVectors(verts[i], verts[i + 1], t);
      return { x: v.x, y: yLift, z: v.z };
    }
    acc += lens[i];
  }
  const v = verts[verts.length - 1];
  return { x: v.x, y: yLift, z: v.z };
}

function setRouteMarkerHighlight(scene, ids) {
  const set = ids?.length ? new Set(ids) : null;

  // Highlight attraction marker spheres
  const g = scene.getObjectByName("AttractionMarkers");
  if (g) {
    for (const m of g.children) {
      if (!(m instanceof THREE.Mesh)) continue;
      const id = m.userData.attractionId;
      const glow = m.getObjectByName("marker-route-glow");
      const on = set && set.has(id);
      if (glow) glow.visible = !!on;
      const mat = m.material;
      if (mat && mat.emissive) {
        if (on) {
          mat.emissive.setHex(0x4488cc);
          if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.55;
        } else {
          mat.emissive.setHex(m.userData.baseEmissiveHex ?? 0x0c4a6e);
          if ("emissiveIntensity" in mat) mat.emissiveIntensity = m.userData.baseEmissiveIntensity ?? 1;
        }
      }
    }
  }

  // Highlight GLB model roots bound to POIs
  scene.traverse((obj) => {
    if (!obj.userData?.isGltfModelRoot) return;
    const poiId = obj.userData.pickableAttractionId;
    if (!poiId) return;
    const on = set && set.has(poiId);

    // Add/update glow shell on the GLB root
    let glowGroup = obj.getObjectByName("glb-route-glow");
    if (on) {
      if (!glowGroup) {
        glowGroup = createGlbGlow(obj);
        obj.add(glowGroup);
      }
      glowGroup.visible = true;
    } else {
      if (glowGroup) glowGroup.visible = false;
    }

    // Emissive boost on all meshes in the GLB
    obj.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mat = child.material;
      if (!mat.emissive) return;
      if (on) {
        if (!child.userData._origEmissiveHex) {
          child.userData._origEmissiveHex = mat.emissive.getHex();
          child.userData._origEmissiveIntensity = mat.emissiveIntensity;
        }
        mat.emissive.setHex(0x4488cc);
        mat.emissiveIntensity = 0.4;
      } else {
        if (child.userData._origEmissiveHex != null) {
          mat.emissive.setHex(child.userData._origEmissiveHex);
          mat.emissiveIntensity = child.userData._origEmissiveIntensity ?? 0;
        }
      }
    });
  });
}

/** Create additive glow shells around a GLB model for route highlighting */
function createGlbGlow(root) {
  const group = new THREE.Group();
  group.name = "glb-route-glow";

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() * 0.5;

  // Position glow relative to root
  const rootWorldPos = new THREE.Vector3();
  root.getWorldPosition(rootWorldPos);
  const localCenter = center.sub(rootWorldPos);

  const layers = [
    { scale: 1.15, opacity: 0.3, color: 0x66ccff },
    { scale: 1.35, opacity: 0.12, color: 0x3399ff },
  ];
  for (const spec of layers) {
    const geo = new THREE.SphereGeometry(radius * spec.scale, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.copy(localCenter);
    shell.renderOrder = -1;
    group.add(shell);
  }
  return group;
}

function addMarkerRouteGlow(parentMesh, sphereGeo) {
  const group = new THREE.Group();
  group.name = "marker-route-glow";
  group.visible = false;
  const layers = [
    { scale: 1.2, opacity: 0.42, color: 0xffe066 },
    { scale: 1.45, opacity: 0.2, color: 0xffb020 },
  ];
  for (const spec of layers) {
    const mat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shell = new THREE.Mesh(sphereGeo, mat);
    shell.scale.setScalar(spec.scale);
    shell.renderOrder = -1;
    group.add(shell);
  }
  parentMesh.add(group);
}

/**
 * 蓝球：仅在没有对应 GLB 的景点上显示（有 GLB 的由模型代表位置）。
 * @param {THREE.Scene} scene
 * @param {Array<{ id: string, position: { x: number, y?: number, z: number } }>} items
 * @param {Set<string>} [glbAttractionIds] 已加载 glb 绑定的景点 id
 */
function rebuildAttractionMarkers(scene, items, glbAttractionIds = new Set()) {
  const prev = scene.getObjectByName("AttractionMarkers");
  if (prev) scene.remove(prev);
  if (!SHOW_BACKEND_MARKERS || !items?.length) return;

  const group = new THREE.Group();
  group.name = "AttractionMarkers";
  scene.add(group);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0c4a6e,
    metalness: 0.25,
    roughness: 0.35,
  });
  const geo = new THREE.SphereGeometry(MARKER_SPHERE_R, 18, 14);

  for (const a of items) {
    if (glbAttractionIds.has(a.id)) continue;
    const mat = baseMat.clone();
    mat.emissiveIntensity = 1;
    const m = new THREE.Mesh(geo, mat);
    const y = (a.position.y || 0) + MARKER_SPHERE_R + 0.15;
    m.position.set(a.position.x, y, a.position.z);
    m.userData.attractionId = a.id;
    m.userData.baseEmissiveHex = 0x0c4a6e;
    m.userData.baseEmissiveIntensity = 1;
    m.name = `marker:${a.id}`;

    addMarkerRouteGlow(m, geo);

    group.add(m);
  }
}

async function loadManifestDoc() {
  try {
    const res = await fetch("/assets/data/models.manifest.json");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadPinsDoc() {
  try {
    const res = await fetch("/assets/data/map_pins.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

async function loadParadeDoc() {
  try {
    const res = await fetch("/assets/data/parade_route.json");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadParkRoadsDoc() {
  try {
    const res = await fetch("/assets/data/park_roads.json");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  showLoading();
  const canvas = document.getElementById("c");
  const uiRoot = document.getElementById("ui-root");

  const { scene, camera, renderer } = createScene(canvas);
  const rig = new CameraRig(camera, canvas);

  // 右上角「地图模式」按钮：点击后相机飞回初始视角
  const mapModeBtn = document.createElement("button");
  mapModeBtn.type = "button";
  mapModeBtn.className = "map-mode-btn";
  mapModeBtn.setAttribute("aria-label", "重置到地图模式初始视角");
  mapModeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none">
    <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      d="M1.5 4.5l5-2 5 2 5-2v11l-5 2-5-2-5 2V4.5z"/>
    <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="11.5" y1="4.5" x2="11.5" y2="15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  mapModeBtn.addEventListener("click", () => {
    rig.resetToDefault();
  });
  document.body.appendChild(mapModeBtn);

  // 右上角「LBS 定位」按钮：点击后相机飞到用户当前位置
  const lbsBtn = document.createElement("button");
  lbsBtn.type = "button";
  lbsBtn.className = "map-mode-btn lbs-loc-btn";
  lbsBtn.setAttribute("aria-label", "我的位置");
  lbsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="9" cy="9" r="2" fill="currentColor"/>
    <line x1="9" y1="0.5" x2="9" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9" y1="14.5" x2="9" y2="17.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="0.5" y1="9" x2="3.5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.5" y1="9" x2="17.5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  lbsBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("focus-user-location"));
  });
  document.body.appendChild(lbsBtn);

  // —— Post-processing: SSAO (Ambient Occlusion) ——
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 12;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.15;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssaoPass);

  composer.addPass(new OutputPass());

  // Entrance animation: orbit 360° + dolly in, 3 seconds
  const introDone = rig.playIntro({ duration: 3000 });

  if (SHOW_ORIGIN_CALIBRATION_MARKER) {
    console.info(
      "[校准] 橙柱+黄圈=世界原点 (0,0,0)；蓝柱=第二参照（默认 x=80,z=0）。Shift+左键点地面：复制 xz 到剪贴板（见 config COPY_SCENE_XZ_ON_SHIFT_CLICK）。完成后可将 SHOW_ORIGIN_CALIBRATION_MARKER 设为 false。"
    );
  } else if (COPY_SCENE_XZ_ON_SHIFT_CLICK) {
    console.info("[校准] Shift+左键点地面：复制该点世界坐标 x、z 到剪贴板。");
  }

  const rawAttractions = await fetchAttractions();
  const waits = await fetchWaitTimes();
  let merged = mergeAttractions(rawAttractions, waits);

  /** 当前路线高亮景点 id（与头顶标签描边、小球描边同步） */
  let lastRouteHighlightIds = /** @type {string[] | null} */ (null);
  /** 弧长中点距离/时长标签 */
  let lastRouteSegments = /** @type {Array<unknown> | null} */ (null);

  /** @type {ReturnType<createWaitLabelOverlay> | null} */
  let waitLabels = null;
  if (SHOW_WAIT_LABELS_3D) {
    waitLabels = createWaitLabelOverlay(
      scene,
      () => merged,
      () => lastRouteHighlightIds ?? [],
      () => modelTopYMap
    );
  }

  if (SHOW_DEMO_TREES) {
    void addTreeInstances(scene);
  }

  const manifest = (await loadManifestDoc()) || {};
  const transformRules = await fetchModelTransformRules();
  const materialRules = await fetchModelMaterialRules();
  const explicitList = Array.isArray(manifest.models) && manifest.models.length > 0;
  const useAutoDiscover = manifest.autoDiscover !== false;

  if (useAutoDiscover) {
    await loadDiscoveredModels(scene, manifest.pickRules || [], transformRules, materialRules);
  } else if (explicitList) {
    await loadModelsFromManifest(scene, manifest, transformRules, materialRules);
  } else if (AUTO_LOAD_GLBS.length > 0) {
    for (const url of AUTO_LOAD_GLBS) {
      try {
        const root = new THREE.Group();
        root.name = `manual:${url}`;
        root.userData.isGltfModelRoot = true;
        const scenePart = await loadGLB(url, root);
        scene.add(root);
        applyTransformToGroup(root, url, transformRules);
        applyMaterialRulesToRoot(root, url, materialRules);
        console.info("[模型] 已加载:", url, scenePart);
      } catch (e) {
        console.warn("[模型] 跳过:", url, e);
      }
    }
  } else if (ALLOW_DISCOVER_ALL_GLBS) {
    await loadDiscoveredModels(scene, [], transformRules, materialRules);
  } else {
    console.info(
      "[模型] 未加载 glb：在 models.manifest.json 里设 autoDiscover:true（默认）并放入 optimized/；或设 autoDiscover:false 后填写 models 列表"
    );
  }

  const glbAttractionIds = collectGlbAttractionIds(scene);

  // 计算每个绑定了景点的 GLB 模型的世界空间最高 Y——用于让标签自适应模型高度
  /** @type {Map<string, number>} attractionId → model world-space max Y */
  const modelTopYMap = new Map();
  scene.traverse((obj) => {
    if (!obj.userData?.isGltfModelRoot) return;
    const poiId = obj.userData.pickableAttractionId;
    if (!poiId) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const topY = box.max.y;
    // 同一个景点可能有多个模型，取最大值
    const prev = modelTopYMap.get(poiId);
    if (prev == null || topY > prev) modelTopYMap.set(poiId, topY);
  });

  // 旋转木马（fantasia-carousel）选中态飞马旋转动效：模型加载后扫描节点
  const carouselSpin = createCarouselSpin(scene);
  carouselSpin.discover();

  rebuildAttractionMarkers(scene, merged, glbAttractionIds);
  if (SHOW_WAIT_LABELS_3D && waitLabels) {
    waitLabels.rebuild();
    waitLabels.setAttractionLabelsVisible(true);
  }

  if (SHOW_MAP_PINS) {
    const pins = await loadPinsDoc();
    if (pins.length) addMapPins(scene, pins);
  }

  const lines = new LineOverlays(scene);
  lines.setCamera(camera);
  const paradeDoc = await loadParadeDoc();
  if (paradeDoc?.points?.length) {
    lines.setParadePolyline(paradeDoc.points);
  }

  // 园区常驻白色路网（静态预生成，源自高德步行 API）
  const parkRoadsDoc = await loadParkRoadsDoc();
  if (parkRoadsDoc?.roads?.length) {
    lines.setParkRoads(parkRoadsDoc.roads);
  }

  window.addEventListener("route-preview", (e) => {
    const d = e.detail || {};

    if (Array.isArray(d.polyline) && d.polyline.length > 0) {
      lines.setDenseWalkRoute(d.polyline, {
        animate: Boolean(d.animate),
        segments: d.segments,
        provider: d.provider || undefined,
      });
    } else {
      lines.setRoutePreview(d.ordered || []);
    }

    const hasPoly = Array.isArray(d.polyline) && d.polyline.length > 0;
    const hasOrdered = Array.isArray(d.ordered) && d.ordered.length > 0;

    if (!hasPoly && !hasOrdered) {
      lastRouteHighlightIds = null;
      lastRouteSegments = null;
      waitLabels?.clearRouteBadge();
      setRouteMarkerHighlight(scene, null);
      waitLabels?.setAttractionLabelsVisible(true);
      waitLabels?.refresh();
      return;
    }

    // 始终保持排队时间标签可见
    waitLabels?.setAttractionLabelsVisible(true);

    if (Array.isArray(d.attractionIds) && d.attractionIds.length > 0) {
      lastRouteHighlightIds = [...d.attractionIds];
    } else if (hasOrdered) {
      lastRouteHighlightIds = d.ordered.map((o) => o.id).filter(Boolean);
    } else {
      lastRouteHighlightIds = null;
    }

    setRouteMarkerHighlight(scene, lastRouteHighlightIds);

    if (hasPoly && waitLabels) {
      if (Array.isArray(d.segments) && d.segments.length > 0) {
        lastRouteSegments = d.segments;
        waitLabels.setRouteSegmentBadges(d.segments, (pts) => polylineHalfwayPoint(pts));
      } else {
        lastRouteSegments = null;
        waitLabels.clearRouteBadge();
      }
    } else {
      lastRouteSegments = null;
      waitLabels?.clearRouteBadge();
    }

    waitLabels?.refresh();

    if (d.focusCamera && (hasPoly || hasOrdered)) {
      rig.focusOnRoute(hasPoly ? d.polyline : null, d.ordered);
    }
  });

  window.addEventListener("parade-toggle", (e) => {
    lines.setParadeVisible(!!e.detail?.visible);
  });

  // 推荐列表变更后立即刷新地图标签（移除已加入推荐的景点的“加入推荐”按钮）
  window.addEventListener("recommend-list-changed", () => {
    waitLabels?.refresh();
  });

  window.addEventListener("map-pin-clicked", (e) => {
    const aid = e.detail?.attractionId;
    const label = e.detail?.label || "地图标点";
    if (aid) {
      const a = merged.find((x) => x.id === aid);
      if (a) {
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { attraction: a } }));
        return;
      }
    }
    showToast(label, "info");
  });

  if (!SHOW_ATTRACTION_LIST_PANEL) {
    uiRoot.style.display = "none";
  }

  const panelApi = SHOW_ATTRACTION_LIST_PANEL
    ? mountLeftPanel(uiRoot, {
        getData: () => merged,
      })
    : { refresh: () => {} };

  // mountDetailCard();

  bindAttractionPicking(renderer, camera, scene, (id) => merged.find((x) => x.id === id));
  bindCalibrationXZPick(renderer, camera, SHOW_ORIGIN_CALIBRATION_MARKER || COPY_SCENE_XZ_ON_SHIFT_CLICK);
  bindLbsMapPick(renderer, camera, true);

  // —— LBS 自动定位 ——
  let didInitialFocus = false;

  // URL 开关：?realLbs=1 走真实 GPS；?mockLbs=loop 启动持续 mock；默认单点 mock
  const _urlParams = new URLSearchParams(window.location.search);
  const _useRealLbs = _urlParams.get("realLbs") === "1";
  const _mockLbsMode = _urlParams.get("mockLbs"); // 'loop' 或 null

  const lbsBar = mountLbsStatusBar({
    onRetry: () => startLbsWatch(),
    onManualPick: () => enterManualPickMode(renderer, camera),
    // 仅 mock 模式（默认 / ?mockLbs=loop）下显示「换个位置」按钮
    showShuffle: !_useRealLbs,
    onShuffle: () => {
      // 重新随机一个园内 mock 点；不重置 didInitialFocus，相机不再 fly-to。
      // mock loop 模式下不重置 setInterval 节奏，下一次自动刷新仍按原始时刻触发。
      const { lat, lng } = mockRandomInParkLocation();
      void emitMockLocation(lat, lng);
    },
    onCopyCameraCoords: () => {
      const p = camera.position;
      const t = rig.controls.target;
      const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "NaN");
      const text =
        `Camera Position: x=${fmt(p.x)}, y=${fmt(p.y)}, z=${fmt(p.z)}\n` +
        `Camera Target: x=${fmt(t.x)}, y=${fmt(t.y)}, z=${fmt(t.z)}`;
      console.log(text);
      const onCopied = () => showToast("相机坐标已复制", "info");
      const onFailed = () => showToast("复制失败，请查看控制台", "error");
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(onCopied).catch(onFailed);
        } else {
          onFailed();
        }
      } catch {
        onFailed();
      }
    },
  });

  /** mock 路径：在园内随机取点并派发 */
  async function startLbsMock(loop = false) {
    // 切换时清理另一路径
    stopAutoLocationWatch();

    if (loop) {
      // loop 内部会立即首次 + 定时刷新
      stopMockLocationLoop();
      startMockLocationLoop({ interval: 30000 });
      lbsBar.setState("on", "已模拟定位（每30s刷新）");
    } else {
      stopMockLocationLoop();
      // 固定 mock 初始位置（场景坐标），跳过经纬度转换
      dispatchUserLocation({ scene_x: -2, scene_z: -21.7, source: "mock" });
      lbsBar.setState("on", "已模拟定位（固定位置）");
    }

    if (!didInitialFocus) {
      didInitialFocus = true;
      window.dispatchEvent(new CustomEvent("focus-user-location"));
    }
  }

  function startLbsReal() {
    lbsBar.setState("loading", "定位中…");
    // 切换时清理 mock loop
    stopMockLocationLoop();
    stopAutoLocationWatch();
    startAutoLocationWatch({
      onUpdate: (detail) => {
        lbsBar.setState("on", "定位已开启");
        // 首次定位成功 → 相机飞过去
        if (!didInitialFocus) {
          didInitialFocus = true;
          window.dispatchEvent(new CustomEvent("focus-user-location"));
        }
      },
      onError: (code, msg) => {
        let tip = "";
        if (code === 1) {
          tip = "定位权限被拒绝，可在浏览器地址栏左侧重新授予；或点击下方手动选点";
        } else if (code === 2) {
          tip = "无法获取位置信号，可手动在地图上选点";
        } else if (code === 3) {
          tip = "定位超时，请重试或手动在地图上选点";
        } else {
          tip = msg || "定位失败";
        }
        lbsBar.setState("failed", tip);
        showToast(tip, "error");
      },
    });
  }

  function startLbsWatch() {
    if (_useRealLbs) {
      startLbsReal();
    } else if (_mockLbsMode === "loop") {
      void startLbsMock(true);
    } else {
      // 默认：单次随机 mock；重试时会再随机一个新点
      void startLbsMock(false);
    }
  }

  // 手动选点成功后更新状态条
  window.addEventListener("lbs-location-set", () => {
    lbsBar.setState("on", "已手动选点");
    if (!didInitialFocus) {
      didInitialFocus = true;
    }
  });

  // 场景加载完成后自动启动 GPS（intro 动画结束后触发以避免权限弹窗被静默拒绝）
  void introDone.then(() => setTimeout(() => {
    didInitialFocus = true; // 不自动飞到 LBS，保持地图模式初始视角
    startLbsWatch();
  }, 200));

  // LBS 默认位置与行中推荐：在用户完成「智能规划」后由 planner / inParkGuide 触发

  // Restore labels when user interacts with scene (scroll/drag)
  // 但如果本次 pointerdown 命中了景点（已触发 focusOn），则不清除焦点
  let _attractionClickedThisPointer = false;
  canvas.addEventListener("pointerdown", () => {
    // 延迟到下一帧判断，确保 interaction.js 的 raycaster 和 attraction-clicked 先执行完毕
    setTimeout(() => {
      if (_attractionClickedThisPointer) {
        _attractionClickedThisPointer = false;
        return;
      }
      if (waitLabels) waitLabels.clearFocus();
      // 取消选中：停止旋转木马动画
      carouselSpin.setActive(false);
    }, 0);
  });

  window.addEventListener("attraction-clicked", (e) => {
    _attractionClickedThisPointer = true;
    // 延迟重置，保证 setTimeout(0) 中的 clearFocus 检查能看到 true
    setTimeout(() => { _attractionClickedThisPointer = false; }, 80);
    let { attraction, modelRoot, hitPoint, id } = e.detail || {};

    // 统一 id：地图点击携带 attraction.id；面板/外部派发可能只携带 id
    const focusId = attraction?.id || id;
    if (!focusId) return;

    // ⚠️ 关键：先聚焦 wait-marker（设置 focused class / opacity / transform / 重建按钮），
    // 再做其他可能耗时或异步的操作（modelRoot 解析、相机过渡等），
    // 确保两条路径（地图点击 / 面板点击）的 wait-marker 状态完全一致，
    // 不会被后续 refresh()/rebuild() 或异步回调覆盖。
    if (waitLabels) waitLabels.focusOn(focusId);

    // 兼容只传 id 的情况（如 planner-dock 卡片点击）：在 focusOn 之后再补全 attraction
    if (!attraction && id) {
      attraction = merged.find((x) => x.id === id);
      if (!attraction) return;
    }
    if (!attraction) return;

    // 没有 modelRoot 时，优先按 GLB 根节点的 pickableAttractionId 精确匹配
    // （比 mesh 级 attractionId 更可靠：避免命中 marker 球后向上找不到 GLB 根的问题）
    if (!modelRoot) {
      scene.traverse((obj) => {
        if (modelRoot) return;
        if (
          obj.userData?.isGltfModelRoot &&
          obj.userData?.pickableAttractionId === attraction.id
        ) {
          modelRoot = obj;
        }
      });
    }

    // 选中目标是否为旋转木马 → 启动/停止飞马旋转
    carouselSpin.setActive(focusId === carouselSpin.attractionId);

    if (modelRoot) {
      rig.focusOnModelRoot(modelRoot);
    } else if (hitPoint) {
      rig.focusAtWorldPoint(new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z), 16);
    } else {
      // 无 GLB 模型时，回退到 marker 球的世界坐标（与地图点击 hitPoint 路径一致）
      let target = null;
      const markersGroup = scene.getObjectByName("AttractionMarkers");
      if (markersGroup) {
        const marker = markersGroup.children.find(
          (m) => m.userData?.attractionId === attraction.id
        );
        if (marker) {
          target = new THREE.Vector3();
          marker.getWorldPosition(target);
        }
      }
      // 最后兜底：使用 merged 中的 position 字段（注意是嵌套对象 position.x/y/z，
      // 不是数据库原始的 position_x/y/z；此前误用前者导致永远聚焦到原点）
      if (!target && attraction.position) {
        target = new THREE.Vector3(
          attraction.position.x ?? 0,
          attraction.position.y ?? 0,
          attraction.position.z ?? 0
        );
      }
      if (target) rig.focusAtWorldPoint(target, 16);
    }
  });

  // 快速导航：从当前 LBS 定位直接导航到选中景点
  window.addEventListener("quick-navigate", async (e) => {
    const id = e.detail?.id;
    if (!id) return;
    const loc = lastUserLocation;
    if (!loc || loc.scene_x == null || loc.scene_z == null) {
      showToast("无法获取当前位置，请开启定位", "error");
      return;
    }
    try {
      const result = await fetchWalkToNext(loc.scene_x, loc.scene_z, id);
      if (!result || !Array.isArray(result.points) || result.points.length === 0) {
        showToast("未找到导航路线", "error");
        return;
      }
      const target = merged.find((x) => x.id === id);
      const ordered = target
        ? [{ id: target.id, name: target.name, position: target.position }]
        : [{ id }];
      // 更新 LBS 箭头指向目标景点
      if (target?.position) {
        userLbs.setTarget({ x: target.position.x, z: target.position.z });
      }
      window.dispatchEvent(
        new CustomEvent("route-preview", {
          detail: {
            polyline: result.points,
            ordered,
            attractionIds: [id],
            segments: result.segments || [],
            provider: result.provider || undefined,
            focusCamera: true,
          },
        })
      );
      // 快速导航已通过 focusOnRoute 处理相机（含 LBS 位置包围盒），无需额外聚焦用户位置
    } catch (err) {
      console.error("[quick-navigate] error:", err);
      showToast("导航失败，请重试", "error");
    }
  });

  // 导航启停切换：
  // - active: false  → 清除已绘制的路径（红色管道 + 方向箭头）与高亮。
  // - active: true   → 不做额外处理；plannerApp 在该分支会同时派发 quick-navigate，
  //                    由上方处理器完成后端路线获取与绘制。
  window.addEventListener("navigation-toggled", (e) => {
    const active = e.detail?.active;
    if (active === false) {
      window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));
    }
  });

  async function refreshLists() {
    const raw = await fetchAttractions();
    const w = await fetchWaitTimes();
    merged = mergeAttractions(raw, w);
    panelApi.refresh();
    rebuildAttractionMarkers(scene, merged, collectGlbAttractionIds(scene));
    waitLabels?.rebuild();
    setRouteMarkerHighlight(scene, lastRouteHighlightIds);
    if (lastRouteSegments?.length && waitLabels) {
      waitLabels.setRouteSegmentBadges(lastRouteSegments, (pts) => polylineHalfwayPoint(pts));
    }
  }

  // [已禁用] 排队时间改为使用真实数据，移除自动刷新
  // window.setInterval(() => void refreshLists(), 60_000);

  hideLoading();

  mountPlannerApp();

  const userLbs = new UserLocationMarker(scene);

  /** 最新一次用户位置（供 quick-navigate 等事件使用） */
  let lastUserLocation = null;

  window.addEventListener("user-location-updated", (e) => {
    const d = e.detail || {};
    if (d.scene_x == null || d.scene_z == null) return;
    lastUserLocation = d;
    userLbs.setPosition(d.scene_x, d.scene_z);
  });

  window.addEventListener("focus-user-location", async () => {
    if (rig._introPromise) await rig._introPromise;
    const g = scene.getObjectByName("UserLBS");
    if (!g?.visible) return;
    rig.focusTopDownAtWorldPoint(g.position.clone().setY(0), { height: 60 });
  });

  window.addEventListener("user-location-clear", () => {
    userLbs.hide();
  });

  window.addEventListener("inpark-next-updated", async (e) => {
    const d = e.detail;
    if (!d?.next?.id) {
      waitLabels?.setInParkNextStop(null);
      waitLabels?.clearFocus();
      window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));
      userLbs.clearTarget();
      return;
    }

    waitLabels?.setInParkNextStop(d.next.id);
    waitLabels?.setAttractionLabelsVisible(true);

    // 让贴地三角箭头始终指向「下一个景点」
    if (d?.next?.position) {
      userLbs.setTarget({ x: d.next.position.x, z: d.next.position.z });
    } else {
      userLbs.clearTarget();
    }

    const loc = d.location;
    const nx = d.next;
    let polyline = null;
    let segments = [];

    if (loc?.scene_x != null && loc?.scene_z != null) {
      try {
        const walk = await fetchWalkToNext(loc.scene_x, loc.scene_z, nx.id);
        if (walk?.points?.length) {
          polyline = walk.points;
          segments = walk.segments || [];
          // provider 透传给 route-preview 供颜色区分
          const walkProvider = walk.provider || null;
        }
      } catch (err) {
        console.warn("[inpark] LBS→下一站 步行规划失败，使用直线:", err);
      }
      if (!polyline?.length) {
        polyline = [
          { x: loc.scene_x, y: 0.85, z: loc.scene_z },
          { x: nx.position.x, y: nx.position.y ?? 0.85, z: nx.position.z },
        ];
        segments = [
          {
            fromName: "我的位置",
            toName: nx.name,
            distanceMeters: 0,
            durationSeconds: Math.max(60, (nx.walkMinutes || 5) * 60),
            points: polyline,
          },
        ];
      }
    }

    window.dispatchEvent(
      new CustomEvent("route-preview", {
        detail: {
          polyline,
          ordered: [{ id: nx.id, name: nx.name, position: nx.position }],
          attractionIds: [nx.id],
          segments,
          focusCamera: false,
          hidePoiLabels: false,
          inParkLeg: true,
        },
      })
    );

    if (loc?.scene_x != null && nx.position) {
      rig.focusOnLbsAndNext(
        { x: loc.scene_x, y: 0, z: loc.scene_z },
        { x: nx.position.x, y: nx.position.y ?? 0, z: nx.position.z }
      );
    }
  });

  function onResize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    waitLabels?.setSize(w, h);
    lines.setRouteLineResolution(w, h);
    rig.resize();
  }
  window.addEventListener("resize", onResize);

  function tick() {
    rig.update(1 / 60);
    lines.tick();
    userLbs.tick();
    carouselSpin.update(1 / 60);
    composer.render();
    waitLabels?.render(camera);
    // updateCameraDebug(camera, rig);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // —— Camera debug overlay ——
  function updateCameraDebug(cam, rig) {
    let el = document.getElementById("cam-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "cam-debug";
      el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:8px;background:rgba(0,0,0,0.7);color:#0f0;font:12px/1.6 monospace;pointer-events:none;white-space:pre;";
      document.body.appendChild(el);
    }
    const p = cam.position;
    const t = rig.controls.target;
    el.textContent =
      `camera.position: [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]\n` +
      `controls.target: [${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}]`;
  }
}

main().catch((e) => {
  console.error(e);
  hideLoading();
});
