/**
 * 底部悬浮面板 —— 当前推荐项目
 * 展示待玩项目卡片（横向滑动），包含排队时间与 LBS 距离。
 *
 * @returns {{ dock: HTMLDivElement, setCollapsed: (collapsed: boolean) => void, expand: () => void }}
 */
import { fetchAttractions, fetchWaitTimes } from "./api/attractions.js";
import { fetchAmapWalkingRoute } from "./api/amap.js";
import { waitColorClass } from "./config.js";
import { loadPrefsDraft } from "./ui/sessionStore.js";
import { defaultInparkWindow } from "./ui/parkTimes.js";
import { setRecommendedIds } from "./waitLabels.js";

export function mountPlannerApp() {
  const dock = document.createElement("div");
  dock.id = "planner-dock";
  dock.className = "planner-dock is-open";

  dock.innerHTML = `
    <div class="planner-dock__panel">
      <button type="button" class="planner-dock__handle" id="planner-dock-handle" aria-label="展开或收起面板">
        <span class="planner-dock__handle-bar"></span>
      </button>
      <h2 class="planner-dock__section-title">当前推荐以下项目</h2>
      <div class="recommend__reason" id="recommend-reason">智能路线规划，一样的时间让你玩更多</div>
      <div class="planner-dock__scroll" id="planner-dock-scroll"></div>
      <h2 class="planner-dock__section-title other-attractions__title" id="other-attractions-title" style="display:none">其他项目</h2>
      <div class="other-attractions__scroll" id="other-attractions-scroll"></div>
      <h2 class="planner-dock__section-title">必玩挑战<span class="mustplay__dots" id="mustplay-dots"><span class="mustplay__dot"></span><span class="mustplay__dot"></span><span class="mustplay__dot"></span><span class="mustplay__dot"></span><span class="mustplay__dot"></span><span class="mustplay__dot"></span></span><span class="mustplay__count" id="mustplay-count">0/6</span></h2>
      <div class="planner-dock__mustplay" id="planner-dock-mustplay">
        <div class="mustplay__grid">
          <div class="mustplay__item" data-mustplay-name="创极速光轮"><span class="mustplay__name">创极速光轮</span><span class="mustplay__check">✓</span></div>
          <div class="mustplay__item" data-mustplay-name="加勒比海盗——沉落宝藏之战"><span class="mustplay__name">加勒比海盗——沉落宝藏之战</span><span class="mustplay__check">✓</span></div>
          <div class="mustplay__item" data-mustplay-name="七个小矮人矿山车"><span class="mustplay__name">七个小矮人矿山车</span><span class="mustplay__check">✓</span></div>
          <div class="mustplay__item" data-mustplay-name="热力追踪"><span class="mustplay__name">热力追踪</span><span class="mustplay__check">✓</span></div>
          <div class="mustplay__item" data-mustplay-name="翱翔·飞越地平线"><span class="mustplay__name">翱翔·飞越地平线</span><span class="mustplay__check">✓</span></div>
          <div class="mustplay__item" data-mustplay-name="雷鸣山漂流"><span class="mustplay__name">雷鸣山漂流</span><span class="mustplay__check">✓</span></div>
        </div>
      </div>
      <div class="stats__header">
        <div class="stats__header-left">
          <h2 class="planner-dock__section-title">今日战绩</h2>
          <div class="stats__countdown" id="stats-countdown">距离闭园还有 --:--</div>
        </div>
        <div class="stats__medal" id="stats-medal"></div>
      </div>
      <div class="planner-dock__stats" id="planner-dock-stats">
        <div class="stats__played" id="stats-played">
          <div class="stats__played-summary">今日玩了<span class="stats__played-count" id="stats-played-count">0</span>个项目，共计<span class="stats__played-total" id="stats-played-total">0</span>次，超越了<span class="stats__played-pct" id="stats-played-pct">0</span>%的游客<span class="stats__played-title" id="stats-played-title"></span></div>
          <div class="stats__played-list" id="stats-played-list"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dock);

  // --- 状态 ---
  let attractions = [];
  let allAttractions = []; // 完整景点列表（用于推导"其他项目" = allAttractions - attractions）
  let waitMap = {}; // id -> { waitMinutes, status }
  let userX = null;
  let userZ = null;
  let userLat = null;
  let userLng = null;
  let walkCache = {}; // key: `${userLng},${userLat}_${id}` -> { dist, duration }
  let lastCachedLat = null;
  let lastCachedLng = null;
  // LBS 排序节流：距离上次重排位置超过 50m 才重新执行 rankRecommendations
  let lastRankX = null;
  let lastRankZ = null;
  let refreshTimer = null;
  const playedCounts = new Map(); // id -> 已玩次数
  // 必玩挑战（官方完整名称）
  const mustPlayList = [
    "创极速光轮",
    "加勒比海盗——沉落宝藏之战",
    "七个小矮人矿山车",
    "热力追踪",
    "翱翔·飞越地平线",
    "雷鸣山漂流",
  ];
  const mustPlayDone = new Set(); // 已完成的必玩挑战名称
  let activeCardId = null; // 当前选中卡片的 id，renderCards 后恢复 is-active
  let navActiveForCard = true; // 当前选中卡片的导航是否激活（true=导航中，false=暂停）
  // 手动加入推荐的项目 id 集合（不持久化，刷新页面重置）
  // 仅这部分卡片显示紫色背景与右上角删除按钮，系统自动推荐的初始 3 张维持默认样式。
  const manualRecommendIds = new Set();
  let lastOpportunityIds = new Set(); // 上一次的机会推荐ID
  let appReady = false; // 启动保护期：true 后才允许弹 opportunity toast

  // --- 折叠控制（四档：collapsed / mid / open / full）---
  function setDockState(state) {
    // state: 'collapsed' | 'mid' | 'open' | 'full'
    dock.classList.toggle("is-collapsed", state === "collapsed");
    dock.classList.toggle("is-mid", state === "mid");
    dock.classList.toggle("is-open", state === "open");
    dock.classList.toggle("is-full", state === "full");
  }

  function setCollapsed(collapsed) {
    setDockState(collapsed ? "collapsed" : "open");
  }

  // --- 把手交互：点击切换 + 上拉/下拉手势切换三档 ---
  const handleEl = dock.querySelector("#planner-dock-handle");
  const DRAG_THRESHOLD = 36; // 拖动阈值，避免误触
  let dragState = null;
  let suppressClick = false;

  if (handleEl) {
    handleEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragState = { startY: e.clientY, pointerId: e.pointerId, moved: false };
      try { handleEl.setPointerCapture(e.pointerId); } catch (_) {}
    });

    handleEl.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      if (Math.abs(e.clientY - dragState.startY) > 4) dragState.moved = true;
    });

    const finishDrag = (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      const dy = e.clientY - dragState.startY;
      const exceeded = Math.abs(dy) >= DRAG_THRESHOLD;
      if (exceeded) {
        suppressClick = true; // 拖动达到阈值后抑制随后的 click
        const cls = dock.classList;
        if (dy < 0) {
          // 上拉：collapsed → open → full
          if (cls.contains("is-collapsed")) setDockState("open");
          else if (cls.contains("is-open")) setDockState("full");
        } else {
          // 下拉：full → open → collapsed
          if (cls.contains("is-full")) setDockState("open");
          else if (cls.contains("is-open")) setDockState("collapsed");
        }
      }
      try { handleEl.releasePointerCapture(e.pointerId); } catch (_) {}
      dragState = null;
    };

    handleEl.addEventListener("pointerup", finishDrag);
    handleEl.addEventListener("pointercancel", finishDrag);

    handleEl.addEventListener("click", (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // 点击：在 collapsed 与 open 之间切换（full 状态点击直接收起）
      setCollapsed(!dock.classList.contains("is-collapsed"));
    });
  }

  // 判断当前是否闭园时段（上海 UTC+8：>=21:00 或 <08:00）
  function isParkClosed() {
    const h = new Date().getHours();
    return h >= 21 || h < 8;
  }

  /**
   * 闭园文案：21:00-23:59 显示「明日开园」，00:00-07:59 显示「今日开园」。
   * 上海迪士尼开园时间固定为 08:00。
   */
  function getClosedText() {
    const h = new Date().getHours();
    const prefix = h >= 21 ? "明日开园" : "今日开园";
    return `今日已闭园 ${prefix} 08:00`;
  }

  // --- 渲染卡片 ---
  // 渲染 attractions（当前推荐的前 3 个项目）
  function renderCards() {
    // 同步「当前推荐项目」 id 到 wait-marker，
    // 以便 wait-marker 在已推荐的项目上隐藏「加入推荐」按钮。
    setRecommendedIds(attractions.map((a) => a.id));

    const container = dock.querySelector("#planner-dock-scroll");
    if (!container) return;

    if (attractions.length === 0) {
      container.innerHTML = `<span style="color:rgba(255,255,255,0.45);font-size:12px;">加载中…</span>`;
      return;
    }

    const displayList = attractions;
    container.innerHTML = displayList
      .map((a, i) => {
        const wait = waitMap[a.id];
        const wm = wait?.waitMinutes;
        const waitCls = waitColorClass(wm);
        const isClosed = wait?.status === "closed";
        const parkClosed = isParkClosed();
        const waitText = parkClosed ? getClosedText() : isClosed ? "暂停开放" : (wm == null ? "等待时长：—" : `等待时长：${wm} 分钟`);
        const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
        const distLabel = getDistLabel(a);
        const isPlayed = playedCounts.has(a.id);
        const playedNum = playedCounts.get(a.id) || 0;
        const nextTagStyle = isPlayed ? ' style="display:none"' : '';
        const playedTagStyle = isPlayed ? '' : ' style="display:none"';
        const playedText = isPlayed ? `已玩${playedNum}次` : '';
        // 暂停开放且未玩过：将「待玩」标签替换为「暂停开放」（红色样式）
        const nextTagText = isClosed ? '暂停开放' : '待玩';
        const nextTagCls = isClosed ? 'planner-dock__card-next is-closed' : 'planner-dock__card-next';
        // 手动加入推荐的卡片：附加 is-manual-recommend 类（用于紫色背景）并渲染删除按钮；
        // 系统自动推荐的卡片：默认背景，无删除按钮。
        const isManual = manualRecommendIds.has(String(a.id));
        const manualCls = isManual ? ' is-manual-recommend' : '';
        const removeBtnHtml = isManual ? '<span class="detail__card-remove" data-action="remove-card">&times;</span>' : '';
        return `
          <div class="detail__card${manualCls}" data-id="${a.id}">
            ${removeBtnHtml}
            <div class="detail__title">${a.name || ''}<span class="${nextTagCls}"${nextTagStyle}>${nextTagText}</span><span class="detail__played-count"${playedTagStyle}>${playedText}</span></div>
            <div class="detail__zone">${a.zone || ''}</div>
            <div class="detail__wait ${waitDisplayCls}${isClosed ? ' is-closed' : ''}">${waitText}</div>
            <div class="detail__dist planner-dock__card-dist">${distLabel}</div>
            <div class="detail__actions">
              <button type="button" class="btn btn--primary" data-action="navigate">开始导航</button>
              <button type="button" class="btn btn--secondary" data-action="mark-done">已玩过</button>
            </div>
          </div>`;
      })
      .join("");

    // 恢复选中卡片的 is-active 状态（renderCards 完全替换 DOM，需手动恢复）
    if (activeCardId) {
      const activeCard = container.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard) {
        activeCard.classList.add("is-active");
        const btn = activeCard.querySelector("[data-action=navigate]");
        if (btn) {
          if (navActiveForCard) {
            btn.classList.add("is-navigating");
            btn.textContent = "导航中";
          } else {
            btn.classList.remove("is-navigating");
            btn.textContent = "开始导航";
          }
        }
      }
    }

    // 先渲染直线距离，再异步覆盖为步行距离
    updateWalkDistances();

    // 同步副标题文案
    updateRecommendReason();
  }

  // --- 渲染"其他项目"卡片 ---
  // 数据 = allAttractions - attractions（排除当前推荐区展示的全部项目）
  // 卡片复用 .detail__card 基础样式，外加 .other-attractions__card 用于宽度收窄
  function renderOtherCards() {
    const container = dock.querySelector("#other-attractions-scroll");
    const titleEl = dock.querySelector("#other-attractions-title");
    if (!container) return;

    // 排除当前推荐区域展示的全部项目（前 3 个）
    const displayedIds = new Set(attractions.map((a) => String(a.id)));
    const others = allAttractions.filter((a) => !displayedIds.has(String(a.id)));

    if (others.length === 0) {
      container.innerHTML = "";
      if (titleEl) titleEl.style.display = "none";
      return;
    }
    if (titleEl) titleEl.style.display = "";

    container.innerHTML = others
      .map((a) => {
        const wait = waitMap[a.id];
        const wm = wait?.waitMinutes;
        const waitCls = waitColorClass(wm);
        const isClosed = wait?.status === "closed";
        const parkClosed = isParkClosed();
        const waitText = parkClosed ? getClosedText() : isClosed ? "暂停开放" : (wm == null ? "等待时长：—" : `等待时长：${wm} 分钟`);
        const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
        const isPlayed = playedCounts.has(a.id);
        const playedNum = playedCounts.get(a.id) || 0;
        const nextTagStyle = isPlayed ? ' style="display:none"' : '';
        const playedTagStyle = isPlayed ? '' : ' style="display:none"';
        const playedText = isPlayed ? `已玩${playedNum}次` : '';
        // 暂停开放且未玩过：将「待玩」标签替换为「暂停开放」（红色样式）；
        // 已玩优先级更高，仍展示「已玩N次」。
        const nextTagText = isClosed ? '暂停开放' : '待玩';
        const nextTagCls = isClosed ? 'planner-dock__card-next is-closed' : 'planner-dock__card-next';
        return `
          <div class="detail__card other-attractions__card" data-id="${a.id}">
            <div class="detail__title">${a.name || ''}<span class="${nextTagCls}"${nextTagStyle}>${nextTagText}</span><span class="detail__played-count"${playedTagStyle}>${playedText}</span></div>
            <div class="detail__zone">${a.zone || ''}</div>
            <div class="detail__wait ${waitDisplayCls}${isClosed ? ' is-closed' : ''}">${waitText}</div>
            <div class="detail__actions">
              <button type="button" class="btn btn--primary" data-action="add-recommend">加入推荐</button>
              <button type="button" class="btn btn--secondary" data-action="mark-done">已玩过</button>
            </div>
          </div>`;
      })
      .join("");

    // 恢复"其他"区域选中态（若 activeCardId 命中其中一张）
    // 但如果该卡片已完成（is-done），则不恢复选中态
    if (activeCardId) {
      const activeCard = container.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard && !playedCounts.has(activeCardId)) {
        activeCard.classList.add("is-active");
        const btn = activeCard.querySelector("[data-action=navigate]");
        if (btn) {
          if (navActiveForCard) {
            btn.classList.add("is-navigating");
            btn.textContent = "导航中";
          } else {
            btn.classList.remove("is-navigating");
            btn.textContent = "开始导航";
          }
        }
      }
    }

    updateWalkDistances();
  }

  // --- 必玩挑战模块：检查并高亮 ---
  // 用景点 name / name_cn 与 mustPlayList 做包含式模糊匹配，
  // 命中即加入 mustPlayDone 并更新 UI（item 高亮 + 进度文字）。
  function checkMustPlayMatch(attractionId) {
    const a = attractions.find((x) => String(x.id) === String(attractionId));
    if (!a) return;
    const candidates = [a.name, a.name_cn].filter(Boolean);
    for (const must of mustPlayList) {
      if (mustPlayDone.has(must)) continue;
      const hit = candidates.some((c) => c.includes(must) || must.includes(c));
      if (hit) {
        mustPlayDone.add(must);
        const item = dock.querySelector(
          `.mustplay__item[data-mustplay-name="${must}"]`
        );
        if (item) item.classList.add("is-done");
      }
    }
    const dots = dock.querySelectorAll("#mustplay-dots .mustplay__dot");
    const doneCount = mustPlayDone.size;
    dots.forEach((dot, idx) => {
      dot.classList.toggle("is-done", idx < doneCount);
    });
    // 同步更新 x/6 计数文案；达成 6/6 时切换为「挑战成功」并应用紫色加粗高亮
    const countEl = dock.querySelector("#mustplay-count");
    if (countEl) {
      if (doneCount >= 6) {
        countEl.textContent = "挑战成功";
        countEl.style.color = "rgba(139, 92, 246, 1)";
        countEl.style.fontWeight = "700";
      } else {
        countEl.textContent = `${doneCount}/6`;
        countEl.style.color = "rgba(255, 255, 255, 0.6)";
        countEl.style.fontWeight = "";
      }
    }
  }

  // 数据加载后根据已有 playedCounts 同步必玩状态（覆盖刷新场景）
  function syncMustPlayFromPlayed() {
    for (const id of playedCounts.keys()) checkMustPlayMatch(id);
  }

  // --- 今日战绩：已玩统计 + 加权排名 ---
  // 已玩项目数 = playedCounts.size（去重）
  // 总次数 = playedCounts 所有 value 之和
  // 加权得分：必玩挑战 ×3，普通项目 ×1
  // 排名百分比：sigmoid 拟合（0.3 斜率，8 次中点），上限 99%
  function updateStats() {
    const playedSet = playedCounts.size;
    let totalCount = 0;
    let score = 0;
    for (const [id, count] of playedCounts.entries()) {
      totalCount += count;
      const a = attractions.find((x) => String(x.id) === String(id));
      const candidates = a ? [a.name, a.name_cn].filter(Boolean) : [];
      const isMust = candidates.some((c) =>
        mustPlayList.some((m) => c.includes(m) || m.includes(c))
      );
      score += count * (isMust ? 3 : 1);
    }
    const pct = Math.min(99, Math.floor(100 / (1 + Math.exp(-0.3 * (score - 8)))));

    const elPlayed = dock.querySelector("#stats-played-count");
    const elTotal = dock.querySelector("#stats-played-total");
    const elList = dock.querySelector("#stats-played-list");
    const elPct = dock.querySelector("#stats-played-pct");
    const elTitle = dock.querySelector("#stats-played-title");
    const elMedal = dock.querySelector("#stats-medal");
    const elSummary = dock.querySelector(".stats__played-summary");

    // 空状态：未玩过任何项目时，仅展示一句提示，隐藏列表/汇总等所有数据内容
    const elPlayedWrap = dock.querySelector("#stats-played");
    let elEmpty = dock.querySelector(".stats__empty");
    if (!elEmpty && elPlayedWrap) {
      elEmpty = document.createElement("div");
      elEmpty.className = "stats__empty";
      elEmpty.textContent = "今天还没玩任何项目呢";
      elPlayedWrap.insertBefore(elEmpty, elPlayedWrap.firstChild);
    }
    const isEmpty = playedSet === 0;
    if (elEmpty) elEmpty.style.display = isEmpty ? "" : "none";
    if (elList) elList.style.display = isEmpty ? "none" : "";
    // 未玩过任何项目时，隐藏"超越 XX% 的游客"整句
    if (elSummary) elSummary.style.display = isEmpty ? "none" : "";
    if (elMedal) elMedal.style.display = isEmpty ? "none" : "";
    if (elPlayed) elPlayed.textContent = String(playedSet);
    if (elTotal) elTotal.textContent = String(totalCount);
    if (elList) {
      const items = [];
      for (const [id, count] of playedCounts.entries()) {
        const a = allAttractions.find((x) => String(x.id) === String(id));
        const name = a ? (a.name_cn || a.name) : null;
        if (!name) continue;
        items.push(count > 1 ? `${name}×${count}` : name);
      }
      elList.textContent = items.join("、");
    }
    if (elPct) elPct.textContent = String(pct);

    // 排名称号：根据百分比追加在 summary 文末（纯文字，不含 emoji）
    if (elTitle) {
      let title = "";
      if (pct >= 99) title = "迪士尼之王";
      else if (pct >= 90) title = "传说中的勇者";
      else if (pct >= 80) title = "迪士尼特种兵";
      else if (pct >= 70) title = "迪士尼玩家";
      else if (pct >= 60) title = "游园达人";
      else if (pct >= 50) title = "初来乍到";
      elTitle.textContent = title;
    }

    // 奖牌徽章：根据百分比展示金/银/铜（纯 SVG 绘制，含丝带 + 渐变 + 内圈装饰）
    if (elMedal) {
      elMedal.innerHTML = buildMedalSvg(pct);
      elMedal.classList.toggle("is-gold", pct >= 95);
    }
  }

  /**
   * 构造金/银/铜奖牌 SVG。pct < 60 返回空字符串。
   * 同一时间仅渲染一个奖牌，gradient id 互不重叠以防其它 SVG 引用。
   */
  function buildMedalSvg(pct) {
    let tier = null;
    if (pct >= 95) tier = "gold";
    else if (pct >= 80) tier = "silver";
    else if (pct >= 60) tier = "bronze";
    if (!tier) return "";

    const palette = {
      gold:   { top: "#FFD700", bottom: "#DAA520", border: "#B8860B", ribbon: "#B8860B", label: "金" },
      silver: { top: "#E8E8E8", bottom: "#A8A8A8", border: "#808080", ribbon: "#808080", label: "银" },
      bronze: { top: "#CD7F32", bottom: "#A0522D", border: "#8B4513", ribbon: "#8B4513", label: "铜" },
    }[tier];
    const gradId = `stats-medal-grad-${tier}`;
    const filter = tier === "gold"
      ? ' style="filter: drop-shadow(0 0 4px rgba(255,215,0,0.6));"'
      : '';
    return `
      <svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg"${filter}>
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${palette.top}"/>
            <stop offset="100%" stop-color="${palette.bottom}"/>
          </linearGradient>
        </defs>
        <path d="M9 0 L7 18 L14 14 L18 18 L22 14 L29 18 L27 0 Z" fill="${palette.ribbon}" opacity="0.85"/>
        <circle cx="18" cy="28" r="14" fill="url(#${gradId})" stroke="${palette.border}" stroke-width="2"/>
        <circle cx="18" cy="28" r="11" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.5"/>
        <circle cx="14" cy="24" r="3" fill="rgba(255,255,255,0.25)"/>
        <text x="18" y="32" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="-apple-system, 'PingFang SC', sans-serif">${palette.label}</text>
      </svg>
    `;
  }

  // --- 闭园倒计时 ---
  // 闭园时间硬编码为上海迪士尼乐园标准闭园时间 21:00
  function updateCountdown() {
    const elCd = dock.querySelector("#stats-countdown");
    if (!elCd) return;
    const now = new Date();
    const close = new Date(now);
    close.setHours(21, 0, 0, 0);
    const diff = close.getTime() - now.getTime();
    if (diff <= 0) {
      elCd.textContent = getClosedText();
      return;
    }
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    elCd.textContent = `距离闭园还有 ${hours}h ${mins}min`;
  }

  function getDistLabel(a) {
    if (userX == null || userZ == null) return "距离计算中…";
    const px = a.position_x ?? 0;
    const pz = a.position_z ?? 0;
    const dist = Math.hypot(px - userX, pz - userZ); // 场景单位 ≈ 1m
    if (dist < 1000) return `${Math.round(dist)}m`;
    return `${(dist / 1000).toFixed(1)}km`;
  }

  // 拍照/互动体验类项目 ID 列表（非核心游乐项目，对游客时间利用效率贡献较低，需降权）
  const PHOTO_EXPERIENCE_IDS = ['marvel-universe'];

  // --- 智能推荐评分 ---
  // 综合步行时间、排队时长、体验时长的效率分，叠加未完成必玩项目加权。
  function calcScore(a) {
    // 步行时间估算
    let walkMin = 5; // 默认值（用户位置未知时）
    if (userX != null && userZ != null) {
      const dist = Math.hypot((a.position_x ?? 0) - userX, (a.position_z ?? 0) - userZ);
      walkMin = dist / 80; // ~80m/min 步速
    }

    // 排队时长
    const w = waitMap[a.id];
    const waitMin = (w && w.waitMinutes != null) ? w.waitMinutes : 30;

    // 体验时长
    const expMin = a.experience_duration_minutes || 20;

    // 效率分（耗时越短分越高）
    // 排队权重 ×2（降低排队时间的绝对统治力，让 15-20min 排队的优质项目有竞争力）
    // 步行权重 ×1（公园内步行极短，不应过度惩罚稍远的优质项目）
    // 体验时长保持 ×1
    const weightedTime = walkMin * 1 + waitMin * 2 + expMin;
    const efficiency = 1000 / Math.max(1, weightedTime);

    // 必玩加权：基于时间压力的条件触发
    const name = a.name || '';
    const matchedMust = mustPlayList.find((m) => name.includes(m) || m.includes(name));

    // 时间压力：距离闭园(21:00)剩余分钟数
    const now = new Date();
    const close = new Date(now);
    close.setHours(21, 0, 0, 0);
    const remainMin = Math.max(0, (close.getTime() - now.getTime()) / 60000);

    // 未玩必玩项目数
    const unplayedMustCount = mustPlayList.filter(m => !mustPlayDone.has(m)).length;

    // 条件化必玩加分：
    // - 剩余 > 120 分钟：不加分，让效率和距离决定优先级
    // - 剩余 60-120 分钟且未玩 >= 2：适度加分(60)，必玩有优势但不碾压近距离低排队项目
    // - 剩余 < 60 分钟且未玩 >= 1：强推必玩(150)，紧迫时确保必玩完成
    let mustBonus = 0;
    if (matchedMust && !mustPlayDone.has(matchedMust) && unplayedMustCount >= 1) {
      if (remainMin <= 60) {
        // 紧迫：强推必玩
        mustBonus = 150;
      } else if (remainMin <= 120 && unplayedMustCount >= 2) {
        // 中等压力：适度加分
        mustBonus = 60;
      } else {
        // 剩余时间充裕(>120分钟)：小加分(20)，给必玩项目轻微优先级信号
        mustBonus = 20;
      }
    }

    // 机会加分：必玩项目排队极短时额外加权
    const isMustPlay = !!matchedMust;
    const w2 = waitMap[a.id];
    const waitMin2 = (w2 && w2.waitMinutes != null) ? w2.waitMinutes : 30;
    const opportunityBonus = (isMustPlay && waitMin2 <= 15) ? 200 : 0;

    // 近距离加分：距离越近加分越高，鼓励就近体验
    // dist < 12 场景单位(~130m): +60
    // dist < 25 场景单位(~260m): +30
    // dist >= 25: 无加分
    const proximityDist = walkMin * 80;
    const proximityBonus = proximityDist < 12 ? 60 : proximityDist < 25 ? 30 : 0;

    // 拍照/互动体验类项目降权：此类项目不属于核心游乐项目，
    // 对游客时间利用效率贡献较低，最终得分乘以折扣系数以降低排名优先级
    const isPhotoExp = PHOTO_EXPERIENCE_IDS.includes(a.id);
    const photoDiscount = isPhotoExp ? 0.3 : 1;

    return (efficiency + mustBonus + opportunityBonus + proximityBonus) * photoDiscount;
  }

  // --- 智能推荐排序：手动优先 + 评分自动补足 + 保底 ---
  function rankRecommendations() {
    // 1. 收集手动推荐项目（始终保留）
    const manualItems = [];
    const manualIdSet = new Set(manualRecommendIds);
    for (const id of manualIdSet) {
      const item = allAttractions.find((a) => String(a.id) === id);
      if (item) manualItems.push(item);
    }

    // 2. 候选池：排除已玩、已关闭、已手动推荐的项目
    const candidates = allAttractions.filter((a) => {
      if (playedCounts.has(a.id)) return false;
      if (manualIdSet.has(String(a.id))) return false;
      const w = waitMap[a.id];
      if (w?.status === 'closed') return false;
      return true;
    });

    // 机会推荐：必玩项目排队极短(≤15分钟)，即使已玩过也可再次推荐
    const opportunityThreshold = 15;
    const opportunityItems = allAttractions.filter(a => {
      const name = a.name || '';
      const isMustPlay = mustPlayList.some(m => name.includes(m) || m.includes(name));
      if (!isMustPlay) return false;
      const w = waitMap[a.id];
      if (!w || w.status === 'closed') return false;
      if (w.waitMinutes == null || w.waitMinutes > opportunityThreshold) return false;
      if (manualIdSet.has(String(a.id))) return false;
      // 避免与常规候选重复
      if (candidates.some(c => String(c.id) === String(a.id))) return false;
      return true;
    });

    // 合并候选池
    const allCandidates = [...candidates, ...opportunityItems];

    // 3. 评分排序
    const scored = allCandidates.map((a) => ({ attraction: a, score: calcScore(a) }));
    scored.sort((a, b) => b.score - a.score);

    // 4. 取 top N（扣除手动推荐占用的名额）
    const autoSlots = Math.max(0, 5 - manualItems.length);
    const autoItems = scored.slice(0, autoSlots).map((s) => s.attraction);

    // 5. 合并：手动推荐 + 自动推荐
    let result = [...manualItems, ...autoItems];

    // 6. 保底：至少 1 个未关闭项目
    if (result.length === 0) {
      const fallback = allAttractions
        .filter((a) => waitMap[a.id]?.status !== 'closed')
        .sort((a, b) => calcScore(b) - calcScore(a));
      if (fallback.length > 0) result = [fallback[0]];
    }

    // 检测新出现的机会推荐项目
    const currentOpportunityIds = new Set(
      result.filter(a => {
        const name = a.name || '';
        const isMustPlay = mustPlayList.some(m => name.includes(m) || m.includes(name));
        if (!isMustPlay) return false;
        const w = waitMap[a.id];
        return w && w.status !== 'closed' && w.waitMinutes != null && w.waitMinutes <= 15;
      }).map(a => String(a.id))
    );

    // 启动保护期 或 闭园时段：仅更新基线，不弹 toast
    if (appReady && !isParkClosed()) {
      // 找出新出现的（之前不在机会推荐中的）
      for (const id of currentOpportunityIds) {
        if (!lastOpportunityIds.has(id)) {
          const item = result.find(a => String(a.id) === id);
          if (item) {
            const w = waitMap[item.id];
            showOpportunityToast(item.name, w?.waitMinutes ?? 0);
          }
        }
      }
    }
    lastOpportunityIds = currentOpportunityIds;

    return result;
  }

  function showOpportunityToast(name, waitMinutes) {
    // 移除已有的 toast（避免堆叠）
    const existing = document.querySelector('.opportunity-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'opportunity-toast';
    toast.innerHTML = `
      <div class="opportunity-toast__icon">🎉</div>
      <div class="opportunity-toast__content">
        <div class="opportunity-toast__title">${name}</div>
        <div class="opportunity-toast__desc">仅需${waitMinutes}分钟排队，难得机会！</div>
      </div>
    `;
    document.body.appendChild(toast);

    // 触发滑入动画（需要一帧延迟让浏览器先渲染初始状态）
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    // 5秒后自动滑出消失
    setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 5000);
  }

  // --- 推荐区副标题文案 ---
  // 推荐数量充足时鼓励效率，剩余不足时切换为收尾文案。
  function updateRecommendReason() {
    const el = dock.querySelector("#recommend-reason");
    if (!el) return;
    if (attractions.length >= 3) {
      el.textContent = "智能路线规划，一样的时间让你玩更多";
    } else if (attractions.length > 0) {
      el.textContent = "已完成大部分项目，继续加油";
    }
  }

  // --- 步行距离异步更新 ---
  async function updateWalkDistances() {
    if (userLat == null || userLng == null) return;
    const origin = `${userLng},${userLat}`; // 高德格式：经度,纬度

    const list = allAttractions.length ? allAttractions : attractions;
    for (const a of list) {
      const destLat = a.entry_gcj_lat || a.gcj_lat;
      const destLng = a.entry_gcj_lng || a.gcj_lng;
      if (!destLat || !destLng) continue;

      const cacheKey = `${origin}_${a.id}`;
      if (walkCache[cacheKey]) {
        applyWalkLabel(a.id, walkCache[cacheKey]);
        continue;
      }

      try {
        const dest = `${destLng},${destLat}`;
        const data = await fetchAmapWalkingRoute(origin, dest);
        const path = data?.route?.paths?.[0];
        if (path) {
          const info = { dist: Number(path.distance), duration: Number(path.duration) };
          walkCache[cacheKey] = info;
          applyWalkLabel(a.id, info);
        }
      } catch (_) {
        // 失败时保持直线距离显示
      }
    }
  }

  function applyWalkLabel(id, info) {
    const els = dock.querySelectorAll(`.detail__card[data-id="${id}"] .planner-dock__card-dist`);
    if (!els.length) return;
    const distStr = info.dist < 1000 ? `${Math.round(info.dist)}m` : `${(info.dist / 1000).toFixed(1)}km`;
    const minStr = Math.ceil(info.duration / 60);
    const text = `${distStr}｜步行${minStr}分钟`;
    els.forEach((el) => { el.textContent = text; });
  }

  // --- 通用卡片选中逻辑 ---
  // 仅负责选中态与滚动定位，不自动开启导航。
  // 导航需由用户显式点击"开始导航"按钮触发。
  function selectCard(id) {
    // 始终记录选中意图，即使卡片 DOM 尚未创建（loadData 未完成时），
    // 后续 renderCards / renderOtherCards 会根据 activeCardId 恢复 is-active。
    activeCardId = id;
    navActiveForCard = false; // 选中新卡片不自动开始导航，等用户点击按钮

    const card = dock.querySelector(`.detail__card[data-id="${id}"]`);
    if (!card || card.classList.contains("is-active")) return;

    // "其他项目"中已完成的卡片不允许选中
    if (card.closest("#other-attractions-scroll") && card.classList.contains("is-done")) return;

    // 选中卡片时不再调整数组顺序，仅原地更新选中态并滚动到可见区域
    // 移除其他卡片的选中态，恢复其导航按钮
    dock.querySelectorAll(".detail__card.is-active").forEach(c => {
      c.classList.remove("is-active");
      const btn = c.querySelector("[data-action=navigate]");
      if (btn) { btn.classList.remove("is-navigating"); btn.textContent = "开始导航"; }
    });
    card.classList.add("is-active");
    card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

    // 不自动切换导航按钮为"导航中"，保持"开始导航"待用户主动触发
    const curBtn = card.querySelector("[data-action=navigate]");
    if (curBtn) { curBtn.classList.remove("is-navigating"); curBtn.textContent = "开始导航"; }
  }

 // --- 卡片点击 ---
  dock.addEventListener("click", (e) => {
    // "加入推荐"按钮（其他项目区域）
    const addBtn = e.target.closest("[data-action=add-recommend]");
    if (addBtn) {
      e.stopPropagation();
      const card = addBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (!id) return;
      const item = allAttractions.find((a) => String(a.id) === String(id));
      if (!item) return;
      // 标记为手动加入，并通过 rankRecommendations 重排（手动项始终保留在前列）
      manualRecommendIds.add(String(id));
      attractions = rankRecommendations();
      renderCards();
      renderOtherCards();
      return;
    }

    // 删除推荐卡片按钮
    const removeBtn = e.target.closest("[data-action=remove-card]");
    if (removeBtn) {
      e.stopPropagation();
      const card = removeBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (!id) return;
      const idx = attractions.findIndex((a) => String(a.id) === String(id));
      if (idx >= 0) {
        // 先解除手动推荐标记，再交由 rankRecommendations 重新决定推荐列表内容
        manualRecommendIds.delete(String(id));
        // 如果移除的是当前选中卡片，清除选中态
        if (String(activeCardId) === String(id)) {
          activeCardId = null;
          navActiveForCard = false;
          window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));
        }
        attractions = rankRecommendations();
        renderCards();
        renderOtherCards();
      }
      return;
    }

    // 快速导航按钮
    const navBtn = e.target.closest("[data-action=navigate]");
    if (navBtn) {
      const card = navBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (!id) return;

      // 如果按钮处于"导航中"状态（is-navigating），切换为暂停
      if (navBtn.classList.contains("is-navigating")) {
        navBtn.classList.remove("is-navigating");
        navBtn.textContent = "开始导航";
        navActiveForCard = false;
        window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id, active: false } }));
      } else if (card.classList.contains("is-active")) {
        // 按钮处于"开始导航"状态（已选中卡片内），切换为启动导航：
        // 同时派发 quick-navigate（获取并绘制 LBS→景点 步行路线）与
        // navigation-toggled（用于状态同步），保持与未选中分支一致的导航效果。
        navBtn.classList.add("is-navigating");
        navBtn.textContent = "导航中";
        navActiveForCard = true;
        window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
        window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id, active: true } }));
        // 导航激活后将面板收起
        setDockState("open");
        // 导航激活后，滚动面板使选中卡片可见
        const activeCard = dock.querySelector(`.detail__card[data-id="${id}"]`);
        const panel = dock.querySelector(".planner-dock__panel");
        if (activeCard && panel) {
          // 将选中卡片滚动到面板可视区域
          setTimeout(() => {
            activeCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          }, 50);
        }
      } else {
        // 未选中卡片上点击"开始导航"按钮，先选中卡片再触发导航
        selectCard(id);
        // selectCard 不会自动激活导航按钮，这里显式标记为"导航中"
        navBtn.classList.add("is-navigating");
        navBtn.textContent = "导航中";
        navActiveForCard = true;
        // 与地图点击保持一致的事件格式：同时携带 id 与 attraction
        const __navItem = allAttractions.find((a) => String(a.id) === String(id));
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id, attraction: __navItem } }));
        window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
        // 导航激活后将面板收起
        setDockState("open");
        // 导航激活后，滚动面板使选中卡片可见
        const activeCard = dock.querySelector(`.detail__card[data-id="${id}"]`);
        const panel = dock.querySelector(".planner-dock__panel");
        if (activeCard && panel) {
          // 将选中卡片滚动到面板可视区域
          setTimeout(() => {
            activeCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          }, 50);
        }
      }
      return;
    }

    // 已玩过按钮
    const doneBtn = e.target.closest("[data-action=mark-done]");
    if (doneBtn) {
      e.stopPropagation();
      const card = doneBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (id) {
        const count = (playedCounts.get(id) || 0) + 1;
        playedCounts.set(id, count);
        card.classList.add("is-done");
        // 隐藏"待玩"标签
        const nextTag = card.querySelector(".planner-dock__card-next");
        if (nextTag) nextTag.style.display = "none";
        // 显示并更新"已玩N次"
        const playedTag = card.querySelector(".detail__played-count");
        if (playedTag) {
          playedTag.style.display = "";
          playedTag.textContent = `已玩${count}次`;
        }
        checkMustPlayMatch(id);
        updateStats();
        window.dispatchEvent(new CustomEvent("attraction-done", { detail: { id, count } }));

        const isFromOther = !!card.closest("#other-attractions-scroll");
        if (isFromOther) {
          // "其他项目"标记为 done 时，始终移除 is-active 并清除选中态
          card.classList.remove("is-active");
          const navBtn2 = card.querySelector("[data-action=navigate]");
          if (navBtn2) { navBtn2.classList.remove("is-navigating"); navBtn2.textContent = "开始导航"; }
          if (String(activeCardId) === String(id)) {
            activeCardId = null;
            navActiveForCard = false;
            window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));
          }
          // 已玩过后重新排序推荐
          attractions = rankRecommendations();
          renderCards();
          renderOtherCards();
        } else {
          // "当前推荐项目"：标记已玩后由 rankRecommendations 重新生成推荐列表，
          // 该项目会经由 renderOtherCards 的差集逻辑自动出现在「其他项目」列表中。
          const idx = attractions.findIndex((a) => String(a.id) === String(id));
          if (idx >= 0) {
            // 同步解除手动推荐标记，避免后续残留紫色背景/删除按钮状态
            manualRecommendIds.delete(String(id));
            // 已玩过的卡片若处于选中态则取消选中
            if (String(activeCardId) === String(id)) {
              activeCardId = null;
              navActiveForCard = false;
            }
            // 重新智能排序（已玩项会被排除在候选池之外）
            attractions = rankRecommendations();
            renderCards();
            renderOtherCards(); // 当前展示项变更，刷新"其他项目"列表
          }

          // 取消地图中的路径展示（派发空 polyline 触发 main.js 中的清除逻辑）
          window.dispatchEvent(new CustomEvent("route-preview", { detail: {} }));

          // 自动选中当前列表中的第一个项目，并切换相机镜头
          if (attractions.length > 0) {
            const __firstId = attractions[0].id;
            selectCard(__firstId);
            const __firstItem = allAttractions.find((a) => String(a.id) === String(__firstId)) || attractions[0];
            window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id: __firstId, attraction: __firstItem } }));
          }
        }
      }
      return;
    }

    const card = e.target.closest(".detail__card");
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;

    selectCard(id);

    // 仅派发选中事件用于相机聚焦，不自动开启路线导航；
    // 导航需由用户点击"开始导航"按钮显式触发。
    // 与地图点击（interaction.js）保持一致的 detail 格式：同时携带 id 与 attraction。
    const __cardItem = allAttractions.find((a) => String(a.id) === String(id));
    window.dispatchEvent(
      new CustomEvent("attraction-clicked", { detail: { id, attraction: __cardItem } })
    );
  });

  // --- 监听来自 wait-marker "加入推荐"按钮的全局事件 ---
  document.addEventListener("add-to-recommend", (e) => {
    const id = e.detail?.id;
    if (!id) return;
    const item = allAttractions.find((a) => String(a.id) === String(id));
    if (!item) return;
    manualRecommendIds.add(String(id));
    attractions = rankRecommendations();
    renderCards();
    renderOtherCards();
    // 通知地图标签刷新（移除已推荐项的按钮）
    window.dispatchEvent(new CustomEvent("recommend-list-changed"));
  });

  // --- 监听地图点击，对应卡片进入与面板点击完全一致的选中态 ---
  // 复用 selectCard 以保证视觉效果（is-active 高亮、紫色边框等）与
  // 面板内直接点击卡片完全一致；selectCard 自身已包含 scrollIntoView。
  window.addEventListener("attraction-clicked", (e) => {
    const id = e.detail?.id || e.detail?.attraction?.id;
    if (!id) return;
    selectCard(id);
  });

  // --- 监听 LBS 位置更新 ---
  window.addEventListener("user-location-updated", (e) => {
    const { scene_x, scene_z, gcj_lat, gcj_lng } = e.detail || {};
    if (scene_x != null && scene_z != null) {
      userX = scene_x;
      userZ = scene_z;
    }
    if (gcj_lat != null && gcj_lng != null) {
      // 位移超过约 50m 时清空缓存（0.0005° ≈ 55m）
      if (
        lastCachedLat == null ||
        Math.abs(gcj_lat - lastCachedLat) > 0.0005 ||
        Math.abs(gcj_lng - lastCachedLng) > 0.0005
      ) {
        walkCache = {};
        lastCachedLat = gcj_lat;
        lastCachedLng = gcj_lng;
      }
      userLat = gcj_lat;
      userLng = gcj_lng;
    }

    // 节流：位置变化超过 50m 才重新智能排序（避免频繁打乱用户选中态）
    let didRerank = false;
    if (userX != null && userZ != null) {
      if (
        lastRankX == null ||
        Math.hypot(userX - lastRankX, userZ - lastRankZ) > 50
      ) {
        lastRankX = userX;
        lastRankZ = userZ;
        attractions = rankRecommendations();
        renderCards();
        renderOtherCards();
        didRerank = true;
      }
    }

    // 未重新排序时，仅局部刷新距离文本，避免完整 renderCards 重建 DOM
    // 导致选中态、滚动位置、按钮状态等 UI 状态丢失。
    if (!didRerank) {
      refreshDistLabels();
    }
  });

  // 手动选点时无条件刷新推荐（不受 50m 节流限制）
  window.addEventListener("lbs-location-set", (e) => {
    const { scene_x, scene_z, gcj_lat, gcj_lng } = e.detail || {};
    if (scene_x != null && scene_z != null) {
      userX = scene_x;
      userZ = scene_z;
    }
    if (gcj_lat != null && gcj_lng != null) {
      userLat = gcj_lat;
      userLng = gcj_lng;
    }
    lastRankX = userX;
    lastRankZ = userZ;
    attractions = rankRecommendations();
    renderCards();
    renderOtherCards();
    refreshDistLabels();
  });

  // --- 局部刷新距离文本 ---
  // 仅异步更新步行距离，不先写入直线距离，避免文字闪烁。
  function refreshDistLabels() {
    const container = dock.querySelector("#planner-dock-scroll");
    if (!container || !container.querySelector(".detail__card")) {
      return; // DOM 尚未就位，等 loadData/renderCards 完成后自然会填充
    }
    // 仅异步更新步行距离，不先更新直线距离，避免闪烁
    updateWalkDistances();
  }

  // --- 数据获取 ---
  async function loadData() {
    const [attrList, waitList] = await Promise.all([
      fetchAttractions(),
      fetchWaitTimes(),
    ]);

    // 必须先填充真实排队数据，再做首轮智能排序：
    // rankRecommendations 内部会用当前 waitMap 计算机会推荐基线 lastOpportunityIds。
    // 若此处 waitMap 仍为空，基线会是空集，随后 LBS 首次定位事件触发重排时，
    // 启动瞬间就已存在的短排队必玩项目会被误判为「新出现的机会」而弹出 push。
    waitMap = {};
    for (const w of waitList) {
      waitMap[w.id] = w;
    }

    if (attrList.length) {
      allAttractions = attrList.slice();
      // 智能排序生成当前推荐项目（top 5，含必玩加权 + 保底）
      attractions = rankRecommendations();
    }

    renderCards();
    renderOtherCards();
    syncMustPlayFromPlayed();
    updateStats();
    updateCountdown();
  }

  // 首次加载
  loadData().then(() => {
    // 启动保护期：loadData 完成后再等 15 秒，确保 LBS 首次定位等异步事件
    // 充分建立稳定基线后才允许 opportunity toast 弹出
    setTimeout(() => { appReady = true; }, 15_000);
  });

  // 每 60 秒刷新闭园倒计时
  setInterval(updateCountdown, 60_000);

  // --- 测试按钮：模拟项目暂停开放 ---
  window.addEventListener('simulate-closed', () => {
    if (allAttractions.length === 0) return;

    // 从当前推荐列表（attractions）中随机选一个正在开放的项目
    const openItems = attractions.filter(a => {
      const w = waitMap[a.id];
      return !w || w.status !== 'closed';
    });

    if (openItems.length === 0) return;

    const target = openItems[Math.floor(Math.random() * openItems.length)];

    // 将该项目在 waitMap 中设为暂停开放
    waitMap[target.id] = { waitMinutes: 0, status: 'closed' };

    // 重新排序并渲染
    attractions = rankRecommendations();
    renderCards();
    renderOtherCards();

    console.log('[simulate-closed]', target.name, '已设为暂停开放');
  });

  // --- 局部刷新排队时间标签 ---
  function refreshWaitLabels() {
    const list = allAttractions.length ? allAttractions : attractions;
    for (const a of list) {
      const waitEls = dock.querySelectorAll(
        `.detail__card[data-id="${a.id}"] .detail__wait`
      );
      if (!waitEls.length) continue;
      const wait = waitMap[a.id];
      const wm = wait?.waitMinutes;
      const waitCls = waitColorClass(wm);
      const isClosed = wait?.status === "closed";
      const parkClosed = isParkClosed();
      const waitText = parkClosed ? getClosedText() : isClosed ? "暂停开放" : (wm == null ? "等待时长：—" : `等待时长：${wm} 分钟`);
      const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
      waitEls.forEach((waitEl) => {
        waitEl.textContent = waitText;
        waitEl.className = `detail__wait ${waitDisplayCls}${isClosed ? ' is-closed' : ''}`;
      });
    }
  }

  // [已禁用] 排队时间改为使用真实数据，移除自动刷新
  // refreshTimer = setInterval(async () => {
  //   const waitList = await fetchWaitTimes();
  //   waitMap = {};
  //   for (const w of waitList) {
  //     waitMap[w.id] = w;
  //   }
  //   attractions = rankRecommendations();
  //   renderCards();
  //   renderOtherCards();
  // }, 60_000);

  return { dock, setCollapsed, expand: () => setCollapsed(false) };
}
