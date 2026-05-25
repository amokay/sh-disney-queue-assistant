import { getWaitTimesWithAttractions } from "../services/waittimeService.js";
import { getMemoryOverrides } from "../services/mockWaitService.js";

export function listWaitTimes(req, res) {
  try {
    const data = getWaitTimesWithAttractions();
    const overrides = getMemoryOverrides();

    // 内存覆盖优先：手动测试场景触发的数据不持久化，仅在响应时合并
    const merged = data.map((item) => {
      const override = overrides.get(item.id);
      if (override) {
        return {
          ...item,
          waitMinutes: override.waitMinutes,
          status: override.status,
        };
      }
      return item;
    });

    res.json(merged);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
