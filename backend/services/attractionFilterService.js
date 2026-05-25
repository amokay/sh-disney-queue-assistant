import { getPlannerStep2Config } from "./plannerConfig.js";
import { excludesThrill, isFamilyPlay } from "./goalModes.js";

/**
 * @param {object} prefs session preferences (groupType, childHeightCm, raw, must_play_ids, avoid_ids)
 * @param {Set<string>} doneIds
 */
export function buildCandidatePool(attractions, prefs = {}, doneIds = new Set()) {
  const avoidSet = new Set(prefs.avoid_ids || []);
  const mustSet = new Set(prefs.must_play_ids || []);
  const eligible = [];
  const excluded = [];
  const mustPlayWarnings = [];

  for (const a of attractions) {
    if (doneIds.has(a.id)) {
      excluded.push({ id: a.id, name: a.name, reason: "已完成" });
      continue;
    }
    if (avoidSet.has(a.id)) {
      excluded.push({ id: a.id, name: a.name, reason: "用户不想玩" });
      continue;
    }
    if (a.is_open === 0) {
      excluded.push({ id: a.id, name: a.name, reason: "暂时关闭" });
      continue;
    }
    if (excludesThrill(prefs) && attractionThrillTooHigh(a)) {
      excluded.push({ id: a.id, name: a.name, reason: "已开启「排除刺激」" });
      if (mustSet.has(a.id) && getPlannerStep2Config().height?.warnOnMustPlayConflict) {
        mustPlayWarnings.push({
          id: a.id,
          name: a.name,
          reason: `必玩「${a.name}」与「排除刺激」冲突`,
        });
      }
      continue;
    }
    const height = checkHeight(a, prefs);
    if (!height.ok) {
      excluded.push({ id: a.id, name: a.name, reason: height.reason });
      if (mustSet.has(a.id) && getPlannerStep2Config().height?.warnOnMustPlayConflict) {
        mustPlayWarnings.push({
          id: a.id,
          name: a.name,
          reason: `必玩「${a.name}」不符合身高要求：${height.reason}`,
        });
      }
      continue;
    }
    eligible.push(a);
  }

  return { eligible, excluded, mustPlayWarnings };
}

/**
 * @param {object} attraction
 * @param {object} prefs
 */
function attractionThrillTooHigh(attraction) {
  const level = attraction.thrill_level || "medium";
  return level === "high";
}

export function checkHeight(attraction, prefs) {
  const childH =
    prefs.childHeightCm ??
    prefs.child_height_cm ??
    prefs.raw?.childHeightCm ??
    null;

  if (!isFamilyPlay(prefs) && childH == null) {
    return { ok: true };
  }
  if (childH == null || Number.isNaN(Number(childH))) {
    return { ok: true };
  }
  const min = attraction.min_height_cm ?? 0;
  const h = Number(childH);
  if (h < min) {
    const text = attraction.height_rule_text || `身高需 ${min}cm 以上`;
    return { ok: false, reason: text };
  }
  return { ok: true };
}
