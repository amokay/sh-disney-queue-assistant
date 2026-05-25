import * as THREE from "three";
import { showToast } from "./ui/toast.js";
import { fetchGeoInverse } from "./api/attractions.js";

const groundY = 0;
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
const hit = new THREE.Vector3();

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } finally {
    ta.remove();
  }
}

/**
 * Shift + 在画布上点击：与水平面 y=0 求交，输出世界坐标 x、z（用于和地图 POI 对齐填 geo_reference）。
 * 使用 capture 尽量先于 OrbitControls；若仍被旋转打断可多点几次。
 * 成功时写入剪贴板（两行：易读 + 纯数字逗号分隔）。
 */
export function bindCalibrationXZPick(renderer, camera, enabled) {
  if (!enabled) return () => {};

  function onPointerDown(ev) {
    if (!ev.shiftKey || ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const p = raycaster.ray.intersectPlane(plane, hit);
    if (p == null) return;

    const x = hit.x;
    const z = hit.z;
    const lineHuman = `x=${x.toFixed(4)}, z=${z.toFixed(4)}`;
    const lineCsv = `${x.toFixed(6)},${z.toFixed(6)}`;
    const clip = `${lineHuman}\n${lineCsv}`;
    console.info(`[校准] ${lineHuman}（y=${hit.y.toFixed(4)}）`);

    void (async () => {
      let invLine = "";
      try {
        const inv = await fetchGeoInverse(x, z);
        invLine = ` ↔ 高德 GCJ 约 lat=${inv.lat.toFixed(6)}, lng=${inv.lng.toFixed(6)}`;
        const amapUri = `https://uri.amap.com/marker?position=${inv.lng},${inv.lat}&name=${encodeURIComponent("场景对应点")}`;
        console.info(`[校准] 逆投影核对：${invLine}`);
        console.info(`[校准] 高德打开标记链接（可粘到浏览器）: ${amapUri}`);
      } catch (e) {
        invLine = `（逆投影失败：${String(e?.message || e)}。请用 http://localhost:3000 打开本页再试）`;
        console.warn("[校准]", invLine);
      }

      try {
        const ok = await copyToClipboard(`${clip}${invLine ? `\n${invLine.trim()}` : ""}`);
        if (ok) {
          showToast(
            invLine.startsWith("（逆投影")
              ? `已复制 xz。${invLine}`
              : "已复制 xz；已用当前 geo 算出对应高德经纬度，控制台有可点开的高德链接。",
            invLine.startsWith("（逆投影") ? "warning" : "success"
          );
        } else showToast(`${lineHuman}（复制失败，见控制台）`, "warning");
      } catch {
        showToast(`${lineHuman}（剪贴板不可用，见控制台）`, "warning");
      }
    })();

    ev.preventDefault();
    ev.stopPropagation();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  return () => renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
}
