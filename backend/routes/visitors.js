import { Router } from "express";
import { db } from "../db/connection.js";

const router = Router();

/** 简易 UA → 设备类型解析：mobile / tablet / desktop / unknown */
function parseDeviceType(ua) {
  if (!ua || typeof ua !== "string") return "unknown";
  const s = ua.toLowerCase();
  // tablet 优先：iPad 或 Android 但无 mobile 标识
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/android/.test(s) && !/mobile/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini|windows phone/.test(s)) {
    return "mobile";
  }
  if (/macintosh|windows|linux|cros/.test(s)) return "desktop";
  return "unknown";
}

/** 取真实访客 IP：优先 X-Forwarded-For 首段 */
function pickIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * POST /api/visitors/log
 * 请求体：{ page_path?: string, user_agent?: string }
 * 若未提供 user_agent，则回退使用请求头中的 UA。
 */
router.post("/log", (req, res) => {
  try {
    const body = req.body || {};
    const pagePath =
      typeof body.page_path === "string" && body.page_path.trim()
        ? body.page_path.trim().slice(0, 1024)
        : "";
    const ua =
      (typeof body.user_agent === "string" && body.user_agent.trim()) ||
      req.headers["user-agent"] ||
      "";
    const deviceType = parseDeviceType(ua);
    const ip = pickIp(req);

    const stmt = db.prepare(
      `INSERT INTO visitors (page_path, user_agent, device_type, ip) VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(pagePath, String(ua).slice(0, 1024), deviceType, String(ip).slice(0, 128));

    res.json({ ok: true, id: info.lastInsertRowid, device_type: deviceType });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /api/visitors?page=1&limit=50
 * 按时间倒序返回访客记录及总数，附带独立IP数。
 */
router.get("/", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const total = db.prepare(`SELECT COUNT(*) AS c FROM visitors`).get().c;
    const uniqueIps = db.prepare(`SELECT COUNT(DISTINCT ip) AS c FROM visitors WHERE ip != ''`).get().c;
    const rows = db
      .prepare(
        `SELECT id, visited_at, page_path, user_agent, device_type, ip
         FROM visitors
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset);

    res.json({
      ok: true,
      total,
      uniqueIps,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * GET /api/visitors/stats
 * 返回按 IP 维度的统计：每个 IP 的访问次数、最近访问时间，按次数降序。
 */
router.get("/stats", (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const rows = db
      .prepare(
        `SELECT ip, COUNT(*) AS visit_count, MAX(visited_at) AS last_visit
         FROM visitors
         WHERE ip != ''
         GROUP BY ip
         ORDER BY visit_count DESC
         LIMIT ?`
      )
      .all(limit);

    const uniqueIps = db.prepare(`SELECT COUNT(DISTINCT ip) AS c FROM visitors WHERE ip != ''`).get().c;

    res.json({
      ok: true,
      uniqueIps,
      topIps: rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
