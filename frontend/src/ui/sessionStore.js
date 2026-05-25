const SESSION_KEY = "disney_planner_session_id";
const PREFS_KEY = "disney_planner_prefs_draft";
/** 用户在本机已完成「智能规划」的 session，未标记则每次进入先走偏好采集 */
const READY_KEY = "disney_planner_ready_session";

export function getStoredSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

export function setStoredSessionId(id) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
}

export function savePrefsDraft(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadPrefsDraft() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPrefsDraft() {
  localStorage.removeItem(PREFS_KEY);
}

export function getPlannerReadySessionId() {
  return localStorage.getItem(READY_KEY);
}

export function setPlannerReadySessionId(id) {
  if (id) localStorage.setItem(READY_KEY, id);
  else localStorage.removeItem(READY_KEY);
}

/** 清除 session 与「已规划」标记，便于重新走偏好采集（设计师/测试用） */
export function resetPlannerLocalState() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(READY_KEY);
  localStorage.removeItem(PREFS_KEY);
}
