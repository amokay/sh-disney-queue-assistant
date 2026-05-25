import { API_BASE } from "./base.js";

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function createSession(body) {
  const res = await fetch(`${API_BASE}/api/session/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function saveSessionPreferences(sessionId, preferences) {
  const res = await fetch(`${API_BASE}/api/session/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, ...preferences }),
  });
  return parseJson(res);
}

export async function getSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/session/${encodeURIComponent(sessionId)}`);
  return parseJson(res);
}

export async function markAttractionDone(sessionId, attractionId, status = "done") {
  const res = await fetch(`${API_BASE}/api/session/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, attractionId, status }),
  });
  return parseJson(res);
}

export async function postSessionLocation(sessionId, lat, lng) {
  const res = await fetch(`${API_BASE}/api/session/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, lat, lng }),
  });
  return parseJson(res);
}

export async function setSessionMode(sessionId, mode) {
  const res = await fetch(`${API_BASE}/api/session/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, mode }),
  });
  return parseJson(res);
}
