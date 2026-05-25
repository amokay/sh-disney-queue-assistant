import {
  fetchCurrentState,
  postReplan,
  applyMockScenario,
  fetchMockScenarios,
  postAdoptOpportunity,
} from "../api/planner.js";
import { markAttractionDone, setSessionMode } from "../api/session.js";
import {
  mockLocationAtAttraction,
  simulateCastleLocation,
  showDefaultCastleLocation,
  CASTLE_GEO,
  CASTLE_SCENE,
} from "../geoLocation.js";
import { fetchAttractionsMetadata } from "../api/planner.js";
import { showToast } from "./toast.js";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * @param {{ sessionId: string, plan: object | null, onBack: () => void, onShowRoute: (detail: object) => void }} opts
 */
export function mountInParkGuide(opts) {
  const root = document.createElement("div");
  root.className = "planner-screen planner-screen--inpark";

  let snapshot = null;
  let stopLocation = null;
  let attractionsMeta = [];
  let recommendationsEnabled = false;

  async function refresh() {
    try {
      snapshot = await fetchCurrentState(opts.sessionId);
      renderBody();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    }
  }

  function renderBody() {
    const body = root.querySelector("#ip-body");
    if (!body) return;

    const n = snapshot?.next;
    const done = snapshot?.doneCount ?? 0;
    const vs = snapshot?.visitState;
    const opps = snapshot?.opportunities || [];
    const loc = snapshot?.location;

    if (!n) {
      body.innerHTML = `
        <p class="planner-lead">今日行程已完成或暂无更多推荐。</p>
        <p class="planner-muted">已玩 ${done} 项</p>
        ${renderLocationBar(loc)}
        ${renderMockSection()}
      `;
      bindStaticHandlers();
      publishNextToMap();
      return;
    }

    const oppHtml = opps.length
      ? `<section class="planner-opp-section">
          <h3 class="planner-opp-title">机会项 · 排队变短</h3>
          ${opps
            .map(
              (o) => `
            <div class="planner-opp-card">
              <strong>${esc(o.name)}</strong>
              <p class="planner-muted">${esc(o.reason)} · 步行约 ${o.walkMinutes}′</p>
              <button type="button" class="btn btn--small" data-adopt="${esc(o.id)}">改去这里</button>
            </div>`
            )
            .join("")}
        </section>`
      : "";

    body.innerHTML = `
      ${renderLocationBar(loc, vs)}
      ${snapshot?.offRoute ? `<p class="planner-warn">你似乎在「${esc(snapshot.offRoute.name)}」附近，与当前推荐不一致，已按你的位置重算。</p>` : ""}
      <section class="planner-next-card ${n.isOpportunityPick ? "planner-next-card--opp" : ""}">
        <p class="planner-next-card__label">${n.isOpportunityPick ? "机会项推荐" : "下一站"}</p>
        <h2>${esc(n.name)}</h2>
        <p class="planner-next-card__zone">${esc(n.zone)}</p>
        <div class="planner-reason-box">
          <p class="planner-reason-box__title">推荐理由</p>
          <ul class="planner-reason-list">
            ${(n.reasonLines?.length ? n.reasonLines : [snapshot.reason].filter(Boolean))
              .map((line) => `<li>${esc(line)}</li>`)
              .join("")}
          </ul>
        </div>
        <ul class="planner-cost-list">
          <li>排队 <strong>${n.effectiveWaitMinutes} 分钟</strong></li>
          <li>体验 <strong>${n.experienceMinutes} 分钟</strong></li>
          <li>步行 <strong>${n.walkMinutes} 分钟</strong></li>
          <li>合计 <strong>${n.totalMinutes} 分钟</strong></li>
        </ul>
        ${n.isMustPlay ? '<span class="planner-badge">必玩</span>' : ""}
        <p class="planner-muted planner-map-hint">地图已高亮下一站，并显示从当前位置出发的步行路线</p>
      </section>
      ${oppHtml}
      <div class="planner-inpark-actions">
        <button type="button" class="btn btn--primary" id="ip-done">已玩好，下一个</button>
        <button type="button" class="btn" id="ip-replan">刷新排队并重算</button>
      </div>
      ${renderMockSection()}
    `;

    body.querySelector("#ip-done")?.addEventListener("click", () => void onDone(n.id));
    body.querySelector("#ip-replan")?.addEventListener("click", () => void onReplan());
    body.querySelectorAll("[data-adopt]").forEach((btn) => {
      btn.addEventListener("click", () => void onAdopt(btn.getAttribute("data-adopt")));
    });
    bindStaticHandlers();
    publishNextToMap();
  }

  function publishNextToMap() {
    if (!recommendationsEnabled) return;
    if (!snapshot?.next) {
      window.dispatchEvent(new CustomEvent("inpark-next-updated", { detail: null }));
      return;
    }
    window.dispatchEvent(
      new CustomEvent("inpark-next-updated", {
        detail: {
          next: snapshot.next,
          reason: snapshot.reason,
          location: snapshot.location,
        },
      })
    );
  }

  function renderLocationBar(loc, visitState) {
    const atCastle =
      loc &&
      Math.hypot(loc.scene_x - CASTLE_SCENE.x, loc.scene_z - CASTLE_SCENE.z) < 10;
    const status =
      visitState?.label ||
      (loc
        ? atCastle
          ? `模拟定位 · ${CASTLE_GEO.name}`
          : "定位已更新（地图蓝标为我的位置）"
        : "默认在奇幻童话城堡 · ⇧⌘+单击地图可改位置");
    return `
      <div class="planner-loc-bar">
        <span class="planner-loc-status">${esc(status)}</span>
        <button type="button" class="btn btn--small" id="ip-loc-castle">回城堡</button>
      </div>
      <p class="planner-muted planner-lbs-tip">⇧⌘+单击地图地面 = 设定当前位置（Mac）</p>
      <details class="planner-loc-mock">
        <summary>其它演示位置</summary>
        <div id="ip-loc-mock-btns" class="planner-mock-btns"></div>
      </details>
    `;
  }

  function renderMockSection() {
    return `
      <details class="planner-mock">
        <summary>演示：排队 / 关闭场景</summary>
        <div id="ip-mock-btns" class="planner-mock-btns"></div>
      </details>
    `;
  }

  function bindStaticHandlers() {
    root.querySelector("#ip-loc-castle")?.addEventListener("click", () => void goCastle());
    loadLocMockButtons();
    loadMockButtons();
  }

  async function goCastle() {
    try {
      if (stopLocation) {
        stopLocation();
        stopLocation = null;
      }
      await simulateCastleLocation(opts.sessionId);
      showToast(`已模拟到「${CASTLE_GEO.name}」`, "success");
      window.dispatchEvent(new CustomEvent("focus-user-location"));
      await refresh();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    }
  }

  async function loadLocMockButtons() {
    const wrap = root.querySelector("#ip-loc-mock-btns");
    if (!wrap) return;
    if (!attractionsMeta.length) {
      try {
        attractionsMeta = await fetchAttractionsMetadata();
      } catch {
        wrap.textContent = "无法加载景点";
        return;
      }
    }
    wrap.innerHTML = attractionsMeta
      .slice(0, 6)
      .map(
        (a) =>
          `<button type="button" class="btn btn--small" data-loc="${esc(a.id)}">${esc(a.name)}</button>`
      )
      .join("");
    wrap.querySelectorAll("[data-loc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-loc");
        const a = attractionsMeta.find((x) => x.id === id);
        if (!a) return;
        try {
          await mockLocationAtAttraction(opts.sessionId, a);
          showToast(`已模拟到「${a.name}」`, "success");
          await refresh();
        } catch (e) {
          showToast(String(e?.message || e), "error");
        }
      });
    });
  }

  async function onDone(attractionId) {
    try {
      await markAttractionDone(opts.sessionId, attractionId);
      showToast("已记录完成", "success");
      await refresh();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    }
  }

  async function onReplan() {
    try {
      const res = await postReplan(opts.sessionId);
      snapshot = res.next;
      showToast("已按最新排队重算", "success");
      renderBody();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    }
  }

  async function onAdopt(attractionId) {
    if (!attractionId) return;
    try {
      snapshot = await postAdoptOpportunity(opts.sessionId, attractionId);
      showToast("已切换为机会项推荐", "success");
      renderBody();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    }
  }

  async function loadMockButtons() {
    const wrap = root.querySelector("#ip-mock-btns");
    if (!wrap) return;
    try {
      const { scenarios, active } = await fetchMockScenarios();
      wrap.innerHTML = Object.entries(scenarios || {})
        .map(
          ([key, s]) =>
            `<button type="button" class="btn btn--small ${key === active ? "is-on" : ""}" data-mock="${key}">${esc(s.label)}</button>`
        )
        .join("");
      wrap.querySelectorAll("[data-mock]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await applyMockScenario(btn.getAttribute("data-mock"));
          showToast("已切换场景", "info");
          await onReplan();
        });
      });
    } catch {
      wrap.textContent = "无法加载 mock 场景";
    }
  }

  root.innerHTML = `
    <div class="planner-screen__inner">
      <header class="planner-screen__head">
        <button type="button" class="btn btn--ghost planner-back" id="ip-back">返回</button>
        <h1>行中引导</h1>
      </header>
      <div class="planner-screen__body" id="ip-body"></div>
    </div>
  `;

  root.querySelector("#ip-back")?.addEventListener("click", () => {
    if (stopLocation) stopLocation();
    opts.onBack?.();
  });

  window.addEventListener("lbs-location-set", onLbsMoved);
  function onLbsMoved() {
    void refresh();
  }

  async function start() {
    recommendationsEnabled = true;
    await setSessionMode(opts.sessionId, "inpark");
    await showDefaultCastleLocation();
    try {
      await simulateCastleLocation(opts.sessionId);
    } catch {
      /* session 上报失败时仍保留地图蓝标 */
    }
    await refresh();
  }

  return {
    root,
    refresh,
    start,
    stop: () => {
      recommendationsEnabled = false;
      window.dispatchEvent(new CustomEvent("inpark-next-updated", { detail: null }));
      window.removeEventListener("lbs-location-set", onLbsMoved);
      if (stopLocation) stopLocation();
    },
  };
}
