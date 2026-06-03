/**
 * scene3d/routeLines.js
 * ─────────────────────
 * 路线管道（步行导航红管 + 方向箭头）、花车巡游路线、园区路网。
 * TODO: 后续填充具体实现（Babylon TubeBuilder / GreasedLine 等）。
 */

const ROUTE_TUBE_CENTER_Y = 1.5;

/**
 * @param {BABYLON.Scene} scene
 */
export function createRouteOverlays(scene) {
  const BABYLON = window.BABYLON;

  // 各类路线的根节点（方便统一显隐/清除）
  const routeRoot = new BABYLON.TransformNode("RouteOverlays", scene);
  let _walkRouteMesh = null;
  let _paradeRouteMesh = null;
  let _parkRoadsMesh = null;

  /**
   * 绘制步行导航路线（红色管道 + 方向箭头）。
   * @param {Array<{ x: number, y?: number, z: number }>} polyline
   * @param {{ animate?: boolean, segments?: Array }} [opts]
   */
  function setDenseWalkRoute(polyline, opts = {}) {
    clearWalkRoute();
    if (!polyline?.length || polyline.length < 2) return;

    const points = polyline.map(
      (p) => new BABYLON.Vector3(p.x, p.y ?? ROUTE_TUBE_CENTER_Y, p.z)
    );

    // 细线
    _walkRouteMesh = BABYLON.MeshBuilder.CreateLines(
      "walkRoute",
      { points, updatable: false },
      scene
    );
    _walkRouteMesh.parent = routeRoot;
    _walkRouteMesh.color = new BABYLON.Color3(1, 0.2, 0.2);
    _walkRouteMesh.alpha = 0.8;

    // TODO: 方向箭头 sprites、动画效果
  }

  function clearWalkRoute() {
    if (_walkRouteMesh) {
      _walkRouteMesh.dispose();
      _walkRouteMesh = null;
    }
  }

  /**
   * 简单路线预览（折线段，用于非导航模式）。
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

    _walkRouteMesh = BABYLON.MeshBuilder.CreateLines(
      "routePreview",
      { points, updatable: false },
      scene
    );
    _walkRouteMesh.parent = routeRoot;
    _walkRouteMesh.color = new BABYLON.Color3(1, 0.6, 0.4);
    _walkRouteMesh.alpha = 0.6;
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
  }

  function dispose() {
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
