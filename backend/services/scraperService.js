import { getAllAttractions } from "../models/Attraction.js";
import { insertWaitTime } from "../models/WaitTime.js";
import { recordWaitSnapshot } from "./waitHistoryService.js";
import { fetchLiveWaitTimes } from "./themeparksClient.js";

/**
 * 从 themeparks.wiki 获取真实排队时间并写入数据库
 * 失败时降级为 mock
 */
export async function fetchAndStoreWaitTimes() {
  try {
    const liveData = await fetchLiveWaitTimes();

    if (liveData.length === 0) {
      console.warn("[waittimes] API 返回空数据，跳过本轮更新");
      return { source: "skipped", count: 0 };
    }

    for (const { attractionId, waitMinutes, status } of liveData) {
      const wait = waitMinutes ?? 0;
      insertWaitTime(attractionId, wait, status);
      if (status === "ok") {
        recordWaitSnapshot(attractionId, wait);
      }
    }

    const stamp = new Date().toISOString();
    console.log(
      `[${stamp}] [waittimes] 已从 themeparks.wiki 更新 ${liveData.length} 条真实排队数据`
    );
    return { source: "real", count: liveData.length };
  } catch (err) {
    console.error("[waittimes] 真实 API 获取失败，降级为 mock:", err.message);
    mockFetchWaitTimes();
    return { source: "mock", count: 0, error: err.message };
  }
}

/**
 * Mock 降级：随机生成排队数据（仅在 API 完全不可用时使用）
 */
export function mockFetchWaitTimes() {
  const list = getAllAttractions();
  const status = "ok";

  for (const a of list) {
    const wait = Math.floor(Math.random() * (120 - 10 + 1)) + 10;
    insertWaitTime(a.id, wait, status);
    recordWaitSnapshot(a.id, wait);
  }

  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [waittimes] 已写入 mock 排队数据（降级模式）`);
}
