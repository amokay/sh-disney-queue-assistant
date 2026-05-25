import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { waitColorClass } from "./config.js";

/** 无模型时的兜底卡片离地高度 */
const LABEL_Y_OFFSET_DEFAULT = 14;
/** 标签固定高出模型最高点的距离（场景单位） */
const LABEL_ABOVE_MODEL = 3;
/** 连线起点：略高于地标/模型锚点 */
const LEADER_Y_BOTTOM = 3;
/** 连线终点：几乎贴到卡片底边 */
const LEADER_Y_TOP_GAP = 0.3;
/** 标签 Y 上限，避免飞出可视范围 */
const LABEL_Y_MAX = 28;
/** 竖条宽度（世界单位），约 2× 原先细线观感 */
const LEADER_RIBBON_WIDTH = 0.14;

// 全局事件委托：捕获 .wait-marker__btn-recommend 点击并派发 add-to-recommend
// CSS2DRenderer 容器位于 document.body 之下，统一在 document 层委托
let __recommendDelegateBound = false;

// 已加入「当前推荐项目」的 attraction id 集合。
// 由 plannerApp 通过 setRecommendedIds 同步；buildHtml 据此判断是否渲染「加入推荐」按钮。
let recommendedIds = new Set();

/**
 * 同步当前推荐列表的 attraction id，用于决定 wait-marker 是否显示「加入推荐」按钮。
 * @param {Iterable<string>} ids
 */
export function setRecommendedIds(ids) {
  recommendedIds = new Set(Array.from(ids || []).map((x) => String(x)));
}

function ensureRecommendDelegate() {
  if (__recommendDelegateBound) return;
  __recommendDelegateBound = true;
  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.(".wait-marker__btn-recommend");
    if (!btn) return;
    ev.stopPropagation();
    ev.preventDefault();
    const id = btn.getAttribute("data-id");
    if (!id) return;
    document.dispatchEvent(new CustomEvent("add-to-recommend", { detail: { id } }));
  });
}

const leaderVertexShader = `
  varying float vFade;
  void main() {
    vFade = position.y + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const leaderFragmentShader = `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    float a = clamp(vFade, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
  }
