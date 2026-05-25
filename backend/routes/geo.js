import { readGeoReferenceFromDisk, latLngToSceneXZ, sceneXZToLatLng } from "../services/geoProject.js";

export function handleGeoReference(req, res) {
  try {
    const ref = readGeoReferenceFromDisk();
    if (!ref) return res.status(404).json({ error: "geo_reference.json missing or invalid" });
    res.json(ref);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function handleGeoProject(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "query lat and lng required (numbers)" });
    }
    const ref = readGeoReferenceFromDisk();
    if (!ref) return res.status(404).json({ error: "geo_reference.json missing or invalid" });
    const { x, z } = latLngToSceneXZ(lat, lng, ref);
    res.json({ x, z, y: 0, lat, lng, crs: "GCJ-02" });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function handleGeoInverse(req, res) {
  try {
    const x = Number(req.query.x);
    const z = Number(req.query.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return res.status(400).json({ error: "query x and z required (numbers)" });
    }
    const ref = readGeoReferenceFromDisk();
    if (!ref) return res.status(404).json({ error: "geo_reference.json missing or invalid" });
    const { lat, lng } = sceneXZToLatLng(x, z, ref);
    res.json({ lat, lng, x, z, crs: "GCJ-02" });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
