/**
 * main_pretrip.js
 * ═══════════════
 * 行前模式入口。
 * 基于 main_new.js 结构，关键差异：
 * - 使用 mock 预测数据替代真实 API
 * - 不启动 LBS 定位
 * - 导入 plannerPretrip.js 替代 plannerApp.js
 * - 保留 3D 场景加载
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
import { showToast } from "./ui/toast.js";
import { showLoading, hideLoading } from "./ui/loading.js";
import { mountPlannerPretrip } from "./plannerPretrip.js";
import { ATTRACTIONS_MOCK, getCurrentPredictedWaits } from "./mockPredictions.js";

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

// ─── 数据合并工具（行前版：使用 mock 数据） ───
function mergeAttractionsPretrip(mockAttractions, predictedWaits) {
  return (mockAttractions || []).map((a) => {
    const w = predictedWaits[a.id];
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

// ─── 数据加载（复用 3D 配置文件） ───
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
// 行前模式全局标志：供共享模块（如 waitLabels.js）识别并跳过闭园/暂停开放判断
if (typeof window !== "undefined") {
  window.__PRETRIP_MODE__ = true;
}

async function main() {
  startFakeLoadingProgress();
  showLoading();

  // ─── 行前模式：隐藏3D标签中的"开始导航"按钮 ───
  const _pretripStyle = document.createElement("style");
  _pretripStyle.textContent = ".wait-marker__btn-navigate { display: none !important; }";
  document.head.appendChild(_pretripStyle);

  const canvas = document.getElementById("c");
  const uiRoot = document.getElementById("ui-root");

  // ─── 创建 3D 场景管理器 ───
  const scene3d = new SceneManager(canvas, {
    target: DEFAULT_CAMERA_TARGET,
    position: DEFAULT_CAMERA_POSITION,
  });

  // UI 配置
  if (!SHOW_ATTRACTION_LIST_PANEL) {
    uiRoot.style.display = "none";
  }
  setupMapModeButton(scene3d);

  // 底部悬浮面板（行前版）
  mountPlannerPretrip();

  // ═══════════════════════════════════════════════════════════════
  // ★ 3D 场景初始化
  // ═══════════════════════════════════════════════════════════════
  let introDone = Promise.resolve();
  let merged = [];

  try {
    await scene3d.init();

    // 入场动画
    introDone = scene3d.playIntro({ duration: 3000 });

    // ─── 使用 mock 预测数据 ───
    const predictedWaits = getCurrentPredictedWaits();
    merged = mergeAttractionsPretrip(ATTRACTIONS_MOCK, predictedWaits);

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

    // ─── 行前模式：日期Tab切换后联动刷新 3D 排队时间标签 ───
    window.addEventListener('predicted-waits-updated', (e) => {
      const newWaitMap = e.detail?.waitMap;
      if (!newWaitMap || !merged || merged.length === 0) return;

      // 同步更新 merged 中的排队数据
      for (const a of merged) {
        const w = newWaitMap[a.id];
        if (w) {
          a.waitMinutes = w.waitMinutes;
          a.status = w.status;
        }
      }

      // 重建3D标签
      if (SHOW_WAIT_LABELS_3D) {
        scene3d.rebuildWaitLabels(merged, modelTopYMap);
      }
    });

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

    console.info("[main-pretrip] 3D 场景初始化完成");
  } catch (sceneErr) {
    console.error("[main-pretrip] 3D 场景初始化失败:", sceneErr);
  }

  // ─── 事件绑定（3D → 框架） ───
  let _carouselActiveUntil = 0;
  let _justClickedAttraction = false;
  let _from3dCallback = false; // 防止 attraction-clicked 事件循环

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

    // 特殊景点固定视角
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

    _from3dCallback = true;
    window.dispatchEvent(
      new CustomEvent("attraction-clicked", { detail: { attraction, hitPoint } })
    );
    _from3dCallback = false;
  });

  scene3d.onMapPinClicked((pinId, label, attractionId) => {
    if (attractionId) {
      const a = merged.find((x) => x.id === attractionId);
      if (a) {
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { attraction: a } }));
        return;
      }
    }
    showToast(label, "info");
  });

  // ─── 面板卡片点击 → 3D联动 ───
  window.addEventListener("attraction-clicked", (e) => {
    // 从3D场景内部触发的事件已在 onAttractionClicked 中处理
    if (_from3dCallback) return;
    const id = e.detail?.id || e.detail?.attraction?.id;
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

  canvas.addEventListener("pointerup", (e) => {
    setTimeout(() => {
      if (_justClickedAttraction) {
        _justClickedAttraction = false;
        return;
      }
      scene3d.clearLabelFocus();
      if (Date.now() >= _carouselActiveUntil) {
        scene3d.setCarouselActive(false);
      }
    }, 0);
  });

  // ─── 标签点击 → 选中景点 + 相机聚焦 ───
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
      scene3d.setRouteHighlight(null);
      scene3d.setLabelsVisible(true);
      return;
    }

    let highlightIds = null;
    if (Array.isArray(d.attractionIds) && d.attractionIds.length > 0) {
      highlightIds = [...d.attractionIds];
    } else if (Array.isArray(d.ordered)) {
      highlightIds = d.ordered.map((o) => o.id).filter(Boolean);
    }
    scene3d.setRouteHighlight(highlightIds);
    scene3d.setLabelsVisible(true);

    if (d.focusCamera) {
      scene3d.focusOnRoute(d.polyline || null, d.ordered);
    }
  });

  window.addEventListener("parade-toggle", (e) => {
    scene3d.setParadeVisible(!!e.detail?.visible);
  });

  // ─── 完成 ───
  hideLoading();
  finishLoadingProgress();
}

// ─── 辅助：右上角地图模式按钮 ───
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
  btn.style.bottom = "223px";
}

main().catch((e) => {
  console.error(e);
  hideLoading();
  finishLoadingProgress();
});
