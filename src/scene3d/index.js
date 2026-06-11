/**
 * scene3d/index.js
 * ════════════════
 * 3D 层对外唯一入口。
 * 框架层（main.js）只通过 SceneManager 实例与 3D 层通信，
 * 不直接引用任何 Babylon 对象——确保两层可独立开发、无冲突合并。
 *
 * 使用方式：
 *   import { SceneManager } from './scene3d/index.js';
 *   const scene3d = new SceneManager(canvas, { target: [-10, 0, -31] });
 *   await scene3d.init();
 *   await scene3d.playIntro();
 */

import { getDeviceTier, getTierConfig, createEngine, adaptivePerformanceCheck, setupAntiAliasing } from "./engine.js";
import { setupLights, addShadowCaster } from "./lights.js";
import { createCameraRig } from "./camera.js";
import { loadGLB, loadModelsBatched } from "./loader.js";
import { bindPicking } from "./interaction.js";
import { rebuildMarkers, setRouteHighlight } from "./markers.js";
import { createRouteOverlays } from "./routeLines.js";
import { createUserLocationMarker } from "./userLocation.js";
import { createCarouselSpin } from "./carouselSpin.js";
import { createWaitLabelOverlay } from "./waitLabels.js";
import { addTreeInstances } from "./instances.js";
import { addMapPins } from "./mapPins.js";
import { createTunerPanel } from "./tunerPanel.js";
import { fetchModelTransformRules } from "./modelTransforms.js";
import { fetchModelMaterialRules } from "./modelMaterials.js";
import { loadDiscoveredModels, loadModelsFromManifest, pickAttractionIdForGlbUrl } from "./modelManifest.js";
import { createInfiniteGround } from "./infiniteGround.js";
import { loadVegetation } from "./vegetation.js";

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [config]
   * @param {[number, number, number]} [config.target] - 默认相机目标
   * @param {[number, number, number]} [config.position] - 默认相机位置（被 Babylon ArcRotate 转为 alpha/beta/radius）
   */
  constructor(canvas, config = {}) {
    this._canvas = canvas;
    this._config = config;
    this._disposed = false;

    // 设备分级
    this.deviceTier = getDeviceTier();
    this.tierConfig = getTierConfig(this.deviceTier);

    // 以下在 init() 中初始化
    this._engine = null;
    this._scene = null;
    this._cameraRig = null;
    this._lights = null;
    this._routes = null;
    this._userLbs = null;
    this._carousel = null;
    this._labels = null;
    this._picking = null;
    this._perfState = { frameCount: 0, degraded: false };

    // 回调
    this._onAttractionClicked = null;
    this._onMapPinClicked = null;
  }

  /**
   * 初始化引擎、场景、灯光、相机。
   * 框架层在创建 SceneManager 后必须调用一次。
   */
  async init() {
    const BABYLON = window.BABYLON;

    // 引擎
    this._engine = createEngine(this._canvas, this.tierConfig);

    // 场景
    this._scene = new BABYLON.Scene(this._engine);
    // ★ 使用右手坐标系，与 Three.js / glTF 标准一致，避免模型左右镜像
    this._scene.useRightHandedSystem = true;
    this._scene.clearColor = new BABYLON.Color4(0.118, 0.251, 0.686, 1); // 迪士尼主蓝色 #1E40AF
    // 不用线性雾（逐片元计算，移动端有开销），远景淡出靠地面径向渐变实现

    // ACES Tone Mapping（移动端必开）
    this._scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this._scene.imageProcessingConfiguration.toneMappingType =
      BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    this._scene.imageProcessingConfiguration.exposure = 1.7;
    this._scene.imageProcessingConfiguration.contrast = 1.1;

    // ─── 环境贴图（天空盒 + PBR 反射） ───
    await this._loadEnvironment();

    // 灯光
    this._lights = setupLights(this._scene, this.tierConfig);

    // 相机
    this._cameraRig = createCameraRig(this._scene, this._canvas, {
      target: this._config.target,
      position: this._config.position,
    });

    // FXAA 抗锯齿（轻量后处理，一次全屏 pass）
    this._pipeline = setupAntiAliasing(this._scene, this._cameraRig.camera, this.tierConfig);

    this._ground = null;

    // 路线覆盖物
    this._routes = createRouteOverlays(this._scene);

    // 用户定位标记
    this._userLbs = createUserLocationMarker(this._scene);
    // renderingGroupId=2 清除深度，确保定位标记始终可见
    this._scene.setRenderingAutoClearDepthStencil(2, true, true, false);

    // 旋转木马
    this._carousel = createCarouselSpin(this._scene);

    // 标签层容器
    const labelContainer = document.createElement("div");
    labelContainer.className = "scene3d-labels";
    labelContainer.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2;";
    this._canvas.parentElement.appendChild(labelContainer);
    this._labels = createWaitLabelOverlay(
      this._scene,
      this._cameraRig.camera,
      this._engine,
      labelContainer
    );

    // 交互拾取
    this._picking = bindPicking(this._scene, this._canvas, {
      onAttractionClicked: (id, hitPoint, rootNode) => {
        this._onAttractionClicked?.(id, hitPoint, rootNode);
      },
      onMapPinClicked: (pinId, label, attractionId) => {
        this._onMapPinClicked?.(pinId, label, attractionId);
      },
    });

    // 运行时性能监控
    this._scene.registerBeforeRender(() => {
      adaptivePerformanceCheck(this._engine, this._perfState, {
        shadowGenerator: this._lights.shadowGenerator,
      });
    });

    // 启动渲染循环
    this._engine.runRenderLoop(() => {
      this._cameraRig.update();
      this._userLbs.tick();
      this._carousel.update(this._engine.getDeltaTime() / 1000);
      this._scene.render();
      this._labels.render();
    });

    // 自动 resize
    window.addEventListener("resize", this._onResize);

    // ─── 模型调参面板（设计师工具，生产环境可移除） ───
    this._tuner = createTunerPanel(this._scene);

    console.info(
      `[scene3d] 初始化完成 | 设备档位: ${this.deviceTier} | pixelRatio: ${this.tierConfig.pixelRatio}`
    );
  }

  _onResize = () => {
    this._engine?.resize();
  };

  // ════════════════════════════════════════════════════════════════
  // 环境贴图
  // ════════════════════════════════════════════════════════════════

  /**
   * 加载全景图作为天空盒 + 环境反射。
   * HDR → HDRCubeTexture + createDefaultSkybox
   * JPG/PNG → PhotoDome（最可靠的全景显示方式）
   */
  async _loadEnvironment() {
    const BABYLON = window.BABYLON;
    const scene = this._scene;

    // 按优先级尝试
    const candidates = [
      "./assets/3d/textures/env_panorama.hdr",
      "./assets/3d/textures/environment.hdr",
      "./assets/3d/textures/skybox.hdr",
      "./assets/3d/textures/env_panorama.jpg",
      "./assets/3d/textures/env_panorama.png",
    ];

    let foundUrl = null;
    for (const url of candidates) {
      try {
        const r = await fetch(url, { method: "HEAD" });
        if (r.ok) { foundUrl = url; break; }
      } catch { /* next */ }
    }

    if (!foundUrl) {
      console.warn("[scene3d] 未找到环境贴图文件，已检查:", candidates.join(", "));
      return;
    }

    const isHdr = foundUrl.endsWith(".hdr");
    console.info(`[scene3d] 找到环境贴图: ${foundUrl} (${isHdr ? "HDR" : "JPG/PNG"})`);

    try {
      if (isHdr) {
        // HDR 走 CubeTexture + Skybox 路线
        const tex = new BABYLON.HDRCubeTexture(foundUrl, scene, 256);
        await new Promise((resolve, reject) => {
          tex.onLoadObservable.addOnce(() => resolve());
          setTimeout(() => reject(new Error("HDR 加载超时")), 15000);
        });
        scene.environmentTexture = tex;
        const sky = scene.createDefaultSkybox(tex, true, 10000, 0);
        if (sky) {
          sky.isPickable = false;
          sky.applyFog = false;
        }
      } else {
        // ★ JPG/PNG 用 PhotoDome —— Babylon 专为 360° 全景图设计的方案
        const dome = new BABYLON.PhotoDome(
          "skyDome",
          foundUrl,
          {
            resolution: 32,
            size: 10000,
            useDirectMapping: false, // equirectangular 投影
          },
          scene
        );
        dome.isPickable = false;
        dome.applyFog = false;
        // PhotoDome 内部 mesh 也关掉雾
        if (dome.mesh) dome.mesh.applyFog = false;

        // 等待贴图加载完成
        await new Promise((resolve) => {
          const check = () => {
            if (dome.photoTexture?.isReady()) {
              resolve();
            } else {
              setTimeout(check, 200);
            }
          };
          check();
          setTimeout(() => resolve(), 8000); // 兜底
        });

        // 也设 environmentTexture 让 PBR 材质有环境反射
        // 用 EquiRectangularCubeTexture 生成 cube map 用于反射
        try {
          const envTex = new BABYLON.EquiRectangularCubeTexture(foundUrl, scene, 128);
          scene.environmentTexture = envTex;
        } catch {
          console.info("[scene3d] 环境反射贴图创建失败，PBR 反射不可用");
        }
      }

      scene.environmentIntensity = 1.0;
      console.info("[scene3d] ✓ 环境贴图已生效，天空可见");
    } catch (e) {
      console.error("[scene3d] 环境贴图加载失败:", e);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SSAO 环境光遮蔽
  // ════════════════════════════════════════════════════════════════

  _setupSSAO() {
    const BABYLON = window.BABYLON;
    try {
      const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", this._scene, {
        ssaoRatio: 0.5,
        blurRatio: 0.5,
      });
      ssao.radius = 3.5;
      ssao.totalStrength = 1.2;
      ssao.expensiveBlur = false;
      ssao.samples = 16;
      ssao.maxZ = 300;
      this._scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        "ssao",
        this._cameraRig.camera
      );
      this._ssao = ssao;
      console.info("[scene3d] ✓ SSAO 环境光遮蔽已开启");
    } catch (e) {
      console.warn("[scene3d] SSAO 开启失败:", e);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 相机
  // ════════════════════════════════════════════════════════════════

  playIntro(opts) {
    return this._cameraRig.playIntro(opts);
  }

  resetCamera() {
    this._cameraRig.resetToDefault();
  }

  /**
   * 遍历所有 GLB 根节点（可能是 Mesh 或 TransformNode）。
   */
  _allGltfRoots() {
    const roots = [];
    for (const node of this._scene.transformNodes) {
      if (node.metadata?.isGltfModelRoot) roots.push(node);
    }
    for (const mesh of this._scene.meshes) {
      if (mesh.metadata?.isGltfModelRoot) roots.push(mesh);
    }
    return roots;
  }

  focusOnAttraction(id) {
    console.log('[LINKAGE] focusOnAttraction called with id:', id);
    // 标签相关常量（与 waitLabels.js 保持一致）
    const LABEL_ABOVE_MODEL = 3;
    const LABEL_Y_OFFSET_DEFAULT = 5;
    const LABEL_Y_MAX = 18;
    const LABEL_CARD_BUFFER = 3; // DOM 卡片在锚点上方的额外高度缓冲

    // 找到对应的模型根节点（可能是 Mesh 或 TransformNode）
    const roots = this._allGltfRoots();
    console.log('[LINKAGE] searching', roots.length, 'glTF roots for id:', id);
    for (const node of roots) {
      if (node.metadata?.pickableAttractionId === id) {
        console.log('[LINKAGE] found model match for:', id);
        const bounds = node.getHierarchyBoundingVectors();
        const center = bounds.min.add(bounds.max).scale(0.5);
        const modelTopY = bounds.max.y;

        // 计算标签顶部 Y（与 waitLabels.js 的 rebuild 逻辑一致）
        const py = center.y;
        let labelY;
        if (modelTopY > py) {
          labelY = Math.min(modelTopY + LABEL_ABOVE_MODEL, LABEL_Y_MAX);
        } else {
          labelY = py + LABEL_Y_OFFSET_DEFAULT;
        }
        const labelTopY = labelY + LABEL_CARD_BUFFER;

        this._cameraRig.focusOnAttractionWithLabel(
          { x: center.x, y: bounds.min.y, z: center.z },
          labelTopY
        );
        return;
      }
    }
    // fallback: 从 marker 中找
    console.log('[LINKAGE] no model found, trying AttractionMarkers fallback for:', id);
    const markersRoot = this._scene.getTransformNodeByName("AttractionMarkers");
    if (markersRoot) {
      for (const mesh of markersRoot.getChildMeshes()) {
        if (mesh.metadata?.attractionId === id) {
          console.log('[LINKAGE] found marker match for:', id);
          const pos = mesh.position;
          const labelTopY = pos.y + LABEL_Y_OFFSET_DEFAULT + LABEL_CARD_BUFFER;
          this._cameraRig.focusOnAttractionWithLabel(
            { x: pos.x, y: pos.y, z: pos.z },
            labelTopY
          );
          return;
        }
      }
    }
    console.warn('[LINKAGE] focusOnAttraction: NO match found for id:', id, '- available pickableAttractionIds:', roots.map(n => n.metadata?.pickableAttractionId).filter(Boolean));
  }

  focusOnPoint(x, y, z, radius) {
    this._cameraRig.focusOnPoint({ x, y, z }, { radius });
  }

  focusOnRoute(polyline, ordered) {
    const points = [];
    if (polyline?.length) points.push(...polyline);
    if (ordered?.length) {
      for (const o of ordered) {
        if (o.position) points.push(o.position);
      }
    }
    this._cameraRig.focusOnBounds(points);
  }

  focusTopDown(x, z, height) {
    this._cameraRig.focusTopDown({ x, z }, { height });
  }

  flyToView(position, target) {
    this._cameraRig.flyToView(position, target);
  }

  focusOnLbsAndNext(lbs, next) {
    this._cameraRig.focusOnBounds([lbs, next]);
  }

  /**
   * 导航启动时自动调整相机，使起点和终点都可见。
   * @param {{ x: number, z: number }} start 用户当前位置
   * @param {{ x: number, z: number }} end   目标景点位置
   */
  fitNavigationView(start, end) {
    this._cameraRig.fitRouteEndpoints(start, end);
  }

  /**
   * 获取当前相机坐标（位置 + 目标点）。
   * @returns {{ position: {x:number,y:number,z:number}, target: {x:number,y:number,z:number} } | null}
   */
  getCameraCoords() {
    if (!this._cameraRig || !this._cameraRig.camera) return null;
    const cam = this._cameraRig.camera;
    const p = cam.position;
    const t = cam.target;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      target: { x: t.x, y: t.y, z: t.z },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 模型
  // ════════════════════════════════════════════════════════════════

  /**
   * 加载模型（完整版）：按 models.manifest.json 规则加载，支持 autoDiscover 和手动列表。
   * 自动应用 model_transforms.json 位置映射 + model_materials.json 材质覆盖 + pickRules 景点绑定。
   *
   * @param {{ autoDiscover?: boolean, models?: Array, pickRules?: Array }} [manifestDoc]
   *        传入 models.manifest.json 解析后的对象；省略则默认 autoDiscover。
   */
  async loadModels(manifestDoc) {
    const manifest = manifestDoc || { autoDiscover: true };

    // 加载变换规则和材质规则
    const transformRules = await fetchModelTransformRules();
    const materialRules = await fetchModelMaterialRules();
    const pickRules = manifest.pickRules || [];

    const useAutoDiscover = manifest.autoDiscover !== false;
    const explicitList = Array.isArray(manifest.models) && manifest.models.length > 0;

    if (useAutoDiscover) {
      // 自动扫描模式（默认）
      await loadDiscoveredModels(this._scene, pickRules, transformRules, materialRules);
    } else if (explicitList) {
      // 手动列表模式
      await loadModelsFromManifest(this._scene, manifest, transformRules, materialRules);
    } else {
      console.info("[scene3d] 未加载 glb：manifest 中未配置 autoDiscover 也没有 models 列表");
    }

    // 模型加载后：发现旋转木马节点
    this._carousel.discover();

    // 所有 GLB 模型加入阴影投射
    if (this._lights.shadowGenerator) {
      for (const node of this._allGltfRoots()) {
        for (const mesh of node.getChildMeshes()) {
          addShadowCaster(this._lights.shadowGenerator, mesh);
        }
      }
    }

    // 模型加载完成后刷新调参面板的下拉列表
    if (this._tuner) this._tuner.refreshModelList();

    // ── 植被系统 ──
    this._vegetation = await loadVegetation(this._scene);

    console.info("[scene3d] 模型加载完成");
  }

  getLoadedAttractionIds() {
    const ids = new Set();
    for (const node of this._allGltfRoots()) {
      if (node.metadata?.pickableAttractionId) {
        ids.add(node.metadata.pickableAttractionId);
      }
    }
    return ids;
  }

  getModelTopY(attractionId) {
    for (const node of this._allGltfRoots()) {
      if (node.metadata?.pickableAttractionId !== attractionId) continue;
      const bounds = node.getHierarchyBoundingVectors();
      return bounds.max.y;
    }
    return null;
  }

  getModelTopYMap() {
    const map = new Map();
    for (const node of this._allGltfRoots()) {
      const id = node.metadata?.pickableAttractionId;
      if (!id) continue;
      const bounds = node.getHierarchyBoundingVectors();
      const topY = bounds.max.y;
      const prev = map.get(id);
      if (prev == null || topY > prev) map.set(id, topY);
    }
    return map;
  }

  // ════════════════════════════════════════════════════════════════
  // 标记 & 高亮
  // ════════════════════════════════════════════════════════════════

  rebuildMarkers(attractions, glbIds) {
    rebuildMarkers(this._scene, attractions, glbIds);
  }

  setRouteHighlight(ids) {
    setRouteHighlight(this._scene, ids);
  }

  // ════════════════════════════════════════════════════════════════
  // 路线
  // ════════════════════════════════════════════════════════════════

  setDenseWalkRoute(polyline, opts) {
    this._routes.setDenseWalkRoute(polyline, opts);
  }

  setRoutePreview(ordered) {
    this._routes.setRoutePreview(ordered);
  }

  clearRoute() {
    this._routes.clearWalkRoute();
  }

  setParadeRoute(points) {
    this._routes.setParadeRoute(points);
  }

  setParadeVisible(visible) {
    this._routes.setParadeVisible(visible);
  }

  setParkRoads(roads) {
    this._routes.setParkRoads(roads);
  }

  // ════════════════════════════════════════════════════════════════
  // 用户位置
  // ════════════════════════════════════════════════════════════════

  setUserPosition(x, z) {
    this._userLbs.setPosition(x, z);
  }

  setUserTarget(x, z) {
    this._userLbs.setTarget({ x, z });
  }

  clearUserTarget() {
    this._userLbs.clearTarget();
  }

  hideUserMarker() {
    this._userLbs.hide();
  }

  // ════════════════════════════════════════════════════════════════
  // 标签
  // ════════════════════════════════════════════════════════════════

  rebuildWaitLabels(attractions, modelTopYMap) {
    this._labels.rebuild(attractions, modelTopYMap);
  }

  focusLabel(id) {
    this._labels.focusOn(id);
  }

  clearLabelFocus() {
    this._labels.clearFocus();
  }

  setLabelsVisible(visible) {
    this._labels.setVisible(visible);
  }

  // ════════════════════════════════════════════════════════════════
  // 旋转木马
  // ════════════════════════════════════════════════════════════════

  setCarouselActive(active) {
    this._carousel.setActive(active);
  }

  // ════════════════════════════════════════════════════════════════
  // 树木 & 标点
  // ════════════════════════════════════════════════════════════════

  addTrees(positions) {
    addTreeInstances(this._scene, positions);
  }

  addPins(pins) {
    addMapPins(this._scene, pins);
  }

  // ════════════════════════════════════════════════════════════════
  // 事件回调（3D → 框架层）
  // ════════════════════════════════════════════════════════════════

  onAttractionClicked(callback) {
    this._onAttractionClicked = callback;
  }

  onMapPinClicked(callback) {
    this._onMapPinClicked = callback;
  }

  // ════════════════════════════════════════════════════════════════
  // 生命周期
  // ════════════════════════════════════════════════════════════════

  resize() {
    this._engine?.resize();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    window.removeEventListener("resize", this._onResize);
    this._picking?.dispose();
    this._labels?.dispose();
    this._routes?.dispose();
    this._ground?.dispose();
    this._pipeline?.dispose();
    this._engine?.stopRenderLoop();
    this._scene?.dispose();
    this._engine?.dispose();
  }
}
