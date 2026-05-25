import { createSession, saveSessionPreferences } from "../api/session.js";
import { postPretripPlan } from "../api/planner.js";
import { setStoredSessionId, savePrefsDraft, loadPrefsDraft } from "./sessionStore.js";
import { showToast } from "./toast.js";
import { defaultInparkWindow, formatParkDayLabel } from "./parkTimes.js";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** 怎么玩：可多选；亲子会展开身高；排除刺激由后端过滤高刺激项目 */
const PLAY_OPTIONS = [
  { id: "more_rides", label: "尽量多玩" },
  { id: "hot_first", label: "热门优先" },
  { id: "closing_rush", label: "闭园冲刺" },
  { id: "family", label: "亲子玩法" },
  { id: "no_thrill", label: "排除刺激" },
];

const HEIGHT_OPTIONS = [90, 100, 110, 120, 130, 140];

function migrateGoalModes(draft) {
  const modes = new Set();
  if (Array.isArray(draft.goalModes)) {
    draft.goalModes.forEach((id) => modes.add(id));
  }
  if (draft.groupType === "family") modes.add("family");
  if (!modes.size) modes.add("more_rides");
  return modes;
}

function playChipsHtml(activeSet) {
  return PLAY_OPTIONS.map(({ id, label }) => {
    const on = activeSet.has(id);
    return `<button type="button" class="planner-chip planner-chip--play ${on ? "is-on" : ""}" data-play="${esc(id)}">${esc(label)}</button>`;
  }).join("");
}

function heightChipsHtml(activeCm) {
  return HEIGHT_OPTIONS.map((h) => {
    const on = String(h) === String(activeCm);
    return `<button type="button" class="planner-chip ${on ? "is-on" : ""}" data-height="${h}">${h} cm</button>`;
  }).join("");
}

/**
 * 单屏偏好：怎么玩（含亲子/闭园/排除刺激）+ 必玩
 * @param {{ mode: 'pretrip'|'inpark', attractions: object[], onComplete: (payload: object) => void, onBack: () => void, onStepChange?: (step: number, total: number) => void }} opts
 */
