/**
 * mockPredictions.js
 * ═══════════════════
 * 行前模式 mock 预测数据。
 * 包含各热门景点在不同时段（08:00-21:00）的预测排队时间。
 */

// 预测排队时间（分钟），按景点ID × 时段
export const PREDICTED_WAITS = {
  "tron": {
    "08:00": 10, "09:00": 45, "10:00": 75, "11:00": 90,
    "12:00": 80, "13:00": 70, "14:00": 85, "15:00": 95,
    "16:00": 100, "17:00": 90, "18:00": 75, "19:00": 60, "20:00": 45
  },
  "soaring": {
    "08:00": 15, "09:00": 50, "10:00": 80, "11:00": 95,
    "12:00": 85, "13:00": 75, "14:00": 90, "15:00": 100,
    "16:00": 95, "17:00": 85, "18:00": 70, "19:00": 55, "20:00": 40
  },
  "pirates": {
    "08:00": 5, "09:00": 20, "10:00": 35, "11:00": 50,
    "12:00": 45, "13:00": 40, "14:00": 50, "15:00": 55,
    "16:00": 50, "17:00": 45, "18:00": 35, "19:00": 25, "20:00": 15
  },
  "mine": {
    "08:00": 10, "09:00": 40, "10:00": 65, "11:00": 80,
    "12:00": 75, "13:00": 60, "14:00": 70, "15:00": 85,
    "16:00": 80, "17:00": 70, "18:00": 55, "19:00": 40, "20:00": 30
  },
  "thunder": {
    "08:00": 5, "09:00": 30, "10:00": 55, "11:00": 70,
    "12:00": 65, "13:00": 50, "14:00": 60, "15:00": 75,
    "16:00": 70, "17:00": 60, "18:00": 45, "19:00": 35, "20:00": 20
  },
  "rex-racer": {
    "08:00": 5, "09:00": 25, "10:00": 45, "11:00": 60,
    "12:00": 55, "13:00": 45, "14:00": 55, "15:00": 65,
    "16:00": 60, "17:00": 50, "18:00": 40, "19:00": 30, "20:00": 20
  },
  "peter-pan": {
    "08:00": 10, "09:00": 35, "10:00": 55, "11:00": 65,
    "12:00": 60, "13:00": 50, "14:00": 60, "15:00": 70,
    "16:00": 65, "17:00": 55, "18:00": 45, "19:00": 30, "20:00": 20
  },
  "hunny-pot-spin": {
    "08:00": 5, "09:00": 20, "10:00": 35, "11:00": 45,
    "12:00": 40, "13:00": 35, "14:00": 40, "15:00": 50,
    "16:00": 45, "17:00": 40, "18:00": 30, "19:00": 20, "20:00": 10
  },
  "buzz": {
    "08:00": 5, "09:00": 15, "10:00": 25, "11:00": 35,
    "12:00": 30, "13:00": 25, "14:00": 30, "15:00": 35,
    "16:00": 30, "17:00": 25, "18:00": 20, "19:00": 15, "20:00": 10
  },
  "zootopia-hot-pursuit": {
    "08:00": 15, "09:00": 55, "10:00": 85, "11:00": 100,
    "12:00": 90, "13:00": 80, "14:00": 95, "15:00": 105,
    "16:00": 100, "17:00": 90, "18:00": 75, "19:00": 60, "20:00": 45
  },
  "winnie-the-pooh": {
    "08:00": 5, "09:00": 20, "10:00": 40, "11:00": 50,
    "12:00": 45, "13:00": 35, "14:00": 45, "15:00": 55,
    "16:00": 50, "17:00": 40, "18:00": 30, "19:00": 20, "20:00": 10
  },
  "dumbo": {
    "08:00": 5, "09:00": 15, "10:00": 25, "11:00": 35,
    "12:00": 30, "13:00": 25, "14:00": 30, "15:00": 35,
    "16:00": 30, "17:00": 25, "18:00": 20, "19:00": 15, "20:00": 10
  },
  "fantasia-carousel": {
    "08:00": 5, "09:00": 10, "10:00": 15, "11:00": 20,
    "12:00": 15, "13:00": 15, "14:00": 20, "15:00": 25,
    "16:00": 20, "17:00": 15, "18:00": 10, "19:00": 10, "20:00": 5
  },
  "slinky-dog-spin": {
    "08:00": 5, "09:00": 15, "10:00": 30, "11:00": 40,
    "12:00": 35, "13:00": 30, "14:00": 35, "15:00": 45,
    "16:00": 40, "17:00": 35, "18:00": 25, "19:00": 15, "20:00": 10
  },
  "jet-packs": {
    "08:00": 5, "09:00": 15, "10:00": 25, "11:00": 30,
    "12:00": 25, "13:00": 20, "14:00": 25, "15:00": 30,
    "16:00": 25, "17:00": 20, "18:00": 15, "19:00": 10, "20:00": 5
  },
  "crystal-grotto": {
    "08:00": 5, "09:00": 15, "10:00": 25, "11:00": 35,
    "12:00": 30, "13:00": 25, "14:00": 30, "15:00": 35,
    "16:00": 30, "17:00": 25, "18:00": 20, "19:00": 15, "20:00": 10
  },
  "camp-discovery": {
    "08:00": 5, "09:00": 10, "10:00": 15, "11:00": 20,
    "12:00": 15, "13:00": 15, "14:00": 20, "15:00": 20,
    "16:00": 15, "17:00": 15, "18:00": 10, "19:00": 5, "20:00": 5
  },
  "castle": {
    "08:00": 5, "09:00": 10, "10:00": 15, "11:00": 20,
    "12:00": 20, "13:00": 15, "14:00": 20, "15:00": 25,
    "16:00": 25, "17:00": 25, "18:00": 30, "19:00": 30, "20:00": 25
  }
};

