import { db } from "./connection.js";
import { runPlannerSchema } from "./plannerSchema.js";

const attractions = [
  {
    id: "castle",
    name: "奇幻童话城堡",
    zone: "梦幻世界",
    position_x: -23.55,
    position_y: 0,
    position_z: -43.26,
    description: "乐园标志性城堡，夜间烟火与灯光秀的重要背景。",
  },
  {
    id: "tron",
    name: "创极速光轮",
    zone: "明日世界",
    position_x: -50.63,
    position_y: 0,
    position_z: -25.0,
    description: "高速过山车式骑乘，未来感光影与音乐体验。",
  },
  {
    id: "soaring",
    name: "翱翔·飞越地平线",
    zone: "探险岛",
    position_x: 25.9,
    position_y: 0,
    position_z: -52.9,
    description: "球幕飞行影院，俯瞰世界各地名胜。",
  },
  {
    id: "pirates",
    name: "加勒比海盗——沉落宝藏之战",
    zone: "宝藏湾",
    position_x: -5.12,
    position_y: 0,
    position_z: -63.94,
    description: "室内乘船漂流，结合巨幕与实景的沉浸式冒险。",
  },
  {
    id: "thunder",
    name: "雷鸣山漂流",
    zone: "探险岛",
    position_x: 13,
    position_y: 0,
    position_z: -37.3,
    description: "激流勇进式漂流，会湿身，雨天与夏季尤其热门。",
  },
  {
    id: "pooh",
    name: "小熊维尼历险记",
    zone: "梦幻世界",
    position_x: -30,
    position_y: 0,
    position_z: -69,
    description: "亲子向慢速轨道车，适合全家轻松体验。",
  },
  {
    id: "mine",
    name: "七个小矮人矿山车",
    zone: "梦幻世界",
    position_x: -21.7,
    position_y: 0,
    position_z: -65,
    description: "家庭过山车，穿越矿山与童话场景。",
  },
  {
    id: "buzz",
    name: "巴斯光年星际营救",
    zone: "明日世界",
    position_x: -41.49,
    position_y: 0,
    position_z: -15.96,
    description: "射击互动黑暗骑乘，比拼得分。",
  },
  // ===== 明日世界 =====
  {
    id: "jet-packs",
    name: "喷气背包飞行器",
    zone: "明日世界",
    position_x: -31,
    position_y: 0,
    position_z: -20,
    description: "环绕式空中旋转骑乘，体验喷气飞行乐趣。",
  },
  {
    id: "stitch-encounter",
    name: "太空幸会史迪奇",
    zone: "明日世界",
    position_x: -36.2,
    position_y: 0,
    position_z: -20.6,
    description: "实时互动演出，与史迪奇即兴对话。",
  },
  // ===== 梦幻世界 =====
  {
    id: "voyage-crystal-grotto",
    name: "晶彩奇航",
    zone: "梦幻世界",
    position_x: -31.8,
    position_y: 0,
    position_z: -44.2,
    description: "乘船穿梭于经典迪士尼故事场景的水路游船。",
  },
  {
    id: "peter-pan",
    name: "小飞侠天空奇遇",
    zone: "梦幻世界",
    position_x: -38.4,
    position_y: 0,
    position_z: -42.7,
    description: "悬挂式飞行轨道车，俯瞰梦幻岛夜景。",
  },
  {
    id: "hunny-pot-spin",
    name: "旋转疯蜜罐",
    zone: "梦幻世界",
    position_x: -31.5,
    position_y: 0,
    position_z: -62.2,
    description: "小熊维尼主题旋转杯，亲子向温和体验。",
  },
  {
    id: "fantasia-carousel",
    name: "幻想曲旋转木马",
    zone: "梦幻世界",
    position_x: -8.3,
    position_y: 0,
    position_z: -34.6,
    description: "经典旋转木马，老少皆宜。",
  },
  {
    id: "alice-maze",
    name: "爱丽丝梦游仙境迷宫",
    zone: "梦幻世界",
    position_x: -23.3,
    position_y: 0,
    position_z: -54.4,
    description: "步行探索的园林迷宫，处处皆为爱丽丝故事彩蛋。",
  },
  {
    id: "dumbo",
    name: "小飞象"
    zone: "梦幻世界",
    position_x: -21,
    position_y: 0,
    position_z: -34.1,
    description: "经典飞象旋转骑乘，亲子向温和空中体验。",
  },
  // ===== 宝藏湾 =====
  {
    id: "explorer-canoes",
    name: "探险家独木舟",
    zone: "宝藏湾",
    position_x: -1.3,
    position_y: 0,
    position_z: -46.6,
    description: "游客自助划桨独木舟，环游宝藏湾水域。",
  },
  {
    id: "shipwreck-shore",
    name: "船奇戏水滩",
    zone: "宝藏湾",
    position_x: -1,
    position_y: 0,
    position_z: -58.2,
    description: "开放式戏水互动区，可能湿身的儿童乐园。",
  },
  // ===== 探险岛 =====
  {
    id: "camp-discovery",
    name: "古迹探索营",
    zone: "探险岛",
    position_x: 20.7,
    position_y: 0,
    position_z: -48.2,
    description: "绳索攀爬与悬空步道组成的探险体验区。",
  },
  // ===== 玩具总动园 =====
  {
    id: "slinky-dog-spin",
    name: "弹簧狗团团转",
    zone: "玩具总动园",
    position_x: -44.6,
    position_y: 0,
    position_z: -40.8,
    description: "绕中心旋转的弹簧狗轨道车，温和家庭骑乘。",
  },
  {
    id: "rex-racer",
    name: "抱抱龙冲天赛车",
    zone: "玩具总动园",
    position_x: -49.8,
    position_y: 0,
    position_z: -46.1,
    description: "短程往复式过山车，刺激而老少咸宜。",
  },
  {
    id: "woody-roundup",
    name: "胡迪牛仔嘉年华",
    zone: "玩具总动园",
    position_x: -44.3,
    position_y: 0,
    position_z: -47,
    description: "牛仔主题旋转飞椅，温和的空中体验。",
  },
  // ===== 疯狂动物城 =====
  {
    id: "zootopia-hot-pursuit",
    name: "疯狂动物城：热力追踪",
    zone: "疯狂动物城",
    position_x: -23.9,
    position_y: 0,
    position_z: -74.6,
    description: "疯狂动物城主题黑暗骑乘，跟随朱迪与尼克追凶。",
  },
  // ===== 漫威区域 =====
  {
    id: "marvel-universe",
    name: "漫威英雄总部",
    zone: "漫威区域",
    position_x: -29.5,
    position_y: 0,
    position_z: -30.5,
    description: "漫威英雄主题互动展馆，含拍照与互动体验。",
  },
];

