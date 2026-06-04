/**
 * main_new.js
 * ═══════════
 * 框架层入口（你同事负责）。
 * 所有 3D 操作通过 SceneManager 接口完成，不直接引用 Babylon/Three。
 *
 * 职责：
 * - UI 编排（面板、标签、Toast）
 * - 事件监听与分发
 * - API 调用
 * - LBS / 地理定位
 * - 路线规划编排
 */

import { SceneManager } from "./scene3d/index.js";
import {
  AUTO_LOAD_GLBS,
  SHOW_BACKEND_MARKERS,
  SHOW_ATTRACTION_LIST_PANEL,
  SHOW_DEMO_TREES,
  SHOW_MAP_PINS,
  SHOW_WAIT_LABELS_3D,
  SHOW_ORIGIN_CALIBRATION_MARKER,
  COPY_SCENE_XZ_ON_SHIFT_CLICK,
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
} from "./config.js";
import { fetchAttractions, fetchWaitTimes } from "./api/attractions.js";
import { mountLeftPanel } from "./ui/panel.js";
import { showToast } from "./ui/toast.js";
import { showLoading, hideLoading } from "./ui/loading.js";
import { mountLbsStatusBar } from "./ui/lbsStatusBar.js";
import { mountPlannerApp } from "./plannerApp.js";
import { fetchWalkToNext } from "./api/planner.js";
import {
  startAutoLocationWatch,
  stopAutoLocationWatch,
  mockRandomInParkLocation,
  emitMockLocation,
  startMockLocationLoop,
  stopMockLocationLoop,
  dispatchUserLocation,
  setLocationFromSceneXZ,
} from "./geoLocation.js";
import { API_BASE } from "./api/base.js";

// ─── 加载进度圆环 ───
let _fakeProgress = 0;
let _progressInterval = null;
let _loadingFinished = false;

function updateLoadingProgress(percent) {
  const fill = document.getElementById('progress-ring-fill') || document.querySelector('.progress-ring__fill');
  if (!fill) return;
  const circumference = 2 * Math.PI * 36; // ≈ 226.2
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  fill.style.strokeDashoffset = String(offset);
}

function startFakeLoadingProgress() {
  if (_progressInterval) return;
  _fakeProgress = 0;
  updateLoadingProgress(0);
  _progressInterval = setInterval(() => {
    if (_loadingFinished) return;
    if (_fakeProgress < 80) {
      _fakeProgress += Math.random() * 3 + 1;
      _fakeProgress = Math.min(_fakeProgress, 80);
      updateLoadingProgress(_fakeProgress);
    }
  }, 200);
}

function finishLoadingProgress() {
  if (_loadingFinished) return;
  _loadingFinished = true;
  if (_progressInterval) {
    clearInterval(_progressInterval);
    _progressInterval = null;
  }
  let current = _fakeProgress;
  const finishInterval = setInterval(() => {
    current += 5;
    if (current >= 100) {
      current = 100;
      clearInterval(finishInterval);
      updateLoadingProgress(100);
      // 短暂停留后淡出
      setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
          setTimeout(() => overlay.remove(), 500);
        }
      }, 300);
      return;
    }
    updateLoadingProgress(current);
  }, 30);
}

// ─── 数据合并工具 ───
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

