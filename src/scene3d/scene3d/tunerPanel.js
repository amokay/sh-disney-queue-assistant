/**
 * scene3d/tunerPanel.js
 * ─────────────────────
 * 可视化模型调参面板（设计师向）。
 * 按快捷键 T 显示/隐藏。
 * 用滑块/输入框实时调整模型的位置、旋转、缩放。
 * 调好后一键「复制配置」粘贴到 model_transforms.json 即可固化。
 */

/**
 * @param {BABYLON.Scene} scene
 */
export function createTunerPanel(scene) {
  let _scene = scene;
  let _visible = false;
  let currentNode = null;

  // ─── 创建面板 ───
  const panel = document.createElement("div");
  panel.id = "model-tuner-panel";
  panel.style.display = "none";
  panel.innerHTML = buildPanelHTML();
  document.body.appendChild(panel);

  // ─── DOM 引用 ───
  const $ = (id) => document.getElementById(id);

  const select = $("tuner-model-select");
  const controls = $("tuner-controls");
  const sliders = {
    px: $("tuner-px"), py: $("tuner-py"), pz: $("tuner-pz"),
    ry: $("tuner-ry"), scale: $("tuner-scale"),
  };
  const nums = {
    px: $("tuner-px-num"), py: $("tuner-py-num"), pz: $("tuner-pz-num"),
    ry: $("tuner-ry-num"), scale: $("tuner-scale-num"),
  };

  // ─── 快捷键 T 显示/隐藏 ───
  window.addEventListener("keydown", (e) => {
    // 如果正在输入框里打字，不触发
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "t" || e.key === "T") {
      _visible = !_visible;
      panel.style.display = _visible ? "" : "none";
      if (_visible) refreshModelList();
    }
  });

  // ─── 关闭按钮 ───
  $("tuner-close").addEventListener("click", () => {
    _visible = false;
    panel.style.display = "none";
  });

  // ─── 扫描场景中的 GLB 模型 ───
  function refreshModelList() {
    const prev = select.value;
    select.innerHTML = '<option value="">— 请选择 —</option>';

    if (!_scene) return;

    const nodes = [];
    // 遍历 scene 中所有 TransformNode
    for (const node of _scene.transformNodes) {
      if (node.metadata && node.metadata.isGltfModelRoot) {
        nodes.push(node);
      }
    }
    // 也检查 meshes 和 rootNodes（ImportMeshAsync 的 __root__ 是 Mesh 类型）
    for (const node of _scene.meshes) {
      if (node.metadata && node.metadata.isGltfModelRoot) {
        if (!nodes.includes(node)) nodes.push(node);
      }
    }
    for (const node of _scene.rootNodes) {
      if (node.metadata && node.metadata.isGltfModelRoot) {
        if (!nodes.includes(node)) nodes.push(node);
      }
    }

    nodes.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    for (const node of nodes) {
      const opt = document.createElement("option");
      opt.value = node.uniqueId; // 用 uniqueId 而不是 name，避免重名
      const poiId = node.metadata.pickableAttractionId || "";
      const shortName = (node.name || "").replace(/^(auto:|manifest:)/, "");
      opt.textContent = poiId ? `${poiId}  ←  ${shortName}` : shortName;
      opt.dataset.uid = node.uniqueId;
      select.appendChild(opt);
    }

    console.info(`[tuner] 扫描到 ${nodes.length} 个模型`);

    // 恢复之前选中的
    if (prev) select.value = prev;
  }

  // ─── 根据 uniqueId 找节点 ───
  function findNodeByUid(uid) {
    const id = parseInt(uid);
    if (isNaN(id)) return null;
    for (const node of _scene.transformNodes) {
      if (node.uniqueId === id) return node;
    }
    for (const node of _scene.meshes) {
      if (node.uniqueId === id) return node;
    }
    for (const node of _scene.rootNodes) {
      if (node.uniqueId === id) return node;
    }
    return null;
  }

  // ─── 选择模型 ───
  select.addEventListener("change", () => {
    const uid = select.value;
    if (!uid) {
      currentNode = null;
      controls.style.display = "none";
      return;
    }
    currentNode = findNodeByUid(uid);
    if (!currentNode) {
      controls.style.display = "none";
      return;
    }
    controls.style.display = "";
    readFromNode();
  });

  // 每次打开下拉框重新扫描
  select.addEventListener("mousedown", () => {
    if (select.options.length <= 1) refreshModelList();
  });

  // ─── 从节点读取当前值 ───
  function readFromNode() {
    if (!currentNode) return;
    const p = currentNode.position;
    const r = currentNode.rotation;
    const s = currentNode.scaling;

    setVal("px", p.x);
    setVal("py", p.y);
    setVal("pz", p.z);
    setVal("ry", (r.y * 180) / Math.PI);
    setVal("scale", s.x);
  }

  function setVal(key, value) {
    const v = Math.round(value * 100) / 100;
    sliders[key].value = v;
    nums[key].value = v;
  }

  // ─── 滑块/数字输入 → 实时应用 ───
  function bindControl(key, applyFn) {
    sliders[key].addEventListener("input", () => {
      const v = parseFloat(sliders[key].value);
      nums[key].value = Math.round(v * 100) / 100;
      applyFn(v);
    });
    nums[key].addEventListener("input", () => {
      const v = parseFloat(nums[key].value);
      if (!Number.isFinite(v)) return;
      sliders[key].value = v;
      applyFn(v);
    });
  }

  bindControl("px", (v) => { if (currentNode) currentNode.position.x = v; });
  bindControl("py", (v) => { if (currentNode) currentNode.position.y = v; });
  bindControl("pz", (v) => { if (currentNode) currentNode.position.z = v; });
  bindControl("ry", (v) => { if (currentNode) currentNode.rotation.y = (v * Math.PI) / 180; });
  bindControl("scale", (v) => {
    if (!currentNode) return;
    currentNode.scaling.x = v;
    currentNode.scaling.y = v;
    currentNode.scaling.z = v;
  });

  // ─── 生成配置 JSON ───
  function buildRuleForNode(node) {
    const raw = (node.name || "").replace(/^(auto:|manifest:)/, "");
    // 保留 "landmarks/xxx" 这样的路径，只去掉前面的路径前缀和后面的 .glb
    const match = raw
      .replace(/\.glb(\?.*)?$/i, "")
      .replace(/^\/assets\/(3d\/)?models\/(optimized\/)?/, "")
      || raw;
    const p = node.position;
    const rDeg = Math.round((node.rotation.y * 180) / Math.PI);
    const s = Math.round(node.scaling.x * 100) / 100;
    return {
      match,
      position: [round2(p.x), round2(p.y), round2(p.z)],
      rotationDeg: [0, rDeg, 0],
      scale: s,
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  // ─── Toast ───
  function toast(msg) {
    const t = $("tuner-toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }

  // ─── 按钮事件 ───
  $("tuner-copy").addEventListener("click", () => {
    if (!currentNode) return;
    const rule = buildRuleForNode(currentNode);
    const json = JSON.stringify(rule, null, 2);
    navigator.clipboard.writeText(json).then(() => toast("已复制到剪贴板！"));
  });

  $("tuner-copy-all").addEventListener("click", () => {
    const rules = getAllRules();
    const json = JSON.stringify({ rules }, null, 2);
    navigator.clipboard.writeText(json).then(() => toast(`已复制全部 ${rules.length} 个模型的配置！`));
  });

  // ─── 保存当前模型配置到文件 ───
  $("tuner-save").addEventListener("click", async () => {
    if (!currentNode) {
      toast("请先选择一个模型");
      return;
    }
    const rule = buildRuleForNode(currentNode);
    console.info("[tuner] 保存配置:", JSON.stringify(rule));
    try {
      const res = await fetch("/api/save-transforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: [rule] }),
      });
      if (!res.ok) {
        toast("保存失败：HTTP " + res.status);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        toast("已保存到 model_transforms.json！");
      } else {
        toast("保存失败：" + (data.error || "未知错误"));
      }
    } catch (e) {
      console.error("[tuner] 保存出错:", e);
      toast("保存失败：" + e.message);
    }
  });

  // ─── 保存全部模型配置到文件 ───
  $("tuner-save-all").addEventListener("click", async () => {
    const rules = getAllRules();
    try {
      const res = await fetch("/api/save-transforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`已保存全部 ${rules.length} 个模型到文件！`);
      } else {
        toast("保存失败：" + (data.error || "未知错误"));
      }
    } catch (e) {
      toast("保存失败：" + e.message);
    }
  });

  function getAllRules() {
    const rules = [];
    const seen = new Set();
    for (const node of _scene.transformNodes) {
      if (node.metadata && node.metadata.isGltfModelRoot && !seen.has(node.uniqueId)) {
        seen.add(node.uniqueId);
        rules.push(buildRuleForNode(node));
      }
    }
    for (const node of _scene.meshes) {
      if (node.metadata && node.metadata.isGltfModelRoot && !seen.has(node.uniqueId)) {
        seen.add(node.uniqueId);
        rules.push(buildRuleForNode(node));
      }
    }
    return rules;
  }

  $("tuner-focus").addEventListener("click", () => {
    if (!currentNode) return;
    const cam = _scene.activeCamera;
    if (!cam) return;
    const bounds = currentNode.getHierarchyBoundingVectors();
    const center = bounds.min.add(bounds.max).scale(0.5);
    const size = bounds.max.subtract(bounds.min);
    const radius = Math.max(size.length() * 1.5, 20);
    if (cam.setTarget) cam.setTarget(center);
    if ("radius" in cam) cam.radius = radius;
  });

  $("tuner-refresh").addEventListener("click", refreshModelList);

  return { refreshModelList };
}


// ─── 面板 HTML 模板 ───
function buildPanelHTML() {
  return `
    <style>
      #model-tuner-panel {
        position: fixed;
        top: 12px;
        right: 12px;
        width: 340px;
        max-height: 90vh;
        overflow-y: auto;
        background: rgba(20, 20, 28, 0.55);
        backdrop-filter: blur(8px);
        border-radius: 14px;
        color: #e0e0e0;
        font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 13px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        user-select: none;
      }
      .tuner-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .tuner-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: #fff; }
      .tuner-close {
        background: none; border: none; color: #888; font-size: 20px;
        cursor: pointer; padding: 0 4px; line-height: 1;
      }
      .tuner-body { padding: 10px 14px 14px; }
      .tuner-select-row { margin-bottom: 12px; }
      .tuner-select-row label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }
      .tuner-select-row select {
        width: 100%; padding: 6px 8px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06); color: #fff; font-size: 13px; outline: none;
      }
      .tuner-group {
        margin-bottom: 10px; padding: 8px 10px;
        background: rgba(255,255,255,0.04); border-radius: 8px;
      }
      .tuner-group-title {
        font-size: 11px; color: #7eb8ff; font-weight: 600;
        margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;
      }
      .tuner-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
      .tuner-row label { width: 16px; font-size: 12px; font-weight: 600; color: #aaa; text-align: center; flex-shrink: 0; }
      .tuner-row input[type=range] {
        flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
        background: rgba(255,255,255,0.15); border-radius: 2px; outline: none;
      }
      .tuner-row input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
        background: #7eb8ff; cursor: pointer;
      }
      .tuner-row input[type=number] {
        width: 62px; padding: 3px 5px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06); color: #fff; font-size: 12px;
        text-align: right; outline: none; flex-shrink: 0;
      }
      .tuner-row input[type=number]:focus { border-color: #7eb8ff; }
      .tuner-btns { display: flex; gap: 8px; margin-top: 10px; }
      .tuner-btn {
        flex: 1; padding: 8px 0; border: none; border-radius: 8px;
        font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;
      }
      .tuner-btn:hover { opacity: 0.85; }
      .tuner-btn-primary { background: #3b82f6; color: #fff; }
      .tuner-btn-save { background: #22c55e; color: #fff; }
      .tuner-btn-save-all { background: #16a34a; color: #fff; }
      .tuner-btn-secondary { background: rgba(255,255,255,0.1); color: #ccc; }
      .tuner-btn-small { font-size: 12px; padding: 5px 10px; flex: none; }
      .tuner-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #22c55e; color: #fff; padding: 10px 24px; border-radius: 8px;
        font-size: 14px; font-weight: 600; z-index: 99999;
        opacity: 0; transition: opacity 0.3s; pointer-events: none;
      }
      .tuner-toast.show { opacity: 1; }
      .tuner-info {
        font-size: 11px; color: #666; line-height: 1.5; margin-top: 10px;
        padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);
      }
      .tuner-shortcut-hint {
        font-size: 11px; color: #555; text-align: center; padding: 4px 0 0;
      }
    </style>

    <div class="tuner-header">
      <h3>模型调参面板</h3>
      <button class="tuner-close" id="tuner-close">✕</button>
    </div>

    <div class="tuner-body">
      <div class="tuner-select-row">
        <label>选择模型 <button class="tuner-btn tuner-btn-secondary tuner-btn-small" id="tuner-refresh">刷新列表</button></label>
        <select id="tuner-model-select">
          <option value="">— 请选择 —</option>
        </select>
      </div>

      <div id="tuner-controls" style="display:none;">
        <div class="tuner-group">
          <div class="tuner-group-title">位置</div>
          <div class="tuner-row">
            <label>X</label>
            <input type="range" id="tuner-px" min="-200" max="200" step="0.1">
            <input type="number" id="tuner-px-num" step="0.1">
          </div>
          <div class="tuner-row">
            <label>Y</label>
            <input type="range" id="tuner-py" min="-10" max="50" step="0.1">
            <input type="number" id="tuner-py-num" step="0.1">
          </div>
          <div class="tuner-row">
            <label>Z</label>
            <input type="range" id="tuner-pz" min="-200" max="200" step="0.1">
            <input type="number" id="tuner-pz-num" step="0.1">
          </div>
        </div>

        <div class="tuner-group">
          <div class="tuner-group-title">旋转（度）</div>
          <div class="tuner-row">
            <label>Y</label>
            <input type="range" id="tuner-ry" min="-180" max="180" step="1">
            <input type="number" id="tuner-ry-num" step="1">
          </div>
        </div>

        <div class="tuner-group">
          <div class="tuner-group-title">缩放</div>
          <div class="tuner-row">
            <label>S</label>
            <input type="range" id="tuner-scale" min="0.01" max="5" step="0.01">
            <input type="number" id="tuner-scale-num" step="0.01">
          </div>
        </div>

        <div class="tuner-btns">
          <button class="tuner-btn tuner-btn-save" id="tuner-save">保存这个模型</button>
          <button class="tuner-btn tuner-btn-secondary" id="tuner-focus">聚焦相机</button>
        </div>
        <div class="tuner-btns">
          <button class="tuner-btn tuner-btn-save-all" id="tuner-save-all">保存全部到文件</button>
        </div>
        <div class="tuner-btns">
          <button class="tuner-btn tuner-btn-secondary" id="tuner-copy">复制配置</button>
          <button class="tuner-btn tuner-btn-secondary" id="tuner-copy-all">复制全部</button>
        </div>
      </div>

      <div class="tuner-info">
        点「保存」直接写入 model_transforms.json，<br>
        无需手动粘贴。
      </div>
      <div class="tuner-shortcut-hint">按 T 键显示/隐藏此面板</div>
    </div>

    <div class="tuner-toast" id="tuner-toast"></div>
  `;
}