`;

function createSmoothLeaderRibbon(x, yBottom, yTop, z) {
  const height = Math.max(0.02, yTop - yBottom);
  const geo = new THREE.PlaneGeometry(LEADER_RIBBON_WIDTH, 1, 1, 48);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: leaderVertexShader,
    fragmentShader: leaderFragmentShader,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, (yBottom + yTop) * 0.5, z);
  mesh.scale.set(1, height, 1);

  const group = new THREE.Group();
  group.add(mesh);
  group.userData.isLeaderLine = true;
  group.userData.leaderMesh = mesh;
  return group;
}

function disposeLeaderGroup(group) {
  const mesh = group.userData.leaderMesh;
  if (mesh) {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
}

/**
 * 在景点世界坐标上方挂 CSS2D 标签（名称 + 排队分钟）。
 * @param {THREE.Scene} scene
 * @param {() => Array} getMerged
 * @param {() => string[]} getRouteHighlightIds
 * @param {() => Map<string, number>} getModelTopYMap 返回 attractionId → 模型世界空间最高 Y
 */
export function createWaitLabelOverlay(scene, getMerged, getRouteHighlightIds = () => [], getModelTopYMap = () => new Map()) {
  ensureRecommendDelegate();
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "fixed";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  labelRenderer.domElement.style.zIndex = "4";
  labelRenderer.domElement.classList.add("wait-labels-layer");
  document.body.appendChild(labelRenderer.domElement);

  const holder = new THREE.Group();
  holder.name = "WaitLabels";
  scene.add(holder);

  /** @type {Map<string, CSS2DObject>} */
  const byId = new Map();
  let poiLabelsVisible = true;
  /** @type {string | null} */
  let inParkNextId = null;
  /** @type {string | null} */
  let expandedOtherId = null;
  /** 普通模式下，当前被用户点击聚焦的标签 ID */
  /** @type {string | null} */
  let focusedNormalId = null;

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function markerMode(aid) {
    if (!inParkNextId) return "normal";
    if (aid === inParkNextId) return "next";
    if (aid === expandedOtherId) return "expanded";
    return "collapsed";
  }

  /** 判断当前是否处于闭园时段（上海 UTC+8：21:00~次日08:00） */
  function isParkClosed() {
    const now = new Date();
    const h = now.getHours();
    return h >= 21 || h < 8;
  }

  /**
   * 闭园文案：地图标签空间有限，仅显示简短「已关闭」。
   */
  function getClosedText() {
    return "已关闭";
  }

  function buildHtml(a) {
    const wm = a.waitMinutes;
    const isAttractionClosed = a.status === "closed";
    let waitText;
    if (isParkClosed()) {
      waitText = getClosedText();
    } else if (isAttractionClosed) {
      waitText = "暂停开放";
    } else if (wm == null || Number.isNaN(wm)) {
      waitText = "暂无数据";
    } else {
      waitText = `排队${wm}分钟`;
    }
    const cls = isParkClosed() || isAttractionClosed ? "wait-color--closed" : waitColorClass(wm);
    const name = esc(a.name || a.id);
    const mode = markerMode(a.id);
    const aid = esc(a.id);

    if (mode === "next") {
      // 「下一站」模式：导航中已有明确目标，无需再次加入推荐
      return `<div class="wait-marker__badge">下一站</div><div class="wait-marker__title">${name}</div><div class="wait-marker__wait ${cls}">${waitText}</div>`;
    }
    if (mode === "collapsed") {
      return `<div class="wait-marker__title wait-marker__title--compact">${name}</div><div class="wait-marker__hint">点击展开</div>`;
    }
    // 按钮仅在「当前选中的那个标签」上显示：
    //  - 普通模式：focusedNormalId 匹配
    //  - 园内模式：expanded 状态（一次只有一个）
    const isSelected = mode === "expanded" || (mode === "normal" && a.id === focusedNormalId);
    const showRecommendBtn = isSelected && !recommendedIds.has(String(a.id));
    const btnHtml = showRecommendBtn
      ? `<div class="wait-marker__btn-recommend" data-id="${aid}">加入推荐</div>`
      : "";
    return `<div class="wait-marker__title">${name}</div><div class="wait-marker__wait ${cls}">${waitText}</div>${btnHtml}`;
  }

  function classNameFor(aid) {
    const mode = markerMode(aid);
    const routeIds = new Set(getRouteHighlightIds() || []);
    let cls = "wait-marker";
    if (inParkNextId) {
      if (mode === "next") cls += " wait-marker--next";
      else if (mode === "collapsed") cls += " wait-marker--collapsed";
      else if (mode === "expanded") cls += " wait-marker--expanded";
    } else {
      if (routeIds.has(aid)) cls += " wait-marker--route-stop";
      if (aid === focusedNormalId) cls += " wait-marker--focused";
    }
    return cls;
  }

  function bindMarkerClick(div, aid) {
    div.addEventListener("click", (ev) => {
      // 如果点击的是「加入推荐」按钮本身，不做 toggle 展开/收起
      if (ev.target?.closest?.(".wait-marker__btn-recommend")) return;
      ev.stopPropagation();

      // ── 行中模式：展开/收起 other 标签 ──
      if (inParkNextId) {
        if (aid === inParkNextId) return;
        expandedOtherId = expandedOtherId === aid ? null : aid;
        for (const [id, mark] of byId) {
          if (!mark?.element) continue;
          const a = (getMerged() || []).find((x) => x.id === id);
          if (a) {
            mark.element.className = classNameFor(id);
            mark.element.innerHTML = buildHtml(a);
          }
        }
        return;
      }

      // ── 普通模式：派发 attraction-clicked，与面板点击走完全一致的路径 ──
      window.dispatchEvent(
        new CustomEvent("attraction-clicked", { detail: { id: aid } })
      );
    });
  }

  /** @type {CSS2DObject[]} */
  let routeBadges = [];

  function clearRouteBadge() {
    for (const b of routeBadges) holder.remove(b);
    routeBadges = [];
  }

  function setAttractionLabelsVisible(visible) {
    poiLabelsVisible = visible;
    for (const mark of byId.values()) {
      mark.visible = visible;
    }
    holder.traverse((ch) => {
      if (ch.userData?.leaderFor) ch.visible = visible;
    });
  }

  function setRouteBadge(p) {
    clearRouteBadge();
    const dm = Math.round(Number(p.distanceMeters) || 0);
    const min = Math.max(1, Math.round((Number(p.durationSeconds) || 0) / 60));
    const div = document.createElement("div");
    div.className = "route-badge";
    div.textContent = `${dm}m,步行${min}分钟`;
    const badge = new CSS2DObject(div);
    badge.position.set(p.x, p.y, p.z);
    holder.add(badge);
    routeBadges.push(badge);
  }

  function setRouteSegmentBadges(segments, midpointFn) {
    clearRouteBadge();
    if (!segments?.length || !midpointFn) return;
    for (const seg of segments) {
      const pts = seg.points;
      if (!pts?.length) continue;
      const mid = midpointFn(pts);
      if (!mid) continue;
      const dm = Math.round(Number(seg.distanceMeters) || 0);
      const min = Math.max(1, Math.round((Number(seg.durationSeconds) || 0) / 60));
      const div = document.createElement("div");
      div.className = "route-badge";
      div.textContent = `${dm}m,步行${min}分钟`;
      const badge = new CSS2DObject(div);
      badge.position.set(mid.x, mid.y, mid.z);
      holder.add(badge);
      routeBadges.push(badge);
    }
  }

  function rebuild() {
    clearRouteBadge();
    for (let i = holder.children.length - 1; i >= 0; i--) {
      const ch = holder.children[i];
      if (ch.userData?.isLeaderLine) disposeLeaderGroup(ch);
      holder.remove(ch);
    }
    byId.clear();

    const list = getMerged() || [];
    const modelTopMap = getModelTopYMap();
    for (const a of list) {
      if (!a?.id || !a.position) continue;

      const py = a.position.y || 0;
      const modelTopY = modelTopMap.get(a.id);
      // 有模型时：标签 Y = 模型最高点 + 固定偏移；无模型时使用兜底值
      let labelY;
      if (modelTopY != null && modelTopY > py) {
        labelY = Math.min(modelTopY + LABEL_ABOVE_MODEL, LABEL_Y_MAX);
      } else {
        labelY = py + LABEL_Y_OFFSET_DEFAULT;
      }
      const yOff = labelY - py;
      const yBottom = py + LEADER_Y_BOTTOM;
      const yTop = labelY - LEADER_Y_TOP_GAP;

      const div = document.createElement("div");
      div.className = classNameFor(a.id);
      div.innerHTML = buildHtml(a);
      // rebuild 时如果正处于普通聚焦态，保持内联 opacity / scale
      if (!inParkNextId && focusedNormalId) {
        if (a.id === focusedNormalId) {
          div.style.opacity = "1";
          div.style.scale = "1.05";
        } else {
          div.style.opacity = "0.25";
          div.style.scale = "0.9";
        }
      }
      bindMarkerClick(div, a.id);

      const mark = new CSS2DObject(div);
      mark.center.set(0.5, 1.0); // 底部居中锚点，让 CSS2DRenderer 使用 translate(-50%,-100%)
      mark.position.set(a.position.x, labelY, a.position.z);
      mark.userData.attractionId = a.id;
      mark.userData.yOffset = yOff;
      holder.add(mark);
      byId.set(a.id, mark);

      const leader = createSmoothLeaderRibbon(a.position.x, yBottom, yTop, a.position.z);
      leader.userData.leaderFor = a.id;
      mark.userData.leaderGroup = leader;
      holder.add(leader);
    }

    labelRenderer.domElement.classList.toggle("wait-labels-layer--inpark", Boolean(inParkNextId));

    if (!poiLabelsVisible) setAttractionLabelsVisible(false);
  }

  function refresh() {
    const list = getMerged() || [];
    const modelTopMap = getModelTopYMap();
    for (const a of list) {
      const mark = byId.get(a.id);
      if (!mark?.element) continue;
      mark.element.innerHTML = buildHtml(a);
      mark.element.className = classNameFor(a.id);
      // refresh 时保持聚焦态内联样式（opacity / scale）
      if (!inParkNextId && focusedNormalId) {
        if (a.id === focusedNormalId) {
          mark.element.style.opacity = "1";
          mark.element.style.scale = "1.05";
        } else {
          mark.element.style.opacity = "0.25";
          mark.element.style.scale = "0.9";
        }
      }
      const py = a.position.y || 0;
      const modelTopY = modelTopMap.get(a.id);
      let labelY;
      if (modelTopY != null && modelTopY > py) {
        labelY = Math.min(modelTopY + LABEL_ABOVE_MODEL, LABEL_Y_MAX);
      } else {
        labelY = py + (mark.userData.yOffset || LABEL_Y_OFFSET_DEFAULT);
      }
      const yBottom = py + LEADER_Y_BOTTOM;
      const yTop = labelY - LEADER_Y_TOP_GAP;
      const h = Math.max(0.02, yTop - yBottom);
      mark.position.set(a.position.x, labelY, a.position.z);

      const leader = mark.userData.leaderGroup;
      const mesh = leader?.userData.leaderMesh;
      if (mesh) {
        mesh.position.set(a.position.x, (yBottom + yTop) * 0.5, a.position.z);
        mesh.scale.set(1, h, 1);
      }
    }
  }

  /** 行中：高亮下一站，其余卡片默认收起（可点击展开） */
  function setInParkNextStop(attractionId) {
    inParkNextId = attractionId || null;
    expandedOtherId = null;
    labelRenderer.domElement.classList.toggle("wait-labels-layer--inpark", Boolean(inParkNextId));
    rebuild();
  }

  function setSize(w, h) {
    labelRenderer.setSize(w, h);
  }

  function render(camera) {
    labelRenderer.render(scene, camera);
  }

  function dispose() {
    clearRouteBadge();
    for (let i = holder.children.length - 1; i >= 0; i--) {
      const ch = holder.children[i];
      if (ch.userData?.isLeaderLine) disposeLeaderGroup(ch);
    }
    document.body.removeChild(labelRenderer.domElement);
    scene.remove(holder);
  }

  function focusOn(id) {
    const prevFocused = focusedNormalId;
    focusedNormalId = id || null;

    // ── 行中模式（inParkNextId 已设置）：将被点击的景点展开 ──
    if (inParkNextId) {
      if (id && id !== inParkNextId) {
        expandedOtherId = id;
      }
      // 刷新所有标签的 class + innerHTML（展开 / 收起状态变化）
      for (const [aid, mark] of byId) {
        if (!mark?.element) continue;
        const a = (getMerged() || []).find((x) => x.id === aid);
        if (a) {
          mark.element.className = classNameFor(aid);
          mark.element.innerHTML = buildHtml(a);
        }
      }
      return;
    }

    // ── 普通模式 ──
    for (const [aid, mark] of byId) {
      if (!mark?.element) continue;
      // 通过 classNameFor 统一管理 className（含 wait-marker--focused）
      mark.element.className = classNameFor(aid);
      if (aid === id) {
        mark.element.style.opacity = "1";
        mark.element.style.scale = "1";
      } else {
        mark.element.style.opacity = "0.25";
        mark.element.style.scale = "0.9";
      }
      // 刷新按钮显示：仅影响新选中 / 旧选中的标签
      if (aid === id || aid === prevFocused) {
        const a = (getMerged() || []).find((x) => x.id === aid);
        if (a) mark.element.innerHTML = buildHtml(a);
      }
    }
  }

  function clearFocus() {
    const hadFocus = focusedNormalId;
    focusedNormalId = null;

    // 行中模式：收起之前展开的标记
    if (inParkNextId && expandedOtherId) {
      expandedOtherId = null;
      for (const [aid, mark] of byId) {
        if (!mark?.element) continue;
        const a = (getMerged() || []).find((x) => x.id === aid);
        if (a) {
          mark.element.className = classNameFor(aid);
          mark.element.innerHTML = buildHtml(a);
        }
      }
      return;
    }

    for (const [aid, mark] of byId) {
      if (!mark?.element) continue;
      // focusedNormalId 已置 null，classNameFor 不再含 wait-marker--focused
      mark.element.className = classNameFor(aid);
      mark.element.style.opacity = "1";
      mark.element.style.scale = "1";
      // 清除之前选中标签上的按钮
      if (aid === hadFocus) {
        const a = (getMerged() || []).find((x) => x.id === aid);
        if (a) mark.element.innerHTML = buildHtml(a);
      }
    }
  }

  return {
    rebuild,
    refresh,
    setSize,
    render,
    dispose,
    setRouteBadge,
    setRouteSegmentBadges,
    clearRouteBadge,
    setAttractionLabelsVisible,
    setInParkNextStop,
    focusOn,
    clearFocus,
  };
}