/** 高德 GCJ-02 占位坐标（请按地图精调后配合 geo_reference + apply-geo 工具写回 position_x/z） */
const attractionGcj = [
  { id: "castle", gcj_lat: 31.143558, gcj_lng: 121.659627 },
  { id: "tron", gcj_lat: 31.14328, gcj_lng: 121.65942 },
  { id: "soaring", gcj_lat: 31.144455, gcj_lng: 121.665156 },
  { id: "pirates", gcj_lat: 31.1412, gcj_lng: 121.6591 },
  { id: "thunder", gcj_lat: 31.14297002, gcj_lng: 121.66370633 },
  { id: "pooh", gcj_lat: 31.146022, gcj_lng: 121.658921 },
  { id: "mine", gcj_lat: 31.14563510, gcj_lng: 121.65984598 },
  { id: "buzz", gcj_lat: 31.143, gcj_lng: 121.6588 },
  // 明日世界
  { id: "jet-packs", gcj_lat: 31.14133733, gcj_lng: 121.65878172 },
  { id: "stitch-encounter", gcj_lat: 31.141397212301356, gcj_lng: 121.65820121853078 },
  // 梦幻世界
  { id: "voyage-crystal-grotto", gcj_lat: 31.143651, gcj_lng: 121.658706 },
  { id: "peter-pan", gcj_lat: 31.143511, gcj_lng: 121.657968 },
  { id: "hunny-pot-spin", gcj_lat: 31.145372, gcj_lng: 121.658750 },
  { id: "fantasia-carousel", gcj_lat: 31.142722, gcj_lng: 121.661326 },
  { id: "alice-maze", gcj_lat: 31.144622451445372, gcj_lng: 121.65966126482988 },
  { id: "dumbo", gcj_lat: 31.142681, gcj_lng: 121.659907 },
  // 宝藏湾
  { id: "explorer-canoes", gcj_lat: 31.14386608, gcj_lng: 121.66211427 },
  { id: "shipwreck-shore", gcj_lat: 31.14497496, gcj_lng: 121.66215433 },
  // 探险岛
  { id: "camp-discovery", gcj_lat: 31.14400840, gcj_lng: 121.66457258 },
  // 玩具总动园
  { id: "slinky-dog-spin", gcj_lat: 31.14333252, gcj_lng: 121.65727435 },
  { id: "rex-racer", gcj_lat: 31.14384175, gcj_lng: 121.65669651 },
  { id: "woody-roundup", gcj_lat: 31.14392513, gcj_lng: 121.65731137 },
  // 疯狂动物城
  { id: "zootopia-hot-pursuit", gcj_lat: 31.14655398, gcj_lng: 121.65960567 },
  // 漫威区域（坐标占位，与明日世界相邻）
  { id: "marvel-universe", gcj_lat: 31.14234047, gcj_lng: 121.65895521 },
];

