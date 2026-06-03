/**
 * scene3d/routeLines.js
 * ─────────────────────
 * 路线管道（步行导航管线 + 方向箭头）、花车巡游路线、园区路网。
 * 使用 ShaderMaterial 实现蓝紫(#6666FF)→红色(#FF0000)渐变 + 流动脉冲动画。
 */

const ROUTE_TUBE_CENTER_Y = 3.0;

/* ─── Shader 源码 ─── */

const ROUTE_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 position;
  attribute vec2 uv;

  uniform mat4 worldViewProjection;

  varying float vProgress;

  void main() {
    vProgress = uv.y;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }
`;

const ROUTE_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform float uAlpha;

  varying float vProgress;

  void main() {
    // 渐变：蓝紫色 #6666FF (起点/LBS) -> 红色 #FF0000 (终点/项目)
    vec3 startColor = vec3(0.4, 0.4, 1.0);
    vec3 endColor = vec3(0.53, 0.22, 1.0);
    vec3 baseColor = mix(startColor, endColor, vProgress);

    // 流动脉冲（从起点流向终点）
    float pulse = fract(vProgress * 3.0 - uTime * 0.8);
    pulse = smoothstep(0.0, 0.3, pulse) * smoothstep(1.0, 0.7, pulse);

    // 混合脉冲亮带
    vec3 finalColor = baseColor + vec3(0.3, 0.2, 0.1) * pulse;

    gl_FragColor = vec4(finalColor, uAlpha);
  }
`;

/**
 * 创建路线流动 ShaderMaterial
 * @param {string} name
 * @param {BABYLON.Scene} scene
 * @param {number} alpha
 * @returns {BABYLON.ShaderMaterial}
 */
function _createFlowMaterial(name, scene, alpha) {
  const BABYLON = window.BABYLON;

  // 将 shader 源码存入 ShadersStore
  const vertexKey = name + "VertexShader";
  const fragmentKey = name + "FragmentShader";
  BABYLON.Effect.ShadersStore[vertexKey] = ROUTE_VERTEX_SHADER;
  BABYLON.Effect.ShadersStore[fragmentKey] = ROUTE_FRAGMENT_SHADER;

  const shaderMat = new BABYLON.ShaderMaterial(
    name,
    scene,
    { vertex: name, fragment: name },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "uTime", "uAlpha"],
    }
  );

  shaderMat.setFloat("uTime", 0);
  shaderMat.setFloat("uAlpha", alpha);
  shaderMat.backFaceCulling = false;
  shaderMat.alpha = alpha;
  // 半透明需要关闭深度写入，确保不遮挡其他透明物体
  shaderMat.disableDepthWrite = true;

  return shaderMat;
}

/**
 * @param {BABYLON.Scene} scene
 */
