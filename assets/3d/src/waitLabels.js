/**
 * scene3d/waitLabels.js
 * ─────────────────────
 * HTML overlay 标签层：景点名称 + 排队时间 + 颜色分级 + 推荐按钮。
 * Leader 竖线用 3D 管道（跟模型一起渲染），卡片用 DOM overlay 投影对齐管道顶部。
 */

import { waitColorClass } from "../config.js";
import { getRecommendedIds } from "../recommendedStore.js";

const LABEL_Y_OFFSET_DEFAULT = 5;
const LABEL_ABOVE_MODEL = 3;
const LEADER_Y_BOTTOM = 1;
const LEADER_Y_TOP_GAP = 0.3;
const LABEL_Y_MAX = 18;
const LEADER_RADIUS = 0.05;

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
      const btn = ev.target?.closest?.(".wait-marker__btn-recommend");
      if (!btn) return;
      ev.stopPropagation();
      ev.preventDefault();
      const id = btn.getAttribute("data-id");
      if (id) document.dispatchEvent(new CustomEvent("add-to-recommend", { detail: { id } }));
    });
  }
  ensureDelegate();

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
    const h = new Date().getHours();
    return h >= 21 || h < 8;
  }

  function buildHtml(a) {
    const wm = a.waitMinutes;
    const closed = a.status === "closed";
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
    const showBtn = isSelected && !getRecommendedIds().has(String(a.id));
    const btnHtml = showBtn ? `<div class="wait-marker__btn-recommend" data-id="${aid}">加入推荐</div>` : "";
    return `<div class="wait-marker__title">${name}</div><div class="wait-marker__wait ${cls}">${waitText}</div>${btnHtml}`;
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
      if (ev.target?.closest?.(".wait-marker__btn-recommend")) return;
      ev.stopPropagation();
      if (_inParkNextId) {
        if (aid === _inParkNextId) return;
        _expandedOtherId = _expandedOtherId === aid ? null : aid;
        refreshAll();
        return;
      }
      window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id: aid } }));
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

      labels.set(a.id, { el, topWorldPos, leaderMesh, attraction: a });
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
  function render() {
    if (!_visible) return;

    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const viewMatrix = scene.getViewMatrix();
    const projMatrix = scene.getProjectionMatrix();
    const transform = viewMatrix.multiply(projMatrix);
    const viewport = { x: 0, y: 0, width: vw, height: vh };
    const identity = BABYLON.Matrix.Identity();

    for (const [, entry] of labels) {
      const sp = BABYLON.Vector3.Project(entry.topWorldPos, identity, transform, viewport);

      if (sp.z < 0 || sp.z > 1) {
        entry.el.style.display = "none";
        continue;
      }

      entry.el.style.display = "";
      entry.el.style.left = `${sp.x}px`;
      entry.el.style.top = `${sp.y}px`;
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