// ─── 数据加载 ───
async function loadManifestDoc() {
  try {
    const res = await fetch("/assets/3d/config/models.manifest.json");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function loadPinsDoc() {
  try {
    const res = await fetch("/assets/3d/config/map_pins.json");
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

async function loadParadeDoc() {
  try {
    const res = await fetch("/assets/3d/config/parade_route.json");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function loadParkRoadsDoc() {
  try {
    const res = await fetch("/assets/3d/config/park_roads.json");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function loadTreePositions() {
  try {
    const res = await fetch("/assets/3d/config/tree_positions.json");
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════════════
async function main() {
  startFakeLoadingProgress();
  showLoading();
  const canvas = document.getElementById("c");
  const uiRoot = document.getElementById("ui-root");

  // ─── 创建 3D 场景管理器（同步构造，不涉及网络） ───
  const scene3d = new SceneManager(canvas, {
    target: DEFAULT_CAMERA_TARGET,
    position: DEFAULT_CAMERA_POSITION,
  });

  // ═══════════════════════════════════════════════════════════════
  // ★★★ LBS UI 必须在所有 await 之前挂载，确保始终可见 ★★★
  // ═══════════════════════════════════════════════════════════════
  if (!SHOW_ATTRACTION_LIST_PANEL) {
    uiRoot.style.display = "none";
  }
  setupMapModeButton(scene3d);
  setupLbsButton();

  const _urlParams = new URLSearchParams(window.location.search);
  const _useRealLbs = _urlParams.get("realLbs") === "1";
  const _mockLbsMode = _urlParams.get("mockLbs");

  let didInitialFocus = false;
  let _manualPickCleanup = null;

  const lbsBar = mountLbsStatusBar({
    onRetry: () => startLbsWatch(),
    onManualPick: () => {
      // 幂等：如果已在选点模式，先取消
      if (_manualPickCleanup) {
        _manualPickCleanup();
        return;
      }

      const sceneObj = scene3d._scene;
      const canvasEl = scene3d._canvas;
      if (!sceneObj || !canvasEl) {
        showToast("3D 场景未就绪，请稍后再试", "error");
        return;
      }

      const BABYLON = window.BABYLON;
      _manualPickCleanup = (() => {
        let disposed = false;

        window.dispatchEvent(new CustomEvent("lbs-manual-pick-mode", { detail: { active: true } }));
        canvasEl.style.cursor = "crosshair";
        showToast("点击地图地面选择你的位置", "info");

        function onPointerDown(ev) {
          if (ev.button !== 0) return;
          // 忽略修饰键组合
          if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

          // 使用 Babylon scene.pick 获取地面交点
          const pickResult = sceneObj.pick(sceneObj.pointerX, sceneObj.pointerY);
          let hitX, hitZ;

          if (pickResult.hit && pickResult.pickedPoint) {
            hitX = pickResult.pickedPoint.x;
            hitZ = pickResult.pickedPoint.z;
          } else {
            // 退化：射线与 y=0 平面求交
            const ray = sceneObj.createPickingRay(
              sceneObj.pointerX, sceneObj.pointerY,
              BABYLON.Matrix.Identity(),
              sceneObj.activeCamera
            );
            if (ray.direction.y === 0) {
              showToast("未点到地面，请点在地图地面上", "warning");
              return;
            }
            const t = -ray.origin.y / ray.direction.y;
            if (t < 0) {
              showToast("未点到地面，请点在地图地面上", "warning");
              return;
            }
            hitX = ray.origin.x + ray.direction.x * t;
            hitZ = ray.origin.z + ray.direction.z * t;
          }

          void (async () => {
            try {
              await setLocationFromSceneXZ(hitX, hitZ);
              window.dispatchEvent(new CustomEvent("focus-user-location"));
              showToast(`已手动选点 x=${hitX.toFixed(1)}, z=${hitZ.toFixed(1)}`, "success");
            } catch (e) {
              showToast(String(e?.message || e), "error");
            }
          })();

          // 选完自动退出
          cleanup();
          ev.preventDefault();
          ev.stopPropagation();
        }

        function cleanup() {
          if (disposed) return;
          disposed = true;
          _manualPickCleanup = null;
          canvasEl.removeEventListener("pointerdown", onPointerDown, true);
          canvasEl.style.cursor = "";
          window.dispatchEvent(new CustomEvent("lbs-manual-pick-mode", { detail: { active: false } }));
        }

        canvasEl.addEventListener("pointerdown", onPointerDown, true);
        return cleanup;
      })();
    },
    onDrawRoute: () => {
      // TODO: Babylon.js 画路线模式（需实现交互式多点采集）
      console.log("[lbs] 画路线按钮点击 — Babylon.js 版本暂未实现完整交互");
      showToast("画路线功能开发中", "info");
    },
    onEraseRoute: () => {
      // TODO: Babylon.js 擦除路线模式（需实现点击路线删除）
      console.log("[lbs] 擦路线按钮点击 — Babylon.js 版本暂未实现完整交互");
      showToast("擦路线功能开发中", "info");
    },
    showDevTools: !_useRealLbs,
    onCopyCameraCoords: () => {
      console.log("[cam-coord] callback invoked (main_new)");
      try {
        const coords = scene3d.getCameraCoords();
        if (!coords) {
          showToast("相机未就绪，请稍后再试", "error");
          return;
        }
        const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "NaN");
        const text =
          `Camera Position: x=${fmt(coords.position.x)}, y=${fmt(coords.position.y)}, z=${fmt(coords.position.z)}\n` +
          `Camera Target: x=${fmt(coords.target.x)}, y=${fmt(coords.target.y)}, z=${fmt(coords.target.z)}`;
        console.log("[cam-coord]", text);

        // 先同步尝试 execCommand
        let syncCopied = false;
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          syncCopied = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch (_e) {
          syncCopied = false;
        }

        if (syncCopied) {
          showToast("相机坐标已复制", "info");
          return;
        }

        // 同步失败，尝试 async clipboard API
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(text).then(
            () => showToast("相机坐标已复制", "info"),
            (reason) => {
              console.warn("[cam-coord] clipboard write failed:", reason);
              window.prompt("自动复制失败，请手动复制以下坐标：", text.replace("\n", " | "));
              showToast("请从弹窗中手动复制坐标", "info");
            }
          );
        } else {
          window.prompt("自动复制失败，请手动复制以下坐标：", text.replace("\n", " | "));
          showToast("请从弹窗中手动复制坐标", "info");
        }
      } catch (err) {
        console.error("[cam-coord] error:", err);
        showToast("获取相机坐标失败: " + (err.message || err), "error");
      }
    },
  });

  function startLbsWatch() {
    if (_useRealLbs) {
      lbsBar.setState("loading", "定位中…");
      stopMockLocationLoop();
      stopAutoLocationWatch();
      startAutoLocationWatch({
        onUpdate: () => {
          lbsBar.setState("on", "定位已开启");
          if (!didInitialFocus) {
            didInitialFocus = true;
            window.dispatchEvent(new CustomEvent("focus-user-location"));
          }
        },
        onError: (code) => {
          const tips = {
            1: "定位权限被拒绝",
            2: "无法获取位置信号",
            3: "定位超时",
          };
          lbsBar.setState("failed", tips[code] || "定位失败");
        },
      });
    } else {
      stopAutoLocationWatch();
      stopMockLocationLoop();
      dispatchUserLocation({ scene_x: -1.6, scene_z: -20.6, source: "mock" });
      lbsBar.setState("on", "定位｜调试工具");
      if (!didInitialFocus) {
        didInitialFocus = true;
      }
    }
  }

  window.addEventListener("lbs-location-set", () => {
    lbsBar.setState("on", "已手动选点");
  });

  // 立即启动 LBS（不等待 3D 场景准备完成）
  setTimeout(() => {
    didInitialFocus = true;
    startLbsWatch();
  }, 500);

  // 底部悬浮面板（不依赖 3D 场景数据）
  mountPlannerApp();

  // ═══════════════════════════════════════════════════════════════
  // ★ 以下是 3D 场景初始化，包在 try-catch 中，失败不影响 UI
  // ═══════════════════════════════════════════════════════════════
  let introDone = Promise.resolve();
  let merged = [];
  let lastRouteHighlightIds = null;
  let lastUserLocation = null;
  let scene3dReady = false;

  // ★ 提前注册 user-location-updated 监听器，避免 mock 事件在 init() 期间丢失
  window.addEventListener("user-location-updated", (e) => {
    const d = e.detail || {};
    if (d.scene_x == null || d.scene_z == null) return;
    lastUserLocation = d;
    if (scene3dReady) {
      scene3d.setUserPosition(d.scene_x, d.scene_z);
    }
  });

  try {
    await scene3d.init();
    scene3dReady = true;

    // init 完成后，若已有缓存的位置数据，立即应用到 3D 标记
    if (lastUserLocation) {
      scene3d.setUserPosition(lastUserLocation.scene_x, lastUserLocation.scene_z);
    }

    // 入场动画
    introDone = scene3d.playIntro({ duration: 3000 });

    // ─── 加载景点数据 ───
    const rawAttractions = await fetchAttractions();
    const waits = await fetchWaitTimes();
    merged = mergeAttractions(rawAttractions, waits);

    // ─── 加载模型 ───
    const manifest = (await loadManifestDoc()) || {};
    await scene3d.loadModels(manifest);

    const glbAttractionIds = scene3d.getLoadedAttractionIds();
    const modelTopYMap = scene3d.getModelTopYMap();

    // ─── 标记 & 标签 ───
    if (SHOW_BACKEND_MARKERS) {
      scene3d.rebuildMarkers(merged, glbAttractionIds);
    }

    if (SHOW_WAIT_LABELS_3D) {
      scene3d.rebuildWaitLabels(merged, modelTopYMap);
      scene3d.setLabelsVisible(true);
    }

    // ─── 树木 ───
    if (SHOW_DEMO_TREES) {
      const treePos = await loadTreePositions();
      scene3d.addTrees(treePos);
    }

    // ─── 地图标点 ───
    if (SHOW_MAP_PINS) {
      const pins = await loadPinsDoc();
      if (pins.length) scene3d.addPins(pins);
    }

    console.info("[main] 3D 场景初始化完成");
  } catch (sceneErr) {
    console.error("[main] 3D 场景初始化失败（LBS UI 不受影响）:", sceneErr);
  }

  // ─── 事件绑定（3D → 框架） ───
  let _carouselActiveUntil = 0;
  let _justClickedAttraction = false; // 防止 pointerup 立即清除选中态
  let _from3dScene = false; // 标记事件来源于3D场景点击，防止监听器重复聚焦

  scene3d.onAttractionClicked((id, hitPoint) => {
    const attraction = merged.find((x) => x.id === id);
    if (!attraction) return;

    _justClickedAttraction = true;

    if (SHOW_WAIT_LABELS_3D) scene3d.focusLabel(id);

    if (id === "fantasia-carousel") {
      scene3d.setCarouselActive(true);
      _carouselActiveUntil = Date.now() + 3000;
    } else {
      if (Date.now() >= _carouselActiveUntil) {
        scene3d.setCarouselActive(false);
      }
    }

    // ★ 小矮人矿山车使用固定视角，覆盖通用逻辑
    if (id === "mine") {
      scene3d.flyToView(
        { x: -5.5, y: 16.0, z: -32.9 },
        { x: -18.9, y: 0.0, z: -57.2 }
      );
    } else if (id === "castle") {
      // ★ 奇幻童话城堡使用固定视角，覆盖通用逻辑
      scene3d.flyToView(
        { x: 9.7, y: 24.8, z: -44.1 },
        { x: -23.0, y: 7.4, z: -42.4 }
      );
    } else if (id === "pirates") {
      // ★ 加勒比海盗使用固定视角，覆盖通用逻辑
      scene3d.flyToView(
        { x: 14.8, y: 21.6, z: -39.0 },
        { x: -2.1, y: 5.2, z: -62.4 }
      );
    } else {
      scene3d.focusOnAttraction(id);
    }

    _from3dScene = true;
    window.dispatchEvent(
      new CustomEvent("attraction-clicked", { detail: { attraction, hitPoint } })
    );
    _from3dScene = false;
  });

  scene3d.onMapPinClicked((pinId, label, attractionId) => {
    if (attractionId) {
      const a = merged.find((x) => x.id === attractionId);
      if (a) {
        _from3dScene = true;
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { attraction: a } }));
        _from3dScene = false;
        return;
      }
    }
    showToast(label, "info");
  });

  // ─── 卡片点击 → 3D 相机聚焦（plannerApp 卡片 → 3D 场景联动） ───
  window.addEventListener("attraction-clicked", (e) => {
    console.log('[LINKAGE] attraction-clicked event received in main_new, _from3dScene:', _from3dScene, 'detail:', JSON.stringify(e.detail?.id || e.detail?.attraction?.id));
    if (_from3dScene) {
      console.log('[LINKAGE] skipping (from 3D scene)');
      return;
    }
    const id = e.detail?.id || e.detail?.attraction?.id;
    if (!id) {
      console.warn('[LINKAGE] No id in event detail, skipping. detail:', e.detail);
      return;
    }

    console.log('[LINKAGE] card→3D focus, id:', id, 'scene3dReady:', scene3dReady);

    try {
      _justClickedAttraction = true;

      // focusLabel 独立 try-catch，避免标签错误阻断相机聚焦
      if (SHOW_WAIT_LABELS_3D) {
        try {
          scene3d.focusLabel(id);
        } catch (labelErr) {
          console.warn('[LINKAGE] focusLabel error (non-fatal):', labelErr.message);
        }
      }

      // 特殊景点使用固定视角
      if (id === "mine") {
        console.log('[LINKAGE] flyToView: mine');
        scene3d.flyToView(
          { x: -5.5, y: 16.0, z: -32.9 },
          { x: -18.9, y: 0.0, z: -57.2 }
        );
      } else if (id === "castle") {
        console.log('[LINKAGE] flyToView: castle');
        scene3d.flyToView(
          { x: 9.7, y: 24.8, z: -44.1 },
          { x: -23.0, y: 7.4, z: -42.4 }
        );
      } else if (id === "pirates") {
        console.log('[LINKAGE] flyToView: pirates');
        scene3d.flyToView(
          { x: 14.8, y: 21.6, z: -39.0 },
          { x: -2.1, y: 5.2, z: -62.4 }
        );
      } else {
        console.log('[LINKAGE] calling focusOnAttraction:', id);
        scene3d.focusOnAttraction(id);
      }
      console.log('[LINKAGE] card→3D focus completed successfully for:', id);
    } catch (err) {
      console.error('[LINKAGE] Error in attraction-clicked handler:', err);
    }
  });
  console.log('[LINKAGE] attraction-clicked listener registered in main_new.js');

  canvas.addEventListener("pointerup", (e) => {
    setTimeout(() => {
      if (_justClickedAttraction) {
        _justClickedAttraction = false;
        return; // 本次点击命中了景点，保持选中态
      }
      scene3d.clearLabelFocus();
      if (Date.now() >= _carouselActiveUntil) {
        scene3d.setCarouselActive(false);
      }
    }, 0);
  });

  // ─── 路线预览事件（框架层 → 3D） ───
  window.addEventListener("route-preview", (e) => {
    const d = e.detail || {};

    if (Array.isArray(d.polyline) && d.polyline.length > 0) {
      scene3d.setDenseWalkRoute(d.polyline, {
        animate: Boolean(d.animate),
        segments: d.segments,
      });
    } else if (Array.isArray(d.ordered) && d.ordered.length > 0) {
      scene3d.setRoutePreview(d.ordered);
    } else {
      scene3d.clearRoute();
      lastRouteHighlightIds = null;
      scene3d.setRouteHighlight(null);
      scene3d.setLabelsVisible(true);
      return;
    }

    if (Array.isArray(d.attractionIds) && d.attractionIds.length > 0) {
      lastRouteHighlightIds = [...d.attractionIds];
    } else if (Array.isArray(d.ordered)) {
      lastRouteHighlightIds = d.ordered.map((o) => o.id).filter(Boolean);
    }
    scene3d.setRouteHighlight(lastRouteHighlightIds);
    scene3d.setLabelsVisible(true);

    if (d.focusCamera) {
      scene3d.focusOnRoute(d.polyline || null, d.ordered);
    }
  });

  window.addEventListener("parade-toggle", (e) => {
    scene3d.setParadeVisible(!!e.detail?.visible);
  });

  // ─── 快速导航 ───

  // 标签上的"开始导航"按钮
  window.addEventListener("start-navigation", (e) => {
    const id = e.detail?.id;
    if (!id) return;
    window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
  });
  
  // 标签点击 → 选中景点 + 相机聚焦（与点击3D模型相同）
  window.addEventListener("label-attraction-clicked", (e) => {
    const id = e.detail?.id;
    if (!id) return;
  
    _justClickedAttraction = true;
  
    if (SHOW_WAIT_LABELS_3D) scene3d.focusLabel(id);
  
    if (id === "mine") {
      scene3d.flyToView(
        { x: -5.5, y: 16.0, z: -32.9 },
        { x: -18.9, y: 0.0, z: -57.2 }
      );
    } else if (id === "castle") {
      scene3d.flyToView(
        { x: 9.7, y: 24.8, z: -44.1 },
        { x: -23.0, y: 7.4, z: -42.4 }
      );
    } else if (id === "pirates") {
      scene3d.flyToView(
        { x: 14.8, y: 21.6, z: -39.0 },
        { x: -2.1, y: 5.2, z: -62.4 }
      );
    } else {
      scene3d.focusOnAttraction(id);
    }
  });

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
      if (!result?.points?.length) {
        showToast("未找到导航路线", "error");
        return;
      }
      const target = merged.find((x) => x.id === id);
      if (target?.position) {
        scene3d.setUserTarget(target.position.x, target.position.z);
      }

      // ★ 导航启动时，自动调整相机使起点和终点都可见
      const endPos = target?.position || (result.points.length ? result.points[result.points.length - 1] : null);
      if (endPos) {
        scene3d.fitNavigationView(
          { x: loc.scene_x, z: loc.scene_z },
          { x: endPos.x, z: endPos.z }
        );
      }

      window.dispatchEvent(
        new CustomEvent("route-preview", {
          detail: {
            polyline: result.points,
            ordered: target ? [{ id: target.id, name: target.name, position: target.position }] : [{ id }],
            attractionIds: [id],
            segments: result.segments || [],
            focusCamera: false, // 已由 fitNavigationView 处理相机，无需重复调整
          },
        })
      );

      // 导航开始后，清除排队时长标签的"开始导航"按钮，回到普通显示模式
      scene3d.clearLabelFocus();
    } catch (err) {
      console.error("[quick-navigate] error:", err);
      showToast("导航失败，请重试", "error");
    }
  });

  window.addEventListener("navigation-toggled", (e) => {
    if (e.detail?.active === false) {
      window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));
    }
  });

  // ─── 用户位置（已在 try-catch 上方提前注册） ───

  window.addEventListener("focus-user-location", async () => {
    await introDone;
    if (lastUserLocation) {
      scene3d.focusTopDown(lastUserLocation.scene_x, lastUserLocation.scene_z, 60);
    }
  });

  window.addEventListener("user-location-clear", () => {
    scene3d.hideUserMarker();
  });

  // ─── 行中推荐：下一站更新 ───
  window.addEventListener("inpark-next-updated", async (e) => {
    const d = e.detail;
    if (!d?.next?.id) {
      scene3d.clearRoute();
      scene3d.setRouteHighlight(null);
      scene3d.clearUserTarget();
      return;
    }

    if (d.next.position) {
      scene3d.setUserTarget(d.next.position.x, d.next.position.z);
    }

    const loc = d.location;
    if (loc?.scene_x != null && loc?.scene_z != null) {
      try {
        const walk = await fetchWalkToNext(loc.scene_x, loc.scene_z, d.next.id);
        if (walk?.points?.length) {
          window.dispatchEvent(
            new CustomEvent("route-preview", {
              detail: {
                polyline: walk.points,
                ordered: [{ id: d.next.id, name: d.next.name, position: d.next.position }],
                attractionIds: [d.next.id],
                segments: walk.segments || [],
                focusCamera: false,
              },
            })
          );
        }
      } catch (err) {
        console.warn("[inpark] 步行规划失败:", err);
      }

      scene3d.focusOnLbsAndNext(
        { x: loc.scene_x, y: 0, z: loc.scene_z },
        { x: d.next.position.x, y: d.next.position.y ?? 0, z: d.next.position.z }
      );
    }
  });

  const panelApi = SHOW_ATTRACTION_LIST_PANEL
    ? mountLeftPanel(uiRoot, { getData: () => merged })
    : { refresh: () => {} };

  // ─── 完成 ───
  hideLoading();

  // 进度圆环填满到 100% 后触发淡出
  finishLoadingProgress();
}

