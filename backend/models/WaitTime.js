import { db } from "../db/connection.js";

export function getLatestWaitTimes() {
  return db
    .prepare(
      `
    SELECT w.*
    FROM waittimes w
    JOIN (
      SELECT attraction_id, MAX(recorded_at) AS mx
      FROM waittimes
      GROUP BY attraction_id
    ) q ON w.attraction_id = q.attraction_id AND w.recorded_at = q.mx
    `
    )
    .all();
}

export function insertWaitTime(attractionId, waitMinutes, status) {
  db.prepare(
    `
    INSERT INTO waittimes (attraction_id, wait_minutes, status)
    VALUES (?, ?, ?)
  `
  ).run(attractionId, waitMinutes, status);
}
