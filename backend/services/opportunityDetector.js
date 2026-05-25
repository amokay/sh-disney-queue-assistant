import { getPlannerStep2Config } from "./plannerConfig.js";
import { getWaitTrend } from "./waitHistoryService.js";
import { totalCostMinutesAsync, totalCostMinutes } from "./costModel.js";

/**
 * @param {object[]} eligible attractions with waitMinutes
 * @param {{ position_x: number, position_z: number }} currentPos
 * @param {Set<string>} doneIds
 * @param {string | null} primaryNextId 当前主推荐，机会项可替代
 */
export async function detectOpportunities(eligible, currentPos, doneIds, primaryNextId = null) {
  const cfg = getPlannerStep2Config().opportunity;
  const maxWait = cfg.maxWaitMinutes ?? 45;
  const minDrop = cfg.minDropRatio ?? 0.35;
  const maxWalk = cfg.maxWalkMinutes ?? 12;
  const opportunities = [];

  // 先筛选候选项（避免对所有项做异步计算）
  const candidates = [];
  for (const a of eligible) {
    if (doneIds.has(a.id)) continue;
    if (a.is_open === 0) continue;

    const trend = getWaitTrend(a.id);
    const currentWait = a.waitMinutes ?? 20;
    const latest = trend?.latest ?? currentWait;
    const baseline = trend?.baseline;

    let dropRatio = 0;
    if (baseline && baseline > 0) {
      dropRatio = (baseline - latest) / baseline;
    }

    const suddenDrop =
      trend &&
      trend.sampleCount >= (cfg.minBaselineSamples ?? 2) &&
      dropRatio >= minDrop &&
      latest <= maxWait;

    const absoluteLow = latest <= Math.min(25, maxWait) && (a.popularity_level === "high" || latest <= 20);

    if (!suddenDrop && !absoluteLow) continue;

    candidates.push({ a, latest, baseline, dropRatio, suddenDrop, absoluteLow });
  }

  // 并发计算步行成本
  const costResults = await Promise.allSettled(
    candidates.map((c) => totalCostMinutesAsync(currentPos, c.a, c.latest))
  );

  for (let i = 0; i < candidates.length; i++) {
    const { a, latest, baseline, dropRatio, suddenDrop, absoluteLow } = candidates[i];
    const cost =
      costResults[i].status === "fulfilled"
        ? costResults[i].value
        : totalCostMinutes(currentPos, a, latest);

    if (cost.walkMinutes > maxWalk) continue;

    const canReplacePrimary =
      primaryNextId &&
      primaryNextId !== a.id &&
      (suddenDrop || (absoluteLow && latest + cost.experienceMinutes < 50));

    opportunities.push({
      id: a.id,
      name: a.name,
      zone: a.zone,
      waitMinutes: latest,
      baselineWaitMinutes: baseline ? Math.round(baseline) : null,
      dropRatio: baseline ? Math.round(dropRatio * 100) : null,
      walkMinutes: cost.walkMinutes,
      experienceMinutes: cost.experienceMinutes,
      totalMinutes: cost.totalMinutes,
      reason: suddenDrop
        ? `排队从约 ${Math.round(baseline)} 分钟降到 ${latest} 分钟`
        : `当前排队仅 ${latest} 分钟，适合插队`,
      canReplacePrimary: Boolean(canReplacePrimary),
      position: { x: a.position_x, y: a.position_y, z: a.position_z },
    });
  }

  opportunities.sort((a, b) => {
    const scoreA = (a.dropRatio || 0) + (a.canReplacePrimary ? 50 : 0) - a.walkMinutes;
    const scoreB = (b.dropRatio || 0) + (b.canReplacePrimary ? 50 : 0) - b.walkMinutes;
    return scoreB - scoreA;
  });

  return opportunities.slice(0, 3);
}