/**
 * 为 attractions 表补齐列（幂等，供 seed 与脚本共用）。
 * @param {import("better-sqlite3").Database} database
 */
export function ensureAttractionsAuxColumns(database) {
  const cols = database.prepare(`PRAGMA table_info(attractions)`).all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("gcj_lat")) database.exec(`ALTER TABLE attractions ADD COLUMN gcj_lat REAL`);
  if (!names.has("gcj_lng")) database.exec(`ALTER TABLE attractions ADD COLUMN gcj_lng REAL`);
  if (!names.has("amap_id")) database.exec(`ALTER TABLE attractions ADD COLUMN amap_id TEXT`);
  if (!names.has("address")) database.exec(`ALTER TABLE attractions ADD COLUMN address TEXT`);
  if (!names.has("poi_type")) database.exec(`ALTER TABLE attractions ADD COLUMN poi_type TEXT`);
  if (!names.has("tel")) database.exec(`ALTER TABLE attractions ADD COLUMN tel TEXT`);
  if (!names.has("source")) database.exec(`ALTER TABLE attractions ADD COLUMN source TEXT`);
}

/** 曾改名/合并的旧 ID → 新 ID 映射；runSeed 时自动清理旧记录 */
const LEGACY_ID_RENAMES = [
  { old: "alice-wonderland-maze", new: "alice-maze" },
];

export function runSeed() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attractions (
      id TEXT PRIMARY KEY,
      name TEXT,
      zone TEXT,
      position_x REAL,
      position_y REAL,
      position_z REAL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS waittimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attraction_id TEXT,
      wait_minutes INTEGER,
      status TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 清理已改名的旧 ID
  const delLegacy = db.prepare(`DELETE FROM attractions WHERE id = ?`);
  for (const r of LEGACY_ID_RENAMES) {
    delLegacy.run(r.old);
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO attractions (id, name, zone, position_x, position_y, position_z, description)
    VALUES (@id, @name, @zone, @position_x, @position_y, @position_z, @description)
  `);

  const tx = db.transaction(() => {
    for (const a of attractions) {
      insert.run(a);
    }
  });
  tx();

  ensureAttractionsAuxColumns(db);
  /** 仅当尚未有 GCJ 时写入占位经纬度，避免覆盖「sync-amap seed」从高德拉取的真实坐标 */
  const upd = db.prepare(`
    UPDATE attractions SET gcj_lat = @gcj_lat, gcj_lng = @gcj_lng
    WHERE id = @id AND gcj_lat IS NULL AND gcj_lng IS NULL
  `);
  const txGcj = db.transaction(() => {
    for (const row of attractionGcj) {
      upd.run(row);
    }
  });
  txGcj();

  runPlannerSchema();
}

// 直接以 `node db/seed.js` 运行时，自动执行 seed
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed();
  console.log("[seed] runSeed completed");
}
