import { getAllAttractions, getAttractionById } from "../models/Attraction.js";

export function listAttractions(req, res) {
  try {
    res.json(getAllAttractions());
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function getAttraction(req, res) {
  try {
    const row = getAttractionById(req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
