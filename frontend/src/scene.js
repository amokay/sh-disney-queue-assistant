import * as THREE from "three";
import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  SHOW_ORIGIN_CALIBRATION_MARKER,
  SHOW_CALIBRATION_SECOND_PILLAR,
  CALIBRATION_SECOND_PILLAR_XZ,
} from "./config.js";

function addOriginCalibrationMarker(scene) {
  const g = new THREE.Group();
  g.name = "CalibrationOrigin";
  g.position.set(0, 0, 0);

  const axes = new THREE.AxesHelper(28);
  axes.name = "CalibrationAxes";
  axes.material.depthTest = false;
  axes.renderOrder = 1000;
  g.add(axes);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.65, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xff5a1f,
      emissive: 0xcc2200,
      emissiveIntensity: 0.45,
      metalness: 0.25,
      roughness: 0.35,
    })
  );
  pole.name = "CalibrationPole";
  pole.position.set(0, 10, 0);
  pole.castShadow = true;
  g.add(pole);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 2.8, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = "CalibrationRingGround";
  g.add(ring);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 28, 28),
    new THREE.MeshStandardMaterial({
      color: 0x22ffaa,
      emissive: 0x00aa66,
      emissiveIntensity: 0.55,
      metalness: 0.15,
      roughness: 0.35,
    })
  );
  dot.name = "CalibrationGroundDot";
  dot.position.set(0, 0.5, 0);
  dot.castShadow = true;
  g.add(dot);

  scene.add(g);
}

function addSecondCalibrationPillar(scene) {
  if (!SHOW_CALIBRATION_SECOND_PILLAR) return;
  const sx = Number(CALIBRATION_SECOND_PILLAR_XZ[0]) || 80;
  const sz = Number(CALIBRATION_SECOND_PILLAR_XZ[1]) || 0;

  const g = new THREE.Group();
  g.name = "CalibrationSecond";
  g.position.set(sx, 0, sz);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      emissive: 0x113366,
      emissiveIntensity: 0.35,
      metalness: 0.2,
      roughness: 0.4,
    })
  );
  pole.position.set(0, 8, 0);
  pole.castShadow = true;
  g.add(pole);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 2.2, 48),
    new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);

  scene.add(g);
}

function addCalibrationGroundAndGrid(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({
      color: 0x1a2233,
      metalness: 0.05,
      roughness: 0.92,
      transparent: true,
      opacity: 0.4,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "CalibrationGroundPlane";
  ground.userData.isCalibrationPickSurface = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(800, 80, 0x5588cc, 0x334466);
  grid.position.y = 0.02;
  grid.name = "CalibrationGrid";
  scene.add(grid);
}

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = null;
  // 雾放远、变淡，避免把模型“吃没”；精模阶段若仍嫌挡眼可把 far 再调大或关掉 scene.fog
  scene.fog = new THREE.Fog(0x25252f, 400, 2600);

  const camera = new THREE.PerspectiveCamera(
    50,
    Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight),
    0.1,
    8000
  );
  camera.position.set(
    DEFAULT_CAMERA_POSITION[0],
    DEFAULT_CAMERA_POSITION[1],
    DEFAULT_CAMERA_POSITION[2]
  );

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 略提高曝光，Standard 材质在 glb 里更容易看清
  renderer.toneMappingExposure = 1.45;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // —— 灯光组 ——

  // 环境光（低强度，避免全黑）
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // 浅蓝色天空顶光（模拟天空散射）
  const skyLight = new THREE.DirectionalLight(0x8ec8f0, 1.2);
  skyLight.position.set(0, 400, 0);
  skyLight.castShadow = false;
  scene.add(skyLight);

  // 半球光（天蓝 + 地面暗色）
  const hemi = new THREE.HemisphereLight(0xadd8e6, 0x2a2a30, 0.6);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  // 主日光（暖白色，高精度阴影）
  const sun = new THREE.DirectionalLight(0xfffaf0, 2.8);
  sun.position.set(14, 300, 156);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 1200;
  const b = 180;
  sun.shadow.camera.left = -b;
  sun.shadow.camera.right = b;
  sun.shadow.camera.top = b;
  sun.shadow.camera.bottom = -b;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 1.5;
  scene.add(sun);

  // 补光（冷色，从对侧打）
  const fill = new THREE.DirectionalLight(0xb0d4f1, 0.5);
  fill.position.set(-160, 120, -80);
  scene.add(fill);

  // 轮廓光（暖色边缘高光）
  const rim = new THREE.DirectionalLight(0xfff2dd, 0.3);
  rim.position.set(-40, 80, 200);
  scene.add(rim);

  // ground & grid hidden
  // if (SHOW_ORIGIN_CALIBRATION_MARKER) {
  //   addCalibrationGroundAndGrid(scene);
  //   addOriginCalibrationMarker(scene);
  //   addSecondCalibrationPillar(scene);
  // } else {
  //   const ground = new THREE.Mesh(
  //     new THREE.PlaneGeometry(1200, 1200),
  //     new THREE.MeshStandardMaterial({ color: 0x1a2233, metalness: 0.05, roughness: 0.95 })
  //   );
  //   ground.rotation.x = -Math.PI / 2;
  //   ground.receiveShadow = true;
  //   ground.name = "GroundPlane";
  //   scene.add(ground);
  //
  //   const grid = new THREE.GridHelper(800, 80, 0x334a6e, 0x1a2230);
  //   grid.position.y = 0.02;
  //   scene.add(grid);
  // }

  return { scene, camera, renderer, defaultTarget: DEFAULT_CAMERA_TARGET };
}
