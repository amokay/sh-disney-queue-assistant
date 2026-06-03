import * as THREE from "three";
import { showToast } from "./ui/toast.js";
import { setLocationFromSceneXZ } from "./geoLocation.js";

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function isLbsPickChord(ev) {
  if (ev.button !== 0) return false;
  if (!ev.shiftKey) return false;
  return ev.metaKey || ev.ctrlKey;
}

/**
 * ⇧⌘ + 左键（Mac）/ ⇧Ctrl + 左键（Win）：在地面拾取点并设为当前 LBS。
 * 与仅 ⇧ 的校准拾取（复制 xz）互不冲突。
 */
export function bindLbsMapPick(renderer, camera, enabled = true) {
  if (!enabled) return () => {};

  function onPointerDown(ev) {
    if (!isLbsPickChord(ev)) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (hit == null) {
      showToast("未点到地面，请点在地图地面上", "warning");
      return;
    }

    const x = hit.x;
    const z = hit.z;

    void (async () => {
      try {
        await setLocationFromSceneXZ(x, z);
        window.dispatchEvent(new CustomEvent("focus-user-location"));
        showToast(`已设定当前位置 x=${x.toFixed(1)}, z=${z.toFixed(1)}`, "success");
      } catch (e) {
        showToast(String(e?.message || e), "error");
      }
    })();

    ev.preventDefault();
    ev.stopPropagation();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  return () => renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
}

/* ======== 手动选点模式（无修饰键，单次点击即选） ======== */

let _manualPickActive = false;
let _manualPickCleanup = null;

/**
 * 进入手动选点模式：下一次点击地面即设定为当前位置，然后自动退出。
 * 可重复调用（幂等进入）。
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 * @returns {{ cancel: () => void }}
 */
export function enterManualPickMode(renderer, camera) {
  // 幂等：如果已在选点模式，先取消旧的
  if (_manualPickActive && _manualPickCleanup) _manualPickCleanup();

  _manualPickActive = true;
  window.dispatchEvent(new CustomEvent("lbs-manual-pick-mode", { detail: { active: true } }));

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    // 忽略修饰键组合（让原有 ⇧⌘ 拾取优先）
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (hit == null) {
      showToast("未点到地面，请点在地图地面上", "warning");
      return;
    }

    const x = hit.x;
    const z = hit.z;

    void (async () => {
      try {
        await setLocationFromSceneXZ(x, z);
        window.dispatchEvent(new CustomEvent("focus-user-location"));
        showToast(`已手动选点 x=${x.toFixed(1)}, z=${z.toFixed(1)}`, "success");
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
    _manualPickActive = false;
    _manualPickCleanup = null;
    renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.style.cursor = "";
    window.dispatchEvent(new CustomEvent("lbs-manual-pick-mode", { detail: { active: false } }));
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.style.cursor = "crosshair";
  _manualPickCleanup = cleanup;

  showToast("点击地图地面选择你的位置", "info");

  return { cancel: cleanup };
}

export function isManualPickActive() {
  return _manualPickActive;
}

/* ======== 手动画路线模式 ======== */

/**
 * 进入画路线模式：依次点击地面采集点，右键撤销最后一个点。
 * 返回控制对象 { cancel, getPoints, undo, clear }。
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 */
export function enterDrawRouteMode(renderer, camera, scene) {
  const points = [];

  const material = new THREE.LineBasicMaterial({ color: 0xf5c842, linewidth: 2 });
  const geometry = new THREE.BufferGeometry();
  let previewLine = new THREE.Line(geometry, material);
  previewLine.name = "DrawRoutePreview";
  previewLine.renderOrder = 10;
  previewLine.frustumCulled = false;
  scene.add(previewLine);

  function updatePreview() {
    if (!previewLine) return;
    if (points.length < 2) {
      previewLine.geometry.dispose();
      previewLine.geometry = new THREE.BufferGeometry();
      return;
    }
    const vecs = points.map((p) => new THREE.Vector3(p.x, 0.6, p.z));
    previewLine.geometry.dispose();
    previewLine.geometry = new THREE.BufferGeometry().setFromPoints(vecs);
  }

  function getSceneXZ(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    return hit ? { x: hitPoint.x, z: hitPoint.z } : null;
  }

  function onPointerDown(ev) {
    // 右键撤销
    if (ev.button === 2) {
      ev.preventDefault();
      ev.stopPropagation();
      if (points.length > 0) {
        points.pop();
        updatePreview();
        window.dispatchEvent(
          new CustomEvent("route-draw-update", { detail: { pointCount: points.length } })
        );
      }
      return;
    }
    if (ev.button !== 0) return;
    // 让校准/LBS 拾取等修饰键组合优先
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

    const pos = getSceneXZ(ev);
    if (!pos) {
      showToast("未点到地面，请点在地图地面上", "warning");
      return;
    }

    points.push({ x: pos.x, y: 0.5, z: pos.z });
    updatePreview();

    ev.preventDefault();
    ev.stopPropagation();

    window.dispatchEvent(
      new CustomEvent("route-draw-update", { detail: { pointCount: points.length } })
    );
  }

  function onContextMenu(ev) {
    ev.preventDefault();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("contextmenu", onContextMenu, true);
  renderer.domElement.style.cursor = "crosshair";

  window.dispatchEvent(new CustomEvent("route-draw-mode", { detail: { active: true } }));

  let disposed = false;
  function cleanup() {
    if (disposed) return;
    disposed = true;
    renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.removeEventListener("contextmenu", onContextMenu, true);
    renderer.domElement.style.cursor = "";
    if (previewLine) {
      scene.remove(previewLine);
      previewLine.geometry.dispose();
      previewLine.material.dispose();
      previewLine = null;
    }
    window.dispatchEvent(new CustomEvent("route-draw-mode", { detail: { active: false } }));
  }

  return {
    cancel: cleanup,
    getPoints: () => points.map((p) => ({ ...p })),
    undo: () => {
      if (points.length) {
        points.pop();
        updatePreview();
        window.dispatchEvent(
          new CustomEvent("route-draw-update", { detail: { pointCount: points.length } })
        );
      }
    },
    clear: () => {
      points.length = 0;
      updatePreview();
      window.dispatchEvent(
        new CustomEvent("route-draw-update", { detail: { pointCount: 0 } })
      );
    },
  };
}

/* ======== 擦除路线模式 ======== */

/**
 * 进入擦除路线模式：点击地图上的路线 mesh 即删除该条路线。
 * 右键或 Esc 退出模式。
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Camera} camera
 * @param {THREE.Scene} scene
 * @returns {{ cancel: () => void }}
 */
export function enterEraseRouteMode(renderer, camera, scene) {
  const parkRoadsGroup = scene.getObjectByName("ParkRoads");
  if (!parkRoadsGroup) {
    showToast("未找到园区路网", "warning");
    return { cancel: () => {} };
  }

  function parseRoadId(name) {
    if (typeof name !== "string") return "";
    const m = name.match(/^park-road:(.*)$/);
    return m ? m[1] : "";
  }

  function onPointerDown(ev) {
    // 右键退出模式
    if (ev.button === 2) {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
      return;
    }
    if (ev.button !== 0) return;
    // 忽略修饰键组合
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);

    const candidates = parkRoadsGroup.children.filter((o) => o && o.visible !== false);
    const hits = raycaster.intersectObjects(candidates, false);
    if (!hits || hits.length === 0) {
      showToast("未点中路线，请点在白色路网上", "warning");
      return;
    }

    const mesh = hits[0].object;
    const id = parseRoadId(mesh.name);
    if (!id) {
      showToast("未能识别路线 id", "warning");
      return;
    }

    // 高亮闪烁：临时改为红色，0.3s 后删除
    try {
      if (mesh.material && mesh.material.color) {
        mesh.material.color.setHex(0xff0000);
        mesh.material.opacity = 1;
        mesh.material.needsUpdate = true;
      }
    } catch {}

    setTimeout(() => {
      try {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      } catch {}
    }, 300);

    window.dispatchEvent(
      new CustomEvent("route-erase-hit", { detail: { id, mesh } })
    );

    ev.preventDefault();
    ev.stopPropagation();
  }

  function onContextMenu(ev) {
    ev.preventDefault();
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      cleanup();
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("keydown", onKeyDown, true);
  renderer.domElement.style.cursor = "not-allowed";

  window.dispatchEvent(new CustomEvent("route-erase-mode", { detail: { active: true } }));

  let disposed = false;
  function cleanup() {
    if (disposed) return;
    disposed = true;
    renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.removeEventListener("contextmenu", onContextMenu, true);
    window.removeEventListener("keydown", onKeyDown, true);
    renderer.domElement.style.cursor = "";
    window.dispatchEvent(new CustomEvent("route-erase-mode", { detail: { active: false } }));
  }

  return { cancel: cleanup };
}
