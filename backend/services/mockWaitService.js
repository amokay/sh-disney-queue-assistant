import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db/connection.js";
import { recordWaitSnapshot } from "./waitHistoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenariosPath = path.join(__dirname, "..", "config", "planner_mock_scenarios.json");

let activeScenario = "normal";

// 内存层覆盖：手动场景触发的数据存这里，不持久化
const waitOverrides = new Map(); // attractionId -> { waitMinutes, status }

export function listMockScenarios() {
  const doc = JSON.parse(fs.readFileSync(scenariosPath, "utf8"));
  return doc.scenarios;
}

export function getActiveMockScenario() {
  return activeScenario;
}

/**
 * 应用 mock 场景：把场景定义计算后的覆盖值写入内存 Map（不持久化到 DB）。
 * `normal` 场景特殊处理为清空所有覆盖，回到真实数据。
 * @param {string} scenarioKey
 */
export function applyMockScenario(scenarioKey) {
  const doc = JSON.parse(fs.readFileSync(scenariosPath, "utf8"));
  const scenario = doc.scenarios[scenarioKey];
  if (!scenario) throw new Error(`未知 mock 场景: ${scenarioKey}`);

  activeScenario = scenarioKey;

  // normal 场景：清空所有内存覆盖，回到真实数据
  if (scenarioKey === "normal") {
    waitOverrides.clear();
    return { scenarioKey, label: scenario.label, overrides: {}, closedAttractions: [] };
  }

  const overrides = scenario.waitOverrides || {};
  if (scenarioKey === "hot_drop") {
    recordWaitSnapshot("tron", 95);
    recordWaitSnapshot("tron", 88);
  }

  const ids = db.prepare(`SELECT id FROM attractions`).all();
  const closedIds = new Set(scenario.closedAttractions || []);

  // 每次切换场景先清空
  waitOverrides.clear();

  for (const { id } of ids) {
    if (closedIds.has(id)) {
      waitOverrides.set(id, { waitMinutes: 0, status: "closed" });
      continue;
    }

    let wait = 25 + Math.floor(Math.random() * 40);
    if (id === "tron") wait = 90;
    if (id === "mine") wait = 75;
    if (id === "soaring") wait = 60;
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      wait = overrides[id];
    }
    waitOverrides.set(id, { waitMinutes: wait, status: "ok" });
    recordWaitSnapshot(id, wait);
  }

  return { scenarioKey, label: scenario.label, overrides, closedAttractions: [...closedIds] };
}

/** 对外暴露内存覆盖数据，供 waittimesController 合并使用 */
export function getMemoryOverrides() {
  return waitOverrides;
}

/** 真实数据刷新时调用，清除所有手动覆盖 */
export function clearOverrides() {
  waitOverrides.clear();
}