export function createRouteOverlays(scene) {
  const BABYLON = window.BABYLON;

  // 各类路线的根节点（方便统一显隐/清除）
  const routeRoot = new BABYLON.TransformNode("RouteOverlays", scene);
  let _walkRouteMesh = null;
  let _walkRouteMat = null;
  let _walkAnimObserver = null;
  let _paradeRouteMesh = null;
  let _parkRoadsMesh = null;

  // 动画时间累加器
  let _time = 0;

  /**
   * 注册帧动画 observer，驱动 shader 流动效果
   */
  function _registerAnimation(mat) {
    _unregisterAnimation();
    _time = 0;
    _walkAnimObserver = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      _time += dt;
      mat.setFloat("uTime", _time);
    });
  }

  /**
   * 取消动画 observer
   */
  function _unregisterAnimation() {
    if (_walkAnimObserver) {
      scene.onBeforeRenderObservable.remove(_walkAnimObserver);
      _walkAnimObserver = null;
    }
  }

  /**
   * 绘制步行导航路线（蓝紫→红色渐变管道 + 流动脉冲动画）。
   * @param {Array<{ x: number, y?: number, z: number }>} polyline
   * @param {{ animate?: boolean, segments?: Array }} [opts]
   */
  function setDenseWalkRoute(polyline, opts = {}) {
    clearWalkRoute();
    if (!polyline?.length || polyline.length < 2) return;

    const points = polyline.map(
      (p) => new BABYLON.Vector3(p.x, p.y ?? ROUTE_TUBE_CENTER_Y, p.z)
    );

    // 粗管线
    _walkRouteMesh = BABYLON.MeshBuilder.CreateTube(
      "walkRoute",
      { path: points, radius: 0.35, tessellation: 8, updatable: false },
      scene
    );
    _walkRouteMesh.parent = routeRoot;
    _walkRouteMesh.renderingGroupId = 1;

    // 渐变流动 ShaderMaterial
    _walkRouteMat = _createFlowMaterial("walkRouteFlow", scene, 0.6);
    _walkRouteMesh.material = _walkRouteMat;

    // 注册动画
    _registerAnimation(_walkRouteMat);
  }

  function clearWalkRoute() {
    _unregisterAnimation();
    if (_walkRouteMesh) {
      _walkRouteMesh.dispose();
      _walkRouteMesh = null;
    }
    if (_walkRouteMat) {
      _walkRouteMat.dispose();
      _walkRouteMat = null;
    }
  }

  /**
   * 简单路线预览（渐变流动管线，用于非导航模式）。
   * @param {Array<{ id: string, position: { x: number, y?: number, z: number } }>} ordered
   */
  function setRoutePreview(ordered) {
    clearWalkRoute();
    if (!ordered?.length || ordered.length < 2) return;

    const points = ordered
      .filter((o) => o.position)
      .map(
        (o) =>
          new BABYLON.Vector3(
            o.position.x,
            (o.position.y ?? 0) + ROUTE_TUBE_CENTER_Y,
            o.position.z
          )
      );

    if (points.length < 2) return;

    // 粗管线预览路线
    _walkRouteMesh = BABYLON.MeshBuilder.CreateTube(
      "routePreview",
      { path: points, radius: 0.245, tessellation: 8, updatable: false },
      scene
    );
    _walkRouteMesh.parent = routeRoot;
    _walkRouteMesh.renderingGroupId = 1;

    // 渐变流动 ShaderMaterial
    _walkRouteMat = _createFlowMaterial("routePreviewFlow", scene, 0.55);
    _walkRouteMesh.material = _walkRouteMat;

    // 注册动画
    _registerAnimation(_walkRouteMat);
  }

  /**
   * 设置花车巡游路线（黄色虚线）。
   * @param {Array<{ x: number, y?: number, z: number }>} points
   */
  function setParadeRoute(points) {
    if (_paradeRouteMesh) {
      _paradeRouteMesh.dispose();
      _paradeRouteMesh = null;
    }
    if (!points?.length || points.length < 2) return;

    const path = points.map(
      (p) => new BABYLON.Vector3(p.x, (p.y ?? 0) + 0.3, p.z)
    );

    _paradeRouteMesh = BABYLON.MeshBuilder.CreateLines(
      "paradeRoute",
      { points: path, updatable: false },
      scene
    );
    _paradeRouteMesh.parent = routeRoot;
    _paradeRouteMesh.color = new BABYLON.Color3(1, 0.85, 0.2);
    _paradeRouteMesh.alpha = 0.6;
    _paradeRouteMesh.renderingGroupId = 1;
    _paradeRouteMesh.material && (_paradeRouteMesh.material.disableDepthWrite = true);
  }

  function setParadeVisible(visible) {
    if (_paradeRouteMesh) _paradeRouteMesh.isVisible = visible;
  }

  /**
   * 设置园区常驻路网（白色细线）。
   * @param {Array<{ id: string, points: Array<{ x: number, y?: number, z: number }> }>} roads
   */
  function setParkRoads(roads) {
    if (_parkRoadsMesh) {
      _parkRoadsMesh.dispose();
      _parkRoadsMesh = null;
    }
    if (!roads?.length) return;

    // 合并所有路段为一个 LineSystem（1 Draw Call）
    const lines = roads
      .filter((r) => r.points?.length >= 2)
      .map((r) =>
        r.points.map((p) => new BABYLON.Vector3(p.x, (p.y ?? 0) + 0.15, p.z))
      );

    if (!lines.length) return;

    _parkRoadsMesh = BABYLON.MeshBuilder.CreateLineSystem(
      "parkRoads",
      { lines, updatable: false },
      scene
    );
    _parkRoadsMesh.parent = routeRoot;
    _parkRoadsMesh.color = new BABYLON.Color3(0.85, 0.85, 0.85);
    _parkRoadsMesh.alpha = 0.5;
    _parkRoadsMesh.renderingGroupId = 1;
    _parkRoadsMesh.material && (_parkRoadsMesh.material.disableDepthWrite = true);
  }

  function dispose() {
    _unregisterAnimation();
    routeRoot.dispose();
  }

  return {
    setDenseWalkRoute,
    clearWalkRoute,
    setRoutePreview,
    setParadeRoute,
    setParadeVisible,
    setParkRoads,
    dispose,
  };
}
