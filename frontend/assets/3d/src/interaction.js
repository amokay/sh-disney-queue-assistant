/**
 * scene3d/interaction.js
 * ──────────────────────
 * Raycasting 拾取：点击 3D 场景时判定命中了哪个景点。
 * 使用 Babylon 的 onPointerObservable，自动区分点击和拖拽。
 */

/**
 * 绑定景点拾取。
 * @param {BABYLON.Scene} scene
 * @param {HTMLCanvasElement} canvas
 * @param {object} callbacks
 * @param {(id: string, hitPoint: {x:number,y:number,z:number}, rootNode?: BABYLON.TransformNode) => void} callbacks.onAttractionClicked
 * @param {(pinId: string, label: string, attractionId?: string) => void} [callbacks.onMapPinClicked]
 * @returns {{ dispose: () => void }}
 */
// ─── 按 I + 点击：显示模型来源信息 ───
let _inspectKeyDown = false;
function _initInspectKey() {
  if (_inspectKeyDown !== false) return; // 只绑一次
  _inspectKeyDown = false;
  window.addEventListener("keydown", (e) => { if (e.key === "i" || e.key === "I") _inspectKeyDown = true; });
  window.addEventListener("keyup",   (e) => { if (e.key === "i" || e.key === "I") _inspectKeyDown = false; });
}

function _showInspectInfo(pickedMesh) {
  // 沿父链找到 GLB 根节点
  let cur = pickedMesh;
  let glbRoot = null;
  while (cur) {
    if (cur.metadata?.isGltfModelRoot) { glbRoot = cur; break; }
    cur = cur.parent;
  }

  const meshName = pickedMesh.name || "(无名)";
  const rootName = glbRoot?.name || "(未找到根节点)";
  // 从根节点名提取 GLB URL（格式通常是 "auto:/assets/models/xxx.glb"）
  const glbUrl = rootName.replace(/^(auto|manifest):/, "") || rootName;

  const info = [
    `点击的 Mesh: ${meshName}`,
    `GLB 根节点: ${rootName}`,
    `GLB 文件: ${glbUrl}`,
    `位置: x=${pickedMesh.absolutePosition.x.toFixed(1)}, y=${pickedMesh.absolutePosition.y.toFixed(1)}, z=${pickedMesh.absolutePosition.z.toFixed(1)}`,
  ].join("\n");

  console.info("[inspect]\n" + info);

  // 页面上弹一个临时提示
  let tip = document.getElementById("inspect-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "inspect-tip";
    tip.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:#fff;padding:16px 24px;border-radius:10px;font-size:14px;z-index:99999;white-space:pre-line;pointer-events:none;font-family:monospace;line-height:1.8;";
    document.body.appendChild(tip);
  }
  tip.textContent = info;
  tip.style.display = "block";
  clearTimeout(tip._timer);
  tip._timer = setTimeout(() => { tip.style.display = "none"; }, 4000);
}

export function bindPicking(scene, canvas, callbacks) {
  const BABYLON = window.BABYLON;
  _initInspectKey();

  // 记录按下位置，只有移动距离很小才算"点击"（区分拖拽旋转）
  let downX = 0, downY = 0;
  const CLICK_THRESHOLD = 8; // px

  const observer = scene.onPointerObservable.add((pointerInfo) => {
    switch (pointerInfo.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN:
        downX = pointerInfo.event.clientX;
        downY = pointerInfo.event.clientY;
        break;

      case BABYLON.PointerEventTypes.POINTERUP: {
        const dx = pointerInfo.event.clientX - downX;
        const dy = pointerInfo.event.clientY - downY;
        if (dx * dx + dy * dy > CLICK_THRESHOLD * CLICK_THRESHOLD) break;

        const pickResult = scene.pick(scene.pointerX, scene.pointerY);
        if (!pickResult.hit || !pickResult.pickedMesh) break;

        // ★ 按住 I 键点击 → 显示模型来源信息
        if (_inspectKeyDown) {
          _showInspectInfo(pickResult.pickedMesh);
          break;
        }

        // 沿父链向上查找绑定的景点 ID
        let node = pickResult.pickedMesh;
        while (node) {
          const meta = node.metadata;

          // 景点命中
          if (meta?.attractionId) {
            let modelRoot = null;
            let cur = pickResult.pickedMesh;
            while (cur) {
              if (cur.metadata?.isGltfModelRoot) {
                modelRoot = cur;
                break;
              }
              cur = cur.parent;
            }
            const hp = pickResult.pickedPoint;
            callbacks.onAttractionClicked(
              meta.attractionId,
              { x: hp.x, y: hp.y, z: hp.z },
              modelRoot
            );
            return;
          }

          // 地图标点命中
          if (meta?.pinId) {
            callbacks.onMapPinClicked?.(
              meta.pinId,
              meta.pinLabel || "",
              meta.attractionId || null
            );
            return;
          }

          node = node.parent;
        }
        break;
      }
    }
  });

  return {
    dispose() {
      scene.onPointerObservable.remove(observer);
    },
  };
}
