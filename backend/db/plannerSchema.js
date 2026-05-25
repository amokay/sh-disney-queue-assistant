import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./connection.js";
import { ensureAttractionsAuxColumns } from "./seed.js";
import { ensureWaitSnapshotTable } from "../services/waitHistoryService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {import("better-sqlite3").Database} database */
export function ensureAttractionPlannerColumns(database) {
  ensureAttractionsAuxColumns(database);
  const cols = database.prepare(`PRAGMA table_info(attractions)`).all();
  const names = new Set(cols.map((c) => c.name));
  const addCol = (col, sql) => {
    if (!names.has(col)) database.exec(sql);
  };
  addCol("experience_duration_minutes", `ALTER TABLE attractions ADD COLUMN experience_duration_minutes INTEGER`);
  addCol("min_height_cm", `ALTER TABLE attractions ADD COLUMN min_height_cm INTEGER`);
  addCol("max_height_cm", `ALTER TABLE attractions ADD COLUMN max_height_cm INTEGER`);
  addCol("height_rule_text", `ALTER TABLE attractions ADD COLUMN height_rule_text TEXT`);
  addCol("thrill_level", `ALTER TABLE attractions ADD COLUMN thrill_level TEXT`);
  addCol("family_friendly", `ALTER TABLE attractions ADD COLUMN family_friendly INTEGER DEFAULT 1`);
  addCol("recommended_for_first_time", `ALTER TABLE attractions ADD COLUMN recommended_for_first_time INTEGER DEFAULT 0`);
  addCol("popularity_level", `ALTER TABLE attractions ADD COLUMN popularity_level TEXT`);
  addCol("single_rider_supported", `ALTER TABLE attractions ADD COLUMN single_rider_supported INTEGER DEFAULT 0`);
  addCol("priority_access_supported", `ALTER TABLE attractions ADD COLUMN priority_access_supported INTEGER DEFAULT 0`);
  addCol("early_entry_supported", `ALTER TABLE attractions ADD COLUMN early_entry_supported INTEGER DEFAULT 0`);
  addCol("entry_gcj_lat", `ALTER TABLE attractions ADD COLUMN entry_gcj_lat REAL`);
  addCol("entry_gcj_lng", `ALTER TABLE attractions ADD COLUMN entry_gcj_lng REAL`);
  addCol("is_open", `ALTER TABLE attractions ADD COLUMN is_open INTEGER DEFAULT 1`);
}

export function runPlannerSchema() {
  ensureAttractionPlannerColumns(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS planner_sessions (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'pretrip',
      park_date TEXT,
      entry_minutes INTEGER,
      exit_minutes INTEGER,
      plan_version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      current_attraction_id TEXT,
      plan_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_preferences (
      session_id TEXT PRIMARY KEY,
      group_type TEXT,
      thrill_preference TEXT,
      goal_mode TEXT,
      must_play_ids TEXT,
      avoid_ids TEXT,
      max_wait_tolerance INTEGER,
      preferences_json TEXT,
      FOREIGN KEY (session_id) REFERENCES planner_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS session_progress (
      session_id TEXT NOT NULL,
      attraction_id TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (session_id, attraction_id),
      FOREIGN KEY (session_id) REFERENCES planner_sessions(id)
    );
  `);

  ensureSessionLocationColumns(db);
  ensureWaitSnapshotTable();
  seedAttractionMetadataFromFile();
}

/** @param {import("better-sqlite3").Database} database */
function ensureSessionLocationColumns(database) {
  const cols = database.prepare(`PRAGMA table_info(planner_sessions)`).all();
  const names = new Set(cols.map((c) => c.name));
  const add = (col, sql) => {
    if (!names.has(col)) database.exec(sql);
  };
  add("last_gcj_lat", `ALTER TABLE planner_sessions ADD COLUMN last_gcj_lat REAL`);
  add("last_gcj_lng", `ALTER TABLE planner_sessions ADD COLUMN last_gcj_lng REAL`);
  add("last_scene_x", `ALTER TABLE planner_sessions ADD COLUMN last_scene_x REAL`);
  add("last_scene_z", `ALTER TABLE planner_sessions ADD COLUMN last_scene_z REAL`);
  add("last_location_at", `ALTER TABLE planner_sessions ADD COLUMN last_location_at TEXT`);
  add("pinned_next_id", `ALTER TABLE planner_sessions ADD COLUMN pinned_next_id TEXT`);
}

function seedAttractionMetadataFromFile() {
  const filePath = path.join(__dirname, "..", "data", "attraction_metadata.json");
  if (!fs.existsSync(filePath)) return;
  const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const defaults = doc.defaults || {};
  const upd = db.prepare(`
    UPDATE attractions SET
      experience_duration_minutes = COALESCE(@experience_duration_minutes, experience_duration_minutes),
      min_height_cm = COALESCE(@min_height_cm, min_height_cm),
      max_height_cm = COALESCE(@max_height_cm, max_height_cm),
      height_rule_text = COALESCE(@height_rule_text, height_rule_text),
      thrill_level = COALESCE(@thrill_level, thrill_level),
      family_friendly = COALESCE(@family_friendly, family_friendly),
      recommended_for_first_time = COALESCE(@recommended_for_first_time, recommended_for_first_time),
      popularity_level = COALESCE(@popularity_level, popularity_level),
      single_rider_supported = COALESCE(@single_rider_supported, single_rider_supported),
      priority_access_supported = COALESCE(@priority_access_supported, priority_access_supported),
      early_entry_supported = COALESCE(@early_entry_supported, early_entry_supported),
      is_open = COALESCE(@is_open, is_open),
      entry_gcj_lat = COALESCE(@entry_gcj_lat, entry_gcj_lat, gcj_lat),
      entry_gcj_lng = COALESCE(@entry_gcj_lng, entry_gcj_lng, gcj_lng)
    WHERE id = @id
  `);

  const tx = db.transaction(() => {
    for (const [id, meta] of Object.entries(doc.attractions || {})) {
      const row = db.prepare(`SELECT id, gcj_lat, gcj_lng FROM attractions WHERE id = ?`).get(id);
      if (!row) continue;
      upd.run({
        id,
        experience_duration_minutes:
          meta.experience_duration_minutes ?? defaults.experience_duration_minutes ?? 20,
        min_height_cm: meta.min_height_cm ?? 0,
        max_height_cm: meta.max_height_cm ?? null,
        height_rule_text: meta.height_rule_text ?? null,
        thrill_level: meta.thrill_level ?? "medium",
        family_friendly: meta.family_friendly ?? 1,
        recommended_for_first_time: meta.recommended_for_first_time ?? 0,
        popularity_level: meta.popularity_level ?? "medium",
        single_rider_supported: meta.single_rider_supported ?? 0,
        priority_access_supported: meta.priority_access_supported ?? 0,
        early_entry_supported: meta.early_entry_supported ?? 0,
        is_open: meta.is_open ?? defaults.is_open ?? 1,
        entry_gcj_lat: meta.entry_gcj_lat ?? row.gcj_lat,
        entry_gcj_lng: meta.entry_gcj_lng ?? row.gcj_lng,
      });
    }
  });
  tx();
}
