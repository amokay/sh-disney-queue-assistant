/**
 * 3D 模型加载（设计师向）
 * ----------------------
 * 默认：**不用改代码**。把 .glb 放进 `frontend/assets/models/optimized/`（任意子目录），
 * 刷新页面即可自动进场景（由后端 `/api/discover/glbs` 扫描列表）。
 *
 * 配置文件：`frontend/assets/data/models.manifest.json`
 * - `autoDiscover`: **true（可省略，省略视为 true）** → 自动加载 optimized 下全部 .glb
 * - `autoDiscover`: **false** → 不自动扫描，只加载下面手写 `models` 数组里的条目（精细控制时用）
 * - `pickRules`: 可选。按 **文件名/路径里是否包含某段文字** 绑定「点击打开哪个景点」；**glb_poi_bindings 同步写库时**也用它把 POI 投影写到对应 `attractions`（与蓝球 xz 对齐），**更长的 match 优先**。
 *   例：`01_Main_castle.glb` 可写 match `Main_castle` 或 `castle`（更具体的 match 写在数组前面）。
 * 其它：`model_transforms.json`、`glb_poi_bindings.json`、`geo_reference.json`；校准：`SHOW_ORIGIN_CALIBRATION_MARKER`（原点橙柱、第二参照蓝柱）、`COPY_SCENE_XZ_ON_SHIFT_CLICK`（Shift+左键点地复制 xz）、`CALIBRATION_SECOND_PILLAR_XZ`、`model_materials.json`、`map_pins.json`、`parade_route.json`；演示用树/打点见下方开关。
 */

/** @type {string[]} 仅当 manifest 里 autoDiscover:false 且 models 为空时，作为兜底 url 列表 */
export const AUTO_LOAD_GLBS = [];

/**
 * 底部「迪士尼乐园导览」列表面板（搜索 + 景点列表 + 花车勾选）。
 * 设为 false 时不在前台展示该面板，景点改由 3D 里打点（见 SHOW_BACKEND_MARKERS）与可选头顶标签展示。
 */
export const SHOW_ATTRACTION_LIST_PANEL = false;

/** 为 true 时在景点 position 处放置可点击蓝球；已有对应 GLB（manifest pickRules 绑定）的景点自动不显示蓝球 */
export const SHOW_BACKEND_MARKERS = true;

/** 为 true 时在场景里画示例树（占位） */
export const SHOW_DEMO_TREES = false;

/** 为 true 时在世界原点 (0,0,0) 放置校准参照物、半透明地面与网格；Shift+左键点地可读 xz（见 COPY_SCENE_XZ_ON_SHIFT_CLICK） */
export const SHOW_ORIGIN_CALIBRATION_MARKER = true;

/**
 * 为 true：Shift+左键点在地面 (y≈0) 时，把世界坐标 x、z 复制到剪贴板并 Toast。
 * 可与橙柱校准分开：关掉 SHOW_ORIGIN_CALIBRATION_MARKER 仍可量点复制。
 */
export const COPY_SCENE_XZ_ON_SHIFT_CLICK = true;

/**
 * 与原点配套的第二个参照柱（场景坐标），便于量「图上两点的距离 ↔ 场景里两柱距离」估 sceneUnitsPerMeter。
 * 设为 false 可只保留原点。
 */
export const SHOW_CALIBRATION_SECOND_PILLAR = true;
/** 第二参照柱中心在地面上的位置（x, z），y 由代码贴地 */
export const CALIBRATION_SECOND_PILLAR_XZ = [80, 0];

/** 为 true 时在景点坐标上方显示 CSS2D 标签（名称 + 排队分钟） */
export const SHOW_WAIT_LABELS_3D = true;

/** 为 true 时加载 map_pins.json 里的地图打点 */
export const SHOW_MAP_PINS = false;

/**
 * 仅当 manifest 里 `autoDiscover:false` 且未写 models、且 AUTO_LOAD_GLBS 为空时，
 * 为 true 仍会走自动扫描（一般不必开）。
 */
export const ALLOW_DISCOVER_ALL_GLBS = false;

/**
 * 默认相机（设计师可只改数字，不用写代码逻辑）
 * 若仍看不到模型：把相机拉远，例如 position 三个数都改成 200～400 再试。
 */
export const DEFAULT_CAMERA_POSITION = [14.5, 39.9, 34.5];
/** OrbitControls 看向的点，一般对准场景中心略抬高 */
export const DEFAULT_CAMERA_TARGET = [-10.3, -1.9, -31.8];

/** @deprecated 请使用 models.manifest.json 或 AUTO_LOAD_GLBS */
export const MODEL_PATHS = {
  overview: "/assets/models/optimized/overview/park_overview.glb",
  ground: "/assets/models/optimized/zones/ground.glb",
};

export function waitColorClass(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "wait--na";
  if (minutes < 30) return "wait--green";
  if (minutes < 60) return "wait--orange";
  return "wait--red";
}