export function mountOnboarding(opts) {
  const root = document.createElement("div");
  root.className = "planner-screen planner-screen--onboarding";

  const draft = loadPrefsDraft() || {};
  const autoTime = defaultInparkWindow();
  const state = {
    parkDate: draft.parkDate || autoTime.parkDate,
    entryTime: draft.entryTime || autoTime.entryTime,
    exitTime: draft.exitTime || autoTime.exitTime,
    goalModes: migrateGoalModes(draft),
    mustPlayIds: new Set(draft.mustPlayIds || []),
    childHeightCm: draft.childHeightCm ?? 110,
  };

  function isFamilyPlay() {
    return state.goalModes.has("family");
  }

  function heightOk(a) {
    if (!isFamilyPlay()) return true;
    const h = Number(state.childHeightCm);
    if (Number.isNaN(h)) return true;
    return h >= (a.min_height_cm ?? 0);
  }

  function buildPrefsPayload() {
    const goalModes = [...state.goalModes];
    return {
      parkDate: state.parkDate,
      entryTime: state.entryTime,
      exitTime: state.exitTime,
      goalModes,
      goalMode: goalModes.join(","),
      groupType: isFamilyPlay() ? "family" : undefined,
      mustPlayIds: [...state.mustPlayIds],
      childHeightCm: isFamilyPlay() ? state.childHeightCm : null,
      thrillPreference: state.goalModes.has("no_thrill") ? "mild" : "mixed",
    };
  }

  function renderMain() {
    const timeLine =
      opts.mode === "inpark"
        ? `今天 ${formatParkDayLabel(state.parkDate)} · 入园 ${state.entryTime} · 预计离园 ${state.exitTime}`
        : `${formatParkDayLabel(state.parkDate)} ${state.entryTime} — ${state.exitTime}`;

    const mustChips = (opts.attractions || [])
      .map((a) => {
        const on = state.mustPlayIds.has(a.id);
        const disabled = !heightOk(a);
        return `<button type="button" class="planner-chip ${on ? "is-on" : ""} ${disabled ? "is-disabled" : ""}" data-must="${esc(a.id)}" ${disabled ? "disabled" : ""} title="${disabled ? esc(a.height_rule_text || "身高不符") : ""}">${esc(a.name)}${disabled ? " ⛔" : ""}</button>`;
      })
      .join("");

    return `
      <p class="planner-lead">${opts.mode === "inpark" ? "选好怎么玩后点「智能规划」，将为你推荐下一站并展示路线。" : "选好玩法，生成今日顺序。"}</p>
      <p class="planner-time-badge">${esc(timeLine)}</p>

      <section class="planner-section">
        <h3 class="planner-section-label">怎么玩 <span class="planner-muted">可多选</span></h3>
        <div class="planner-chips planner-chips--play">${playChipsHtml(state.goalModes)}</div>
      </section>

      <section class="planner-section" id="ob-height-section" style="${isFamilyPlay() ? "" : "display:none"}">
        <h3 class="planner-section-label">孩子身高 <span class="planner-muted">亲子玩法</span></h3>
        <div class="planner-chips" id="ob-height-chips">${heightChipsHtml(state.childHeightCm)}</div>
        <p class="planner-muted">灰色必玩为身高不符，不会推荐。</p>
      </section>

      <section class="planner-section">
        <h3 class="planner-section-label">必玩 <span class="planner-muted">可不选</span></h3>
        <div class="planner-chips planner-chips--scroll">${mustChips || "<span class=\"planner-muted\">暂无景点</span>"}</div>
      </section>
    `;
  }

  function render() {
    opts.onStepChange?.(0, 1);
    root.innerHTML = `
      <div class="planner-screen__inner">
        <header class="planner-screen__head planner-screen__head--compact">
          ${opts.onBack ? '<button type="button" class="btn btn--ghost planner-back" id="ob-back">收起</button>' : ""}
          <h1>${opts.mode === "inpark" ? "游玩偏好" : "行前偏好"}</h1>
        </header>
        <div class="planner-screen__body" id="ob-body">${renderMain()}</div>
        <footer class="planner-screen__foot">
          <button type="button" class="btn btn--primary btn--block" id="ob-submit">智能规划</button>
        </footer>
      </div>
    `;
    bindHandlers();
  }

  function refreshMustPlayChips() {
    const wrap = root.querySelector(".planner-chips--scroll");
    if (!wrap) return;
    wrap.innerHTML = (opts.attractions || [])
      .map((a) => {
        const on = state.mustPlayIds.has(a.id);
        const disabled = !heightOk(a);
        return `<button type="button" class="planner-chip ${on ? "is-on" : ""} ${disabled ? "is-disabled" : ""}" data-must="${esc(a.id)}" ${disabled ? "disabled" : ""}">${esc(a.name)}${disabled ? " ⛔" : ""}</button>`;
      })
      .join("") || '<span class="planner-muted">暂无景点</span>';
    wrap.querySelectorAll("[data-must]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-must");
        if (!id || btn.disabled) return;
        if (state.mustPlayIds.has(id)) state.mustPlayIds.delete(id);
        else state.mustPlayIds.add(id);
        btn.classList.toggle("is-on");
      });
    });
  }

  function bindHandlers() {
    root.querySelector("#ob-back")?.addEventListener("click", () => opts.onBack?.());
    root.querySelector("#ob-submit")?.addEventListener("click", () => void onSubmit());

    root.querySelectorAll("[data-play]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-play");
        if (!id) return;
        if (state.goalModes.has(id)) {
          if (state.goalModes.size <= 1) {
            showToast("至少保留一种玩法", "info");
            return;
          }
          state.goalModes.delete(id);
        } else {
          state.goalModes.add(id);
        }
        btn.classList.toggle("is-on", state.goalModes.has(id));
        const heightSec = root.querySelector("#ob-height-section");
        if (heightSec) heightSec.style.display = isFamilyPlay() ? "" : "none";
        refreshMustPlayChips();
      });
    });

    root.querySelectorAll("[data-height]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.childHeightCm = Number(btn.getAttribute("data-height")) || state.childHeightCm;
        root.querySelectorAll("[data-height]").forEach((b) =>
          b.classList.toggle("is-on", b === btn)
        );
        refreshMustPlayChips();
      });
    });

    root.querySelectorAll("[data-must]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-must");
        if (!id || btn.disabled) return;
        if (state.mustPlayIds.has(id)) state.mustPlayIds.delete(id);
        else state.mustPlayIds.add(id);
        btn.classList.toggle("is-on");
      });
    });
  }

  async function onSubmit() {
    if (opts.mode === "inpark") {
      const t = defaultInparkWindow(state.exitTime);
      state.parkDate = t.parkDate;
      state.entryTime = t.entryTime;
    }

    if (isFamilyPlay() && !state.childHeightCm) {
      showToast("请选择孩子身高", "warning");
      return;
    }

    if (state.goalModes.size === 0) {
      showToast("请至少选择一种玩法", "warning");
      return;
    }

    const prefs = buildPrefsPayload();
    savePrefsDraft(prefs);

    const submitBtn = root.querySelector("#ob-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "生成中…";
    }

    try {
      const { session } = await createSession({
        mode: opts.mode,
        parkDate: state.parkDate,
        entryTime: state.entryTime,
        exitTime: state.exitTime,
      });
      const sessionId = session.id;
      setStoredSessionId(sessionId);

      await saveSessionPreferences(sessionId, {
        goalModes: prefs.goalModes,
        goalMode: prefs.goalMode,
        groupType: prefs.groupType,
        thrillPreference: prefs.thrillPreference,
        mustPlayIds: prefs.mustPlayIds,
        maxWaitTolerance: 120,
        childHeightCm: prefs.childHeightCm ?? undefined,
      });

      const { plan } = await postPretripPlan({
        sessionId,
        entryTime: state.entryTime,
        exitTime: state.exitTime,
        mustPlayIds: prefs.mustPlayIds,
        goalModes: prefs.goalModes,
        goalMode: prefs.goalMode,
        groupType: prefs.groupType,
        thrillPreference: prefs.thrillPreference,
        childHeightCm: prefs.childHeightCm ?? undefined,
      });

      localStorage.removeItem("disney_planner_prefs_draft");
      opts.onComplete({ sessionId, plan, mode: opts.mode, prefs });
    } catch (e) {
      showToast(String(e?.message || e), "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "智能规划";
      }
    }
  }

  render();
  return root;
}
