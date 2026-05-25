/**
 * 「怎么玩」可多选（尽量多玩、热门、闭园冲刺、亲子、排除刺激等）
 * @param {object} prefs session.preferences 或请求体
 * @returns {string[]}
 */
export function normalizeGoalModes(prefs = {}) {
  const raw = prefs.raw || {};
  if (Array.isArray(raw.goalModes) && raw.goalModes.length) return raw.goalModes;
  if (Array.isArray(prefs.goalModes) && prefs.goalModes.length) return prefs.goalModes;
  const gm = prefs.goalMode || prefs.goal_mode;
  if (Array.isArray(gm) && gm.length) return gm;
  if (typeof gm === "string" && gm.includes(",")) {
    return gm.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (gm) return [gm];
  return ["more_rides"];
}

export function isFamilyPlay(prefs = {}) {
  if (normalizeGoalModes(prefs).includes("family")) return true;
  const g = prefs.groupType || prefs.group_type || prefs.raw?.groupType;
  return g === "family";
}

export function excludesThrill(prefs = {}) {
  if (normalizeGoalModes(prefs).includes("no_thrill")) return true;
  const t = prefs.thrillPreference || prefs.thrill_preference;
  return t === "mild";
}

/** @param {number} costTotalMinutes */
export function applyGoalScore(score, attraction, costTotalMinutes, goalModes) {
  let s = score;
  if (goalModes.includes("hot_first") && attraction.popularity_level === "high") s += 80;
  if (goalModes.includes("more_rides")) s += 40 / Math.max(1, costTotalMinutes);
  if (goalModes.includes("closing_rush")) {
    s += 55 / Math.max(1, costTotalMinutes);
    if ((attraction.waitMinutes ?? 99) <= 35) s += 25;
  }
  if (goalModes.includes("family") && attraction.family_friendly) s += 45;
  return s;
}
