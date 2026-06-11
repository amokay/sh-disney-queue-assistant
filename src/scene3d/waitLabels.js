/**
 * scene3d/waitLabels.js
 * ─────────────────────
 * HTML overlay 标签层：景点名称 + 排队时间 + 颜色分级 + 推荐按钮。
 * Leader 竖线用 3D 管道（跟模型一起渲染），卡片用 DOM overlay 投影对齐管道顶部。
 */

import { waitColorClass } from "../config.js";

const LABEL_Y_OFFSET_DEFAULT = 5;
const LABEL_ABOVE_MODEL = 3;
const LEADER_Y_BOTTOM = 1;
const LEADER_Y_TOP_GAP = 0.3;
const LABEL_Y_MAX = 18;
const LEADER_RADIUS = 0.05;

// ── 堆叠优先级常量 ──
const OVERLAP_CHECK_EVERY = 6;        // 每6帧检测一次重叠（约10次/秒）
const LABEL_EST_WIDTH = 120;           // 标签估计宽度(px)
const LABEL_EST_HEIGHT = 45;           // 标签估计高度(px)
const OVERLAP_MARGIN = 10;             // 重叠判定额外边距(px)

const OPACITY_FULL = 1.0;
const OPACITY_DIMMED = 0.3;

const PRIORITY_MUST_PLAY = 3;
const PRIORITY_POPULAR = 2;
const PRIORITY_NORMAL = 1;

const MUST_PLAY_NAMES = new Set([
  "创极速光轮",
  "加勒比海盗——沉落宝藏之战",
  "七个小矮人矿山车",
  "热力追踪",
  "翡翔·飞越地平线",
  "雷鸣山漂流",
]);

let _userSceneX = null;
let _userSceneZ = null;
let _currentNavigatingId = null;

window.addEventListener("user-location-updated", (e) => {
  const { scene_x, scene_z } = e.detail || {};
  if (scene_x != null) _userSceneX = scene_x;
  if (scene_z != null) _userSceneZ = scene_z;
});

/**
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.Camera} camera
 * @param {BABYLON.Engine} engine
 * @param {HTMLElement} container
 */
