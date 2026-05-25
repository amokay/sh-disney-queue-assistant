#!/usr/bin/env node
/**
 * 根据 frontend/assets/data/geo_reference.json，把 attractions 表里
 * 已填写 gcj_lat / gcj_lng 的行的 position_x、position_z 写回为投影结果（保留 position_y）。
 *
 * 用法：cd backend && npm run apply-geo
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "../services/geoProject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "db", "disney.db");
const geoPath = path.join(__dirname, "..", "..", "frontend", "assets", "data", "geo_reference.json");

const ref = readGeoReferenceFromDisk(geoPath);
if (!ref) {
  console.error("无法读取或解析 geo_reference.json");
  process.exit(1);
}

const db = new Database(dbPath);
const rows = db
  .prepare(
    `SELECT id, gcj_lat, gcj_lng, position_y FROM attractions
     WHERE gcj_lat IS NOT NULL AND gcj_lng IS NOT NULL`
  )
  .all();

if (!rows.length) {
  console.log("没有带 gcj_lat/gcj_lng 的景点，跳过。");
  process.exit(0);
}

const upd = db.prepare(`UPDATE attractions SET position_x = ?, position_z = ? WHERE id = ?`);
const tx = db.transaction(() => {
  for (const r of rows) {
    const { x, z } = latLngToSceneXZ(r.gcj_lat, r.gcj_lng, ref);
    upd.run(x, z, r.id);
    console.log(`${r.id}: (${r.gcj_lat}, ${r.gcj_lng}) -> scene x=${x.toFixed(2)} z=${z.toFixed(2)}`);
  }
});
tx();
console.log(`已更新 ${rows.length} 条 position_x/z。`);