// 景点基础信息（mock，用于行前模式渲染）
// ★ position_x/y/z 必须与后端数据库一致，确保3D标签位置正确
export const ATTRACTIONS_MOCK = [
  {
    id: "tron",
    name: "创极速光轮",
    zone: "明日世界",
    description: "全球最快的室内过山车之一",
    position_x: -50.63,
    position_y: 0,
    position_z: -25.0,
    min_height_cm: 122,
    experience_duration_minutes: 3,
    gcj_lat: 31.14328,
    gcj_lng: 121.65942
  },
  {
    id: "soaring",
    name: "翡翔·飞越地平线",
    zone: "探险岛",
    description: "翱翔世界各地的壮丽景观",
    position_x: 25.9,
    position_y: 0,
    position_z: -52.9,
    min_height_cm: 102,
    experience_duration_minutes: 8,
    gcj_lat: 31.144455,
    gcj_lng: 121.665156
  },
  {
    id: "pirates",
    name: "加勒比海盗——沉落宝藏之战",
    zone: "宝藏湾",
    description: "沉浸式海盗冒险之旅",
    position_x: -5.12,
    position_y: 0,
    position_z: -63.94,
    min_height_cm: 0,
    experience_duration_minutes: 12,
    gcj_lat: 31.1412,
    gcj_lng: 121.6591
  },
  {
    id: "mine",
    name: "七个小矮人矿山车",
    zone: "梦幻世界",
    description: "穿越小矮人的钻石矿",
    position_x: -22.72,
    position_y: 0,
    position_z: -59.43,
    min_height_cm: 97,
    experience_duration_minutes: 4,
    gcj_lat: 31.14563510,
    gcj_lng: 121.65984598
  },
  {
    id: "thunder",
    name: "雷鸣山漂流",
    zone: "探险岛",
    description: "激流勇进的漂流体验",
    position_x: 13,
    position_y: 0,
    position_z: -37.3,
    min_height_cm: 107,
    experience_duration_minutes: 15,
    gcj_lat: 31.14297002,
    gcj_lng: 121.66370633
  },
  {
    id: "rex-racer",
    name: "抱抱龙冲天赛车",
    zone: "玩具总动园",
    description: "U形赛道急速冲刺",
    position_x: -49.8,
    position_y: 0,
    position_z: -46.1,
    min_height_cm: 81,
    experience_duration_minutes: 2,
    gcj_lat: 31.14384175,
    gcj_lng: 121.65669651
  },
  {
    id: "peter-pan",
    name: "小飞侠天空奇遇",
    zone: "梦幻世界",
    description: "飞越伦敦夜空的奇妙旅程",
    position_x: -38.4,
    position_y: 0,
    position_z: -42.7,
    min_height_cm: 0,
    experience_duration_minutes: 3,
    gcj_lat: 31.143511,
    gcj_lng: 121.657968
  },
  {
    id: "hunny-pot-spin",
    name: "旋转疯蜜罐",
    zone: "梦幻世界",
    description: "乘坐蜜罐旋转冒险",
    position_x: -31.5,
    position_y: 0,
    position_z: -62.2,
    min_height_cm: 0,
    experience_duration_minutes: 2,
    gcj_lat: 31.145372,
    gcj_lng: 121.658750
  },
  {
    id: "buzz",
    name: "巴斯光年星际营救",
    zone: "明日世界",
    description: "射击太空坏蛋拯救银河系",
    position_x: -41.49,
    position_y: 0,
    position_z: -15.96,
    min_height_cm: 0,
    experience_duration_minutes: 8,
    gcj_lat: 31.143,
    gcj_lng: 121.6588
  },
  {
    id: "zootopia-hot-pursuit",
    name: "疯狂动物城：热力追踪",
    zone: "疯狂动物城",
    description: "与朱迪和尼克一起追踪罪犯",
    position_x: -23.9,
    position_y: 0,
    position_z: -74.6,
    min_height_cm: 102,
    experience_duration_minutes: 5,
    gcj_lat: 31.14655398,
    gcj_lng: 121.65960567
  },
  {
    id: "winnie-the-pooh",
    name: "小熊维尼历险记",
    zone: "梦幻世界",
    description: "跟随小熊维尼进入百亩森林",
    position_x: -30,
    position_y: 0,
    position_z: -69,
    min_height_cm: 0,
    experience_duration_minutes: 4,
    gcj_lat: 31.146022,
    gcj_lng: 121.658921
  },
  {
    id: "dumbo",
    name: "小飞象",
    zone: "梦幻世界",
    description: "乘坐小飞象翱翔天际",
    position_x: -21,
    position_y: 0,
    position_z: -34.1,
    min_height_cm: 0,
    experience_duration_minutes: 2,
    gcj_lat: 31.142681,
    gcj_lng: 121.659907
  },
  {
    id: "fantasia-carousel",
    name: "幻想曲旋转木马",
    zone: "梦幻世界",
    description: "在华丽旋转木马上梦幻骑行",
    position_x: -8.74,
    position_y: 0,
    position_z: -32.85,
    min_height_cm: 0,
    experience_duration_minutes: 3,
    gcj_lat: 31.142722,
    gcj_lng: 121.661326
  },
  {
    id: "slinky-dog-spin",
    name: "弹簧狗团团转",
    zone: "玩具总动园",
    description: "乘坐弹簧狗旋转追逐",
    position_x: -44.6,
    position_y: 0,
    position_z: -40.8,
    min_height_cm: 0,
    experience_duration_minutes: 2,
    gcj_lat: 31.14333252,
    gcj_lng: 121.65727435
  },
  {
    id: "jet-packs",
    name: "喷气背包飞行器",
    zone: "明日世界",
    description: "太空喷气背包旋转飞行",
    position_x: -31,
    position_y: 0,
    position_z: -20,
    min_height_cm: 0,
    experience_duration_minutes: 2,
    gcj_lat: 31.14133733,
    gcj_lng: 121.65878172
  },
  {
    id: "crystal-grotto",
    name: "晶彩奇航",
    zone: "梦幻世界",
    description: "乘船穿越迪士尼经典故事场景",
    position_x: -31.8,
    position_y: 0,
    position_z: -44.2,
    min_height_cm: 0,
    experience_duration_minutes: 8,
    gcj_lat: 31.143651,
    gcj_lng: 121.658706
  },
  {
    id: "camp-discovery",
    name: "古迹探索营",
    zone: "探险岛",
    description: "绳索攀爬探索神秘古迹",
    position_x: 20.7,
    position_y: 0,
    position_z: -48.2,
    min_height_cm: 0,
    experience_duration_minutes: 20,
    gcj_lat: 31.14400840,
    gcj_lng: 121.66457258
  },
  {
    id: "castle",
    name: "奇幻童话城堡",
    zone: "梦幻世界",
    description: "乐园标志性城堡，夜间烟火与灯光秀的重要背景",
    position_x: -23.55,
    position_y: 0,
    position_z: -43.26,
    min_height_cm: 0,
    experience_duration_minutes: 25,
    gcj_lat: 31.143558,
    gcj_lng: 121.659627
  }
];

/**
 * 获取指定时段的预测排队时间。
 * @param {string} timeSlot - 格式 "HH:00"，如 "09:00"
 * @returns {Object} id -> waitMinutes 的映射
 */
export function getPredictedWaitsForSlot(timeSlot) {
  const result = {};
  for (const [id, slots] of Object.entries(PREDICTED_WAITS)) {
    result[id] = slots[timeSlot] ?? null;
  }
  return result;
}

/**
 * 获取当前时间对应的预测排队时间。
 * 自动对齐到最近的整点时段。
 * @returns {Object} id -> { waitMinutes, status }
 */
export function getCurrentPredictedWaits() {
  const now = new Date();
  const hour = now.getHours();
  // 对齐到最近的整点（08:00 - 20:00）
  const clampedHour = Math.max(8, Math.min(20, hour));
  const timeSlot = `${String(clampedHour).padStart(2, "0")}:00`;

  const result = {};
  for (const [id, slots] of Object.entries(PREDICTED_WAITS)) {
    const wm = slots[timeSlot] ?? null;
    result[id] = {
      id,
      waitMinutes: wm,
      status: wm != null ? "open" : "closed"
    };
  }
  return result;
}