export function createWaitLabelOverlay(scene, camera, engine, container) {
  const BABYLON = window.BABYLON;
  const canvas = engine.getRenderingCanvas();

  // 事件委托
  let _delegateBound = false;
  function ensureDelegate() {
    if (_delegateBound) return;
    _delegateBound = true;
    document.addEventListener("click", (ev) => {
      // 「开始导航」按钮
      const navBtn = ev.target?.closest?.(".wait-marker__btn-navigate");
      if (navBtn) {
        ev.stopPropagation();
        ev.preventDefault();
        const id = navBtn.getAttribute("data-id");
        if (id) window.dispatchEvent(new CustomEvent("start-navigation", { detail: { id } }));
        return;
      }
    });
  }
  ensureDelegate();

  // 监听导航状态切换，正在导航的项目其排队标签不展示"开始导航"按钮
  window.addEventListener("navigation-toggled", (e) => {
    const { id, active } = e.detail || {};
    _currentNavigatingId = active ? id : null;
    // 刷新该标签的HTML以隐藏/显示按钮
    if (id && labels.has(id)) {
      const entry = labels.get(id);
      if (entry && entry.el) {
        entry.el.innerHTML = buildHtml(entry.attraction);
      }
    }
  });

  // 共享 leader 材质
  const _leaderMat = new BABYLON.StandardMaterial("leaderLineMat", scene);
  _leaderMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  _leaderMat.emissiveColor = new BABYLON.Color3(0.7, 0.7, 0.7);
  _leaderMat.alpha = 0.45;
  _leaderMat.disableLighting = true;
  _leaderMat.backFaceCulling = false;

  /**
   * @type {Map<string, {
   *   el: HTMLElement,
   *   topWorldPos: BABYLON.Vector3,
   *   leaderMesh: BABYLON.Mesh | null,
   *   attraction: object,
   * }>}
   */
  const labels = new Map();
  let _visible = true;
  let _focusedId = null;
  let _overlapFrame = 0;
  let _inParkNextId = null;
  let _expandedOtherId = null;
  let _attractions = [];
  let _modelTopYMap = new Map();

  // ─── 工具 ───

  function esc(s) {
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function markerMode(aid) {
    if (!_inParkNextId) return "normal";
    if (aid === _inParkNextId) return "next";
    if (aid === _expandedOtherId) return "expanded";
    return "collapsed";
  }

  function isParkClosed() {
    // 行前模式展示的是预估排队时间（未来某天），不应根据当前时间判断闭园
    if (typeof window !== "undefined" && window.__PRETRIP_MODE__) return false;
    const h = new Date().getHours();
    return h >= 21 || h < 8;
  }

  function buildHtml(a) {
    const wm = a.waitMinutes;
    // 行前模式忽略 closed 状态，统一展示预估排队时间
    const isPretrip = typeof window !== "undefined" && window.__PRETRIP_MODE__;
    const closed = !isPretrip && a.status === "closed";
    let waitText;
    if (isParkClosed()) waitText = "已关闭";
    else if (closed) waitText = "暂停开放";
    else if (wm == null || Number.isNaN(wm)) waitText = "暂无数据";
    else waitText = `排队${wm}分钟`;

    const cls = isParkClosed() || closed ? "wait-color--closed" : waitColorClass(wm);
    const name = esc(a.name || a.id);
    const mode = markerMode(a.id);
    const aid = esc(a.id);

    if (mode === "next") {
      return `<div class="wait-marker__badge">下一站</div><div class="wait-marker__title">${name}</div><div class="wait-marker__wait ${cls}">${waitText}</div>`;
    }
    if (mode === "collapsed") {
      return `<div class="wait-marker__title wait-marker__title--compact">${name}</div><div class="wait-marker__hint">点击展开</div>`;
    }

    const isSelected = mode === "expanded" || (mode === "normal" && a.id === _focusedId);
    const isNavigating = a.id === _currentNavigatingId;
    const navBtnHtml = (isSelected && !isNavigating) ? `<button type="button" class="wait-marker__btn-navigate" data-id="${aid}">开始导航</button>` : "";
    return `<div class="wait-marker__title">${name}</div><div class="wait-marker__wait ${cls}">${waitText}</div><div class="wait-marker__actions">${navBtnHtml}</div>`;
  }

  function classNameFor(aid) {
    let cls = "wait-marker";
    if (_inParkNextId) {
      const m = markerMode(aid);
      if (m === "next") cls += " wait-marker--next";
      else if (m === "collapsed") cls += " wait-marker--collapsed";
      else if (m === "expanded") cls += " wait-marker--expanded";
    } else {
      if (aid === _focusedId) cls += " wait-marker--focused";
    }
    return cls;
  }

  function bindClick(div, aid) {
    div.style.pointerEvents = "auto";
    div.addEventListener("click", (ev) => {
      if (ev.target?.closest?.(".wait-marker__btn-navigate")) return;
      ev.stopPropagation();
      if (_inParkNextId) {
        if (aid === _inParkNextId) return;
        _expandedOtherId = _expandedOtherId === aid ? null : aid;
        refreshAll();
        return;
      }
      window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id: aid } }));
      window.dispatchEvent(new CustomEvent("label-attraction-clicked", { detail: { id: aid } }));
    });
  }

  function refreshAll() {
    for (const [aid, entry] of labels) {
      if (!entry.el) continue;
      entry.el.className = classNameFor(aid);
      entry.el.innerHTML = buildHtml(entry.attraction);
    }
  }

  // ─── Leader 竖线（3D 管道） ───

  function createLeader(x, yBottom, yTop, z, id) {
    if (yTop <= yBottom + 0.1) return null;
    const path = [
      new BABYLON.Vector3(x, yBottom, z),
      new BABYLON.Vector3(x, yTop, z),
    ];
    const tube = BABYLON.MeshBuilder.CreateTube(
      `leader_${id}`,
      { path, radius: LEADER_RADIUS, tessellation: 6, updatable: false },
      scene
    );
    tube.material = _leaderMat;
    tube.isPickable = false;
    return tube;
  }

  // ─── 公共 API ───

  function rebuild(attractions, modelTopYMap) {
    for (const entry of labels.values()) {
      entry.el.remove();
      if (entry.leaderMesh) entry.leaderMesh.dispose();
    }
    labels.clear();

    _attractions = attractions || [];
    _modelTopYMap = modelTopYMap || new Map();
    if (!_attractions.length) return;

    for (const a of _attractions) {
      if (!a?.id || !a.position) continue;

      const py = a.position.y || 0;
      const modelTopY = _modelTopYMap.get(a.id);
      let labelY;
      if (modelTopY != null && modelTopY > py) {
        labelY = Math.min(modelTopY + LABEL_ABOVE_MODEL, LABEL_Y_MAX);
      } else {
        labelY = py + LABEL_Y_OFFSET_DEFAULT;
      }

      const yBottom = py + LEADER_Y_BOTTOM;
      const yTop = labelY - LEADER_Y_TOP_GAP;

      // 3D leader 管道
      const leaderMesh = createLeader(a.position.x, yBottom, yTop, a.position.z, a.id);

      // DOM 卡片
      const el = document.createElement("div");
      el.className = classNameFor(a.id);
      el.dataset.attractionId = a.id;
      el.style.position = "absolute";
      el.style.transform = "translate(-50%, -100%)";
      el.style.willChange = "left, top";
      el.innerHTML = buildHtml(a);
      bindClick(el, a.id);

      if (!_inParkNextId && _focusedId) {
        if (a.id === _focusedId) {
          el.style.opacity = "1";
          el.style.transform = "translate(-50%, -100%) scale(1.05)";
        } else {
          el.style.opacity = "0.25";
          el.style.transform = "translate(-50%, -100%) scale(0.9)";
        }
      }
      container.appendChild(el);

      // 卡片锚点 = leader 管道顶端（卡片底边对齐管道顶）
      const topWorldPos = new BABYLON.Vector3(a.position.x, yTop, a.position.z);

      const entry = { el, topWorldPos, leaderMesh, attraction: a };

      // 分类优先级
      if (MUST_PLAY_NAMES.has(a.name)) {
        entry.priority = PRIORITY_MUST_PLAY;
      } else if (a.popularity_level === 'high') {
        entry.priority = PRIORITY_POPULAR;
      } else {
        entry.priority = PRIORITY_NORMAL;
      }

      labels.set(a.id, entry);
    }
  }

  function focusOn(id) {
    const prev = _focusedId;
    _focusedId = id || null;

    if (_inParkNextId) {
      if (id && id !== _inParkNextId) _expandedOtherId = id;
      refreshAll();
      return;
    }

    for (const [aid, entry] of labels) {
      if (!entry.el) continue;
      entry.el.className = classNameFor(aid);
      if (aid === id) {
        entry.el.style.opacity = "1";
        entry.el.style.transform = "translate(-50%, -100%) scale(1)";
        entry.el.style.zIndex = "1020";
      } else {
        entry.el.style.opacity = "0.25";
        entry.el.style.transform = "translate(-50%, -100%) scale(0.9)";
      }
      if (aid === id || aid === prev) {
        entry.el.innerHTML = buildHtml(entry.attraction);
      }
    }
  }

  function clearFocus() {
    const had = _focusedId;
    _focusedId = null;

    if (_inParkNextId && _expandedOtherId) {
      _expandedOtherId = null;
      refreshAll();
      return;
    }

    for (const [aid, entry] of labels) {
      if (!entry.el) continue;
      entry.el.className = classNameFor(aid);
      entry.el.style.opacity = "1";
      entry.el.style.transform = "translate(-50%, -100%)";
      if (aid === had) entry.el.innerHTML = buildHtml(entry.attraction);
    }
  }

  function setVisible(visible) {
    _visible = visible;
    container.style.display = visible ? "" : "none";
    for (const entry of labels.values()) {
      if (entry.leaderMesh) entry.leaderMesh.isVisible = visible;
    }
  }

  /**
   * 每帧渲染：投影管道顶部世界坐标到屏幕，定位 DOM 卡片。
   * 用 canvas.clientWidth/Height 确保跟 DOM 容器坐标系一致。
   */
  /**
   * 检测标签间的屏幕重叠并应用优先级规则。
   */
  function applyStackingPriority(screenPositions) {
    // 1. 收集所有可见标签的屏幕矩形
    const rects = [];
    for (const [id, entry] of labels) {
      const sp = screenPositions.get(id);
      if (!sp || !sp.visible) continue;

      const halfW = LABEL_EST_WIDTH / 2 + OVERLAP_MARGIN;
      const h = LABEL_EST_HEIGHT + OVERLAP_MARGIN;

      rects.push({
        id,
        entry,
        left: sp.x - halfW,
        right: sp.x + halfW,
        top: sp.y - h,
        bottom: sp.y,
        priority: entry.priority || PRIORITY_NORMAL,
      });
    }

    // 2. Union-Find 检测重叠分组
    const parent = new Map();
    rects.forEach(r => parent.set(r.id, r.id));

    function find(id) {
      while (parent.get(id) !== id) {
        parent.set(id, parent.get(parent.get(id)));
        id = parent.get(id);
      }
      return id;
    }

    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right && a.right > b.left &&
            a.top < b.bottom && a.bottom > b.top) {
          union(a.id, b.id);
        }
      }
    }

    // 3. 按组分类
    const groups = new Map();
    for (const r of rects) {
      const root = find(r.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(r);
    }

    // 4. focused 标签始终最高层
    if (_focusedId) {
      const focusedEntry = labels.get(_focusedId);
      if (focusedEntry) {
        focusedEntry.el.style.zIndex = "1020";
        focusedEntry.el.style.opacity = String(OPACITY_FULL);
      }
    }

    // 5. 对每个组应用优先级规则
    for (const [, members] of groups) {
      if (members.length <= 1) {
        const m = members[0];
        // 单独标签，恢复默认（跳过 focused）
        if (m.id === _focusedId) continue;
        m.entry.el.style.opacity = String(OPACITY_FULL);
        m.entry.el.style.zIndex = String(1000 + m.priority);
        continue;
      }

      const maxPriority = Math.max(...members.map(m => m.priority));

      if (maxPriority === PRIORITY_MUST_PLAY) {
        for (const m of members) {
          if (m.id === _focusedId) continue;
          if (m.priority === PRIORITY_MUST_PLAY) {
            m.entry.el.style.opacity = String(OPACITY_FULL);
            m.entry.el.style.zIndex = "1010";
          } else {
            m.entry.el.style.opacity = String(OPACITY_DIMMED);
            m.entry.el.style.zIndex = String(1000 + m.priority);
          }
        }
      } else if (maxPriority === PRIORITY_POPULAR) {
        for (const m of members) {
          if (m.id === _focusedId) continue;
          if (m.priority === PRIORITY_POPULAR) {
            m.entry.el.style.opacity = String(OPACITY_FULL);
            m.entry.el.style.zIndex = "1008";
          } else {
            m.entry.el.style.opacity = String(OPACITY_DIMMED);
            m.entry.el.style.zIndex = String(1000 + m.priority);
          }
        }
      } else {
        // 全部普通项目 → 选距离用户最近的一个强化
        let closestIdx = 0;
        let closestDist = Infinity;

        for (let i = 0; i < members.length; i++) {
          if (members[i].id === _focusedId) { closestIdx = i; break; }
          const pos = members[i].entry.attraction.position;
          if (!pos) continue;
          const ux = _userSceneX ?? 0;
          const uz = _userSceneZ ?? 0;
          const d = Math.hypot((pos.x ?? 0) - ux, (pos.z ?? 0) - uz);
          if (d < closestDist) {
            closestDist = d;
            closestIdx = i;
          }
        }

        for (let i = 0; i < members.length; i++) {
          if (members[i].id === _focusedId) continue;
          if (i === closestIdx) {
            members[i].entry.el.style.opacity = String(OPACITY_FULL);
            members[i].entry.el.style.zIndex = "1005";
          } else {
            members[i].entry.el.style.opacity = String(OPACITY_DIMMED);
            members[i].entry.el.style.zIndex = "1001";
          }
        }
      }
    }

    // 6. 最终保护：MUST_PLAY 标签永远不降低透明度
    for (const r of rects) {
      if (r.id === _focusedId) continue;
      if (r.priority === PRIORITY_MUST_PLAY) {
        r.entry.el.style.opacity = String(OPACITY_FULL);
        if (parseInt(r.entry.el.style.zIndex || "0") < 1010) {
          r.entry.el.style.zIndex = "1010";
        }
      }
    }
  }

  function render() {
    if (!_visible) return;

    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const viewMatrix = scene.getViewMatrix();
    const projMatrix = scene.getProjectionMatrix();
    const transform = viewMatrix.multiply(projMatrix);
    const viewport = { x: 0, y: 0, width: vw, height: vh };
    const identity = BABYLON.Matrix.Identity();

    _overlapFrame++;
    const screenPosMap = new Map();

    for (const [id, entry] of labels) {
      const sp = BABYLON.Vector3.Project(entry.topWorldPos, identity, transform, viewport);

      if (sp.z < 0 || sp.z > 1) {
        entry.el.style.display = "none";
        continue;
      }

      entry.el.style.display = "";
      entry.el.style.left = `${sp.x}px`;
      entry.el.style.top = `${sp.y}px`;
      // 强制保证 focused 标签始终在最上层，避免被其他标签覆盖
      if (id === _focusedId || entry.el.classList.contains("wait-marker--focused")) {
        entry.el.style.zIndex = "1020";
      }
      screenPosMap.set(id, { x: sp.x, y: sp.y, visible: true });
    }

    // 每 OVERLAP_CHECK_EVERY 帧检测一次堆叠并应用优先级
    if (_overlapFrame % OVERLAP_CHECK_EVERY === 0 && !_focusedId) {
      applyStackingPriority(screenPosMap);
    }
  }

  function dispose() {
    for (const entry of labels.values()) {
      entry.el.remove();
      if (entry.leaderMesh) entry.leaderMesh.dispose();
    }
    labels.clear();
    _leaderMat.dispose();
  }

  return { rebuild, focusOn, clearFocus, setVisible, render, dispose };
}
