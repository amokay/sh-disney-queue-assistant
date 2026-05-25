import { db } from "../db/connection.js";
import { getLatestWaitTimes } from "./WaitTime.js";
import { effectiveWaitMinutes } from "../services/costModel.js";

export function getAllAttractions() {
  return db.prepare("SELECT * FROM attractions ORDER BY name").all();
}

export function getAttractionById(id) {
  return db.prepare("SELECT * FROM attractions WHERE id = ?").get(id);
}

export function getAllAttractionsEnriched() {
  const rows = getAllAttractions();
  const waitRows = getLatestWaitTimes();
  const waitMap = new Map(waitRows.map((w) => [w.attraction_id, w.wait_minutes]));
  return rows.map((a) => {
    const base = waitMap.get(a.id);
    const waitMinutes = typeof base === "number" ? base : 20;
    return {
      ...a,
      waitMinutes,
      effectiveWaitMinutes: effectiveWaitMinutes(waitMinutes),
    };
  });
}

export function getAttractionsMetadata() {
  return getAllAttractionsEnriched().map((a) => ({
    id: a.id,
    name: a.name,
    zone: a.zone,
    description: a.description,
    position: { x: a.position_x, y: a.position_y, z: a.position_z },
    gcj_lat: a.gcj_lat,
    gcj_lng: a.gcj_lng,
    entry_gcj_lat: a.entry_gcj_lat ?? a.gcj_lat,
    entry_gcj_lng: a.entry_gcj_lng ?? a.gcj_lng,
    experience_duration_minutes: a.experience_duration_minutes ?? 20,
    min_height_cm: a.min_height_cm ?? 0,
    max_height_cm: a.max_height_cm,
    height_rule_text: a.height_rule_text,
    thrill_level: a.thrill_level,
    family_friendly: a.family_friendly,
    recommended_for_first_time: a.recommended_for_first_time,
    popularity_level: a.popularity_level,
    single_rider_supported: a.single_rider_supported,
    priority_access_supported: a.priority_access_supported,
    early_entry_supported: a.early_entry_supported,
    is_open: a.is_open ?? 1,
    waitMinutes: a.waitMinutes,
    effectiveWaitMinutes: a.effectiveWaitMinutes,
  }));
}
