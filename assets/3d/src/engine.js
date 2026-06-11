/**
 * scene3d/engine.js
 * ─────────────────
 * Babylon 引擎初始化 + 设备分级 + 抗锯齿。
 *
 * 抗锯齿策略（行业通用）：
 *  - 高端：硬件 MSAA 4x（WebGL 原生，零额外 draw call）
 *  - 中端：FXAA 后处理（一次全屏 pass，开销极低）
 *  - 低端：不抗锯齿，靠设备 DPR 自然覆盖
 *
 * 不做运行时分辨率降级——初始化阶段 GPU 忙碌帧率临时偏低是正常的，
 * 强行降分辨率会让画面永久模糊，体验很差。
 */

/**
 * 设备分级。
 * @returns {"high" | "mid" | "low"}
 */
export function getDeviceTier() {
  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;

  if (memory >= 6 && cores >= 8) return "high";
  if (memory >= 4 && cores >= 4) return "mid";
  return "low";
}

/**
 * 渲染配置。
 * @param {"high" | "mid" | "low"} tier
 */
export function getTierConfig(tier) {
  const configs = {
    high: { pixelRatio: 2, antialias: true, fxaa: true },
    mid:  { pixelRatio: 1.5, antialias: false, fxaa: true },
    low:  { pixelRatio: 1, antialias: false, fxaa: false },
  };
  return configs[tier] || configs.low;
}

/**
 * 创建引擎。
 * @param {HTMLCanvasElement} canvas
 * @param {object} tierConfig
 * @returns {BABYLON.Engine}
 */
export function createEngine(canvas, tierConfig) {
  const BABYLON = window.BABYLON;

  const engine = new BABYLON.Engine(canvas, tierConfig.antialias, {
    adaptToDeviceRatio: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    stencil: false,
  });

  // 渲染分辨率：跟设备 DPR 走，但不超过档位上限
  const dpr = Math.min(window.devicePixelRatio, tierConfig.pixelRatio);
  engine.setHardwareScalingLevel(1 / dpr);

  return engine;
}

/**
 * 设置 FXAA 抗锯齿（轻量后处理，一次全屏 pass）。
 * 在 scene 和 camera 都就绪后调用。
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.Camera} camera
 * @param {object} tierConfig
 */
export function setupAntiAliasing(scene, camera, tierConfig) {
  if (!tierConfig.fxaa) return null;

  const BABYLON = window.BABYLON;
  try {
    const pipeline = new BABYLON.DefaultRenderingPipeline(
      "defaultPipeline",
      false, // 不开 HDR 后处理（移动端省开销）
      scene,
      [camera]
    );
    pipeline.fxaaEnabled = true;
    // 其他后处理都关掉
    pipeline.bloomEnabled = false;
    pipeline.chromaticAberrationEnabled = false;
    pipeline.grainEnabled = false;
    pipeline.sharpenEnabled = false;
    pipeline.depthOfFieldEnabled = false;
    pipeline.imageProcessingEnabled = false; // tone mapping 由 scene 级控制

    console.info("[scene3d] ✓ FXAA 抗锯齿已开启");
    return pipeline;
  } catch (e) {
    console.warn("[scene3d] FXAA 开启失败:", e);
    return null;
  }
}

/**
 * 运行时性能监控（只记录日志，不做降级）。
 * 保留接口兼容性，但不再自动降分辨率。
 */
export function adaptivePerformanceCheck(engine, state, refs = {}) {
  state.frameCount = (state.frameCount || 0) + 1;
  if (state.frameCount % 300 !== 0) return; // 每 300 帧（约 5 秒）记录一次

  const fps = engine.getFps();
  if (fps < 20 && !state.warned) {
    console.warn(`[scene3d] 帧率偏低: ${fps.toFixed(1)} fps`);
    state.warned = true;
  }
}
