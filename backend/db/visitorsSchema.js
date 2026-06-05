import { db } from "./connection.js";

/**
 * 访客记录表 schema：
 * - id 自增主键
 * - visited_at 服务器写入时间（UTC）
 * - page_path 访问的页面路径
 * - user_agent 浏览器原始 UA 字符串
 * - device_type mobile / tablet / desktop / unknown
 * - ip 访客 IP（取 X-Forwarded-For 首段或 socket 远端地址）
 */
export function runVisitorsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      page_path TEXT,
      user_agent TEXT,
      device_type TEXT,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_visitors_visited_at ON visitors(visited_at DESC);
  `);
}
