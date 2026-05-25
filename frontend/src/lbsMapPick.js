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