// ─── 辅助：右上角按钮 ───
function setupMapModeButton(scene3d) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "map-mode-btn";
  btn.setAttribute("aria-label", "重置到地图模式初始视角");
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none">
    <path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      d="M1.5 4.5l5-2 5 2 5-2v11l-5 2-5-2-5 2V4.5z"/>
    <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="11.5" y1="4.5" x2="11.5" y2="15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  btn.addEventListener("click", () => {
    scene3d.flyToView(
      { x: 66.9, y: 62.6, z: -3.8 },
      { x: -8.9, y: 0.0, z: -33.4 }
    );
  });
  document.body.appendChild(btn);
}

function setupLbsButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "map-mode-btn lbs-loc-btn";
  btn.setAttribute("aria-label", "我的位置");
  // ★ 内联关键样式，确保即使 CSS 未加载也始终可见
  btn.style.cssText = [
    "position:fixed",
    "bottom:223px",
    "right:12px",
    "z-index:10",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:8px",
    "border-radius:10px",
    "background:rgba(12,14,20,0.82)",
    "border:1px solid rgba(255,255,255,0.12)",
    "color:rgba(255,255,255,0.92)",
    "cursor:pointer",
    "pointer-events:auto",
    "box-shadow:0 6px 20px rgba(0,0,0,0.3)",
    "line-height:0",
  ].join(";");
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="9" cy="9" r="2" fill="currentColor"/>
    <line x1="9" y1="0.5" x2="9" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9" y1="14.5" x2="9" y2="17.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="0.5" y1="9" x2="3.5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.5" y1="9" x2="17.5" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  btn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("focus-user-location"));
  });
  document.body.appendChild(btn);
}

main().catch((e) => {
  console.error(e);
  hideLoading();
  finishLoadingProgress();
});
