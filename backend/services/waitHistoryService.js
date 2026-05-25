import { db } from "../db/connection.js";

export function ensureWaitSnapshotTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wait_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attraction_id TEXT NOT NULL,
      wait_minutes INTEGER NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wait_snapshots_aid_time
      ON wait_snapshots(attraction_id, recorded_at DESC);
  `);
}

/** 每次排队更新时写入，供机会项检测 */
export function recordWaitSnapshot(attractionId, waitMinutes) {
  ensureWaitSnapshotTable();
  db.prepare(
    `INSERT INTO wait_snapshots (attraction_id, wait_minutes) VALUES (?, ?)`
  ).run(attractionId, waitMinutes);
}

export function recordAllCurrentWaits(waitRows) {
  ensureWaitSnapshotTable();
  const insert = db.prepare(
    `INSERT INTO wait_snapshots (attraction_id, wait_minutes) VALUES (?, ?)`
  );
  const tx = db.transaction(() => {
    for (const w of waitRows) {
      if (typeof w.wait_minutes === "number") {
        insert.run(w.attraction_id, w.wait_minutes);
      }
    }
  });
  tx();
}

/**
 * @param {string} attractionId
 * @param {number} [limit]
 * @returns {{ latest: number, baseline: number, sampleCount: number } | null}
 */
export function getWaitTrend(attractionId, limit = 8) {
  ensureWaitSnapshotTable();
  const rows = db
    .prepare(
      `
    SELECT wait_minutes FROM wait_snapshots
    WHERE attraction_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `
    )
    .all(attractionId, limit);

  if (rows.length < 2) return null;
  const latest = rows[0].wait_minutes;
  const older = rows.slice(1).map((r) => r.wait_minutes);
  const baseline = older.reduce((s, v) => s + v, 0) / older.length;
  return { latest, baseline, sampleCount: rows.length };
}
