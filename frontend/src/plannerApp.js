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
import { setRecommendedIds } from "./recommendedStore.js";

export function mountPlannerApp() {
  // --- Titlebar（页面顶部状态栏 + 二级导航） ---
  const titlebar = document.createElement("div");
  titlebar.className = "planner-titlebar";
  titlebar.innerHTML = `
    <div class="planner-titlebar__statusbar">
      <span class="planner-titlebar__time" id="planner-titlebar-time">9:41</span>
      <div class="planner-titlebar__indicators">
        <svg class="planner-titlebar__icon planner-titlebar__icon--signal" width="17" height="11" viewBox="0 0 17 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="0" y="7" width="3" height="4" rx="0.8" fill="#000000"/>
          <rect x="4.5" y="5" width="3" height="6" rx="0.8" fill="#000000"/>
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.8" fill="#000000"/>
          <rect x="13.5" y="0" width="3" height="11" rx="0.8" fill="#000000"/>
        </svg>
        <svg class="planner-titlebar__icon planner-titlebar__icon--wifi" width="15" height="11" viewBox="0 0 15 11" fill="#000000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7.5 0C4.66 0 2.05 1 0 2.66l1.4 1.4C3.07 2.7 5.23 2 7.5 2s4.43 0.7 6.1 2.06L15 2.66C12.95 1 10.34 0 7.5 0z"/>
          <path d="M7.5 4C5.62 4 3.85 4.66 2.45 5.85l1.4 1.4C4.85 6.46 6.13 6 7.5 6s2.65 0.46 3.65 1.25l1.4-1.4C11.15 4.66 9.38 4 7.5 4z"/>
          <circle cx="7.5" cy="9.4" r="1.5"/>
        </svg>
        <svg class="planner-titlebar__icon planner-titlebar__icon--battery" width="27" height="12" viewBox="0 0 27 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="11" rx="2.6" stroke="#000000" stroke-opacity="0.55"/>
          <rect x="2" y="2" width="19" height="8" rx="1.4" fill="#000000"/>
          <rect x="23.5" y="4" width="1.5" height="4" rx="0.6" fill="#000000" fill-opacity="0.55"/>
        </svg>
      </div>
    </div>
    <div class="planner-titlebar__navbar">
      <button type="button" class="planner-titlebar__btn planner-titlebar__btn--back" aria-label="返回">
        <svg width="18" height="16" viewBox="0 0 33 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5127 0.512573C14.1961 -0.170844 15.3039 -0.170844 15.9873 0.512573C16.6707 1.196 16.6707 2.30379 15.9873 2.98718L5.97461 12.9999H30.75C31.7165 12.9999 32.5 13.7834 32.5 14.7499C32.4999 15.7163 31.7165 16.4999 30.75 16.4999H5.97461L15.9873 26.5126C16.6706 27.196 16.6707 28.3038 15.9873 28.9872C15.3039 29.6705 14.1961 29.6705 13.5127 28.9872L0.512695 15.9872C0.431687 15.9062 0.358866 15.8171 0.294922 15.7216C0.279328 15.6983 0.265331 15.6741 0.250977 15.6503C0.235264 15.6242 0.219444 15.5981 0.205078 15.5712C0.190248 15.5433 0.177279 15.5147 0.164062 15.4862C0.154243 15.4651 0.143758 15.4443 0.134766 15.4227C0.121106 15.3899 0.109231 15.3565 0.0976562 15.3231C0.0902122 15.3017 0.0818187 15.2805 0.0751953 15.2587C0.0686627 15.2371 0.0642761 15.215 0.0585938 15.1932C0.0215325 15.0515 1.13671e-05 14.9032 0 14.7499C0 14.5962 0.0214093 14.4475 0.0585938 14.3055C0.0642833 14.2838 0.0686557 14.2617 0.0751953 14.2401C0.0825495 14.2159 0.092224 14.1926 0.100586 14.1688C0.111115 14.1389 0.120603 14.1084 0.132812 14.079C0.144962 14.0497 0.159186 14.0215 0.172852 13.993C0.183284 13.9713 0.192719 13.949 0.204102 13.9276C0.218539 13.9005 0.235179 13.8747 0.250977 13.8485C0.265336 13.8247 0.279324 13.8005 0.294922 13.7772C0.358753 13.6819 0.431879 13.5934 0.512695 13.5126L13.5127 0.512573Z" fill="white"/>
        </svg>
      </button>
      <span class="planner-titlebar__title">上迪排队助手</span>
      <div class="planner-titlebar__actions">
        <button type="button" class="planner-titlebar__btn planner-titlebar__btn--more" aria-label="更多">
          <svg width="16" height="4" viewBox="0 0 16 4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="2" cy="2" r="1.5" fill="#FFFFFF"/>
            <circle cx="8" cy="2" r="1.5" fill="#FFFFFF"/>
            <circle cx="14" cy="2" r="1.5" fill="#FFFFFF"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(titlebar);

  // 返回按钮事件
  titlebar.querySelector(".planner-titlebar__btn--back")?.addEventListener("click", (e) => {
    e.preventDefault();
  });

  // 状态栏时间：HH:MM，每分钟更新
  const timeEl = titlebar.querySelector("#planner-titlebar-time");
  const renderStatusBarTime = () => {
    if (!timeEl) return;
    const d = new Date();
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    timeEl.textContent = `${hh}:${mm}`;
  };
  renderStatusBarTime();
  // 对齐到下一分钟边界，再以 60s 间隔刷新
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    renderStatusBarTime();
    setInterval(renderStatusBarTime, 60_000);
  }, msToNextMinute);

  const dock = document.createElement("div");
  dock.id = "planner-dock";
  dock.className = "planner-dock is-collapsed";

  dock.innerHTML = `
    <div class="planner-dock__panel">
      <button type="button" class="planner-dock__handle" id="planner-dock-handle" aria-label="展开或收起面板">
        <span class="planner-dock__handle-bar"></span>
      </button>
      <h2 class="planner-dock__title-gradient">现在玩以下项目，让你省时玩得更多<span class="planner-dock__refresh-time" id="planner-refresh-time"></span></h2>
      <div class="planner-dock__scroll" id="planner-dock-scroll"></div>
      <div class="planner-dock__dots" id="planner-dock-dots" aria-hidden="true"></div>
      <h2 class="planner-dock__section-title other-attractions__title" id="other-attractions-title" style="display:none">其他项目</h2>
      <div class="other-attractions__scroll" id="other-attractions-scroll"></div>
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
  let refreshDisplayTimer = null; // 每10秒更新相对时间显示
  let lastRefreshTime = Date.now(); // 上次刷新的时间戳
  const playedCounts = new Map(); // id -> 已玩次数
  // 必玩挑战（官方完整名称）
  const mustPlayList = [
    "创极速光轮",
    "加勒比海盗——沉落宝藏之战",
    "七个小矮人矿山车",
    "热力追踪",
    "翡翔·飞越地平线",
    "雷鸣山漂流",
  ];
  // 热门项目（非必玩但仍然值得推荐的热门项目）
  const popularList = [
    "小飞侠天空奇遇",
    "晶彩奇航",
    "巴斯光年星际营救",
    "古迹探索营",
    "小熊维尼历险记",
    "喜美水上派对",
    "喷气背包飞行器",
    "太空幸会史迪奇",
  ];
  // 判断当前景点是否属于必玩项目（与必玩列表做包含式模糊匹配）
  function isMustPlayAttraction(a) {
    if (!a) return false;
    const candidates = [a.name, a.name_cn].filter(Boolean);
    return mustPlayList.some((m) =>
      candidates.some((c) => c.includes(m) || m.includes(c))
    );
  }
  let activeCardId = null; // 当前选中卡片的 id，renderCards 后恢复 is-active
  let navActiveForCard = false; // 当前选中卡片的导航是否激活（true=导航中，false=暂停）
  let _pendingNavCardId = null; // 展开态下点击"开始导航"后记录的目标卡片 id，收起后自动选中并滚动
  // 手动加入推荐的项目 id 集合（不持久化，刷新页面重置）
  // 仅这部分卡片显示紫色背景与右上角删除按钮，系统自动推荐的初始 3 张维持默认样式。
  const manualRecommendIds = new Set();
  let lastOpportunityIds = new Set(); // 上一次的机会推荐ID
  const explicitLowWaitIds = new Set(); // 由 simulate-low-wait 显式触发的低排队项目ID
  let appReady = false; // 启动保护期：true 后才允许弹 opportunity toast

  // --- 折叠控制（两档：collapsed / full）---
  function setDockState(state) {
    // state: 'collapsed' | 'full'
    const wasFullBefore = dock.classList.contains("is-full");
    dock.classList.toggle("is-collapsed", state === "collapsed");
    dock.classList.toggle("is-full", state === "full");

    // 从展开态收起时，若有待激活的导航卡片，等 CSS 过渡结束后选中并滚动到可见
    if (wasFullBefore && state === "collapsed" && _pendingNavCardId) {
      const navId = _pendingNavCardId;
      _pendingNavCardId = null;
      // CSS transition 为 0.28s，等待过渡完成后再执行滚动
      setTimeout(() => {
        const targetCard = dock.querySelector(`.detail__card[data-id="${navId}"]`);
        if (targetCard) {
          // 确保 is-active 状态存在
          if (!targetCard.classList.contains("is-active")) {
            dock.querySelectorAll(".detail__card.is-active").forEach(c => {
              c.classList.remove("is-active");
              const btn = c.querySelector("[data-action=navigate]");
              if (btn) { btn.classList.remove("is-navigating"); btn.textContent = "开始导航"; }
            });
            targetCard.classList.add("is-active");
            activeCardId = navId;
          }
          targetCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }, 320);
    }
  }

  function setCollapsed(collapsed) {
    setDockState(collapsed ? "collapsed" : "full");
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
          // 上拉：collapsed → full
          if (cls.contains("is-collapsed")) setDockState("full");
        } else {
          // 下拉：full → collapsed
          if (cls.contains("is-full")) setDockState("collapsed");
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
      // 点击：在 collapsed 与 full 之间切换
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

  // 构造排队时间文案：固定格式「身高要求xcm｜排队时长x分钟」
  // 闭园/暂停时替换排队部分为对应文案
  function buildWaitText(a, wait) {
    const isClosed = wait?.status === "closed";
    let queuePart;
    if (isParkClosed()) {
      queuePart = "今日已闭园";
    } else if (isClosed) {
      queuePart = "暂停排队";
    } else {
      const wm = wait?.waitMinutes;
      queuePart = wm == null ? "排队时长—" : `排队时长${wm}分钟`;
    }
    const minHeight = Number(a?.min_height_cm) || 0;
    if (minHeight > 0) {
      return `身高要求${minHeight}cm｜${queuePart}`;
    }
    return `无身高要求｜${queuePart}`;
  }

  // 构造排队时间 HTML：身高要求保持默认色，排队时长部分带颜色 class
  function buildWaitHtml(a, wait, colorCls) {
    const isClosed = wait?.status === "closed";
    let queuePart;
    if (isParkClosed()) {
      queuePart = "今日已闭园";
    } else if (isClosed) {
      queuePart = "暂停排队";
    } else {
      const wm = wait?.waitMinutes;
      queuePart = wm == null ? "排队时长—" : `排队时长${wm}分钟`;
    }
    const minHeight = Number(a?.min_height_cm) || 0;
    const heightPart = minHeight > 0 ? `身高要求${minHeight}cm` : '无身高要求';
    const effectiveCls = isParkClosed() ? 'wait-color--closed' : (isClosed ? ' is-closed' : '');
    return `${heightPart}<svg class="wait-divider" width="1" height="14" viewBox="0 0 1 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="16" fill="#D9D9D9"/></svg><span class="wait-queue-color ${isParkClosed() ? 'wait-color--closed' : colorCls}${effectiveCls}">${queuePart}</span>`;
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
      container.innerHTML = `<span class="planner-dock__empty">加载中…</span>`;
      renderDots(0);
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
        const waitHtml = buildWaitHtml(a, wait, parkClosed ? 'wait-color--closed' : waitCls);
        const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
        const distLabel = getDistLabel(a);
        const isPlayed = playedCounts.has(a.id);
        const playedNum = playedCounts.get(a.id) || 0;
        // 标签仅在必玩项目上展示：未玩=「必玩」(橙色)，已玩=「已玩N次」(紫色 is-played)
        const isMust = isMustPlayAttraction(a);
        let tagHtml = '';
        if (isMust) {
          if (isPlayed) {
            tagHtml = `<span class="rec-card__tag is-played">已玩${playedNum}次</span>`;
          } else {
            tagHtml = `<span class="rec-card__tag">必玩</span>`;
          }
        }
        // 手动加入推荐的卡片：附加 is-manual-recommend 类并渲染删除按钮
        const isManual = manualRecommendIds.has(String(a.id));
        const manualCls = isManual ? ' is-manual-recommend' : '';
        const removeBtnHtml = isManual ? '<span class="detail__card-remove" data-action="remove-card"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 5.10771L11.7321 0.375663C12.2572 -0.131497 13.0918 -0.124244 13.608 0.391965C14.1242 0.908173 14.1315 1.74285 13.6243 2.26795L8.89229 7L13.6243 11.7321C14.1315 12.2572 14.1242 13.0918 13.608 13.608C13.0918 14.1242 12.2572 14.1315 11.7321 13.6243L7 8.89229L2.26795 13.6243C1.74285 14.1315 0.908173 14.1242 0.391965 13.608C-0.124244 13.0918 -0.131497 12.2572 0.375663 11.7321L5.10771 7L0.375663 2.26795C-0.131497 1.74285 -0.124244 0.908173 0.391965 0.391965C0.908173 -0.124244 1.74285 -0.131497 2.26795 0.375663L7 5.10771Z" fill="currentColor"/></svg></span>' : '';
        const isActiveCard = String(a.id) === String(activeCardId);
        const activeCls = isActiveCard ? ' is-active' : '';
        return `
          <div class="detail__card rec-card${manualCls}${activeCls}" data-id="${a.id}">
            ${removeBtnHtml}
            <div class="rec-card__head">
              <span class="rec-card__name">${a.name || ''}</span>
              ${tagHtml}
            </div>
            <div class="rec-card__wait detail__wait">${waitHtml}</div>
            <div class="rec-card__dist planner-dock__card-dist">${distLabel}</div>
            <div class="rec-card__actions detail__actions">
              <button type="button" class="rec-card__btn rec-card__btn--secondary btn btn--secondary" data-action="mark-done">已玩过</button>
              <button type="button" class="rec-card__btn rec-card__btn--primary btn btn--primary${isActiveCard && navActiveForCard ? ' is-navigating' : ''}" data-action="navigate">${isActiveCard && navActiveForCard ? '导航中...' : '开始导航'}</button>
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
            btn.textContent = "导航中...";
          } else {
            btn.classList.remove("is-navigating");
            btn.textContent = "开始导航";
          }
        }
      }
    }

    // 渲染轮播指示器并同步当前激活点
    renderDots(displayList.length);
    updateActiveDot();

    // 卡片入场动效：逐个延迟添加 is-loading-in
    const allCards = container.querySelectorAll(".detail__card");
    allCards.forEach((card, i) => {
      // 跳过当前活跃/导航中的卡片，避免入场动画覆盖其状态
      if (card.classList.contains("is-active")) {
        card.classList.add("is-loaded");
        return;
      }
      card.classList.add("is-loading-in");
      card.style.animationDelay = `${i * 80}ms`;
      card.addEventListener("animationend", () => {
        card.classList.remove("is-loading-in");
        card.classList.add("is-loaded");
        card.style.animationDelay = "";
      }, { once: true });
    });

    // 先渲染直线距离，再异步覆盖为步行距离
    updateWalkDistances();

  }

  // --- 轮播指示器 ---
  function renderDots(count) {
    const dotsEl = dock.querySelector("#planner-dock-dots");
    if (!dotsEl) return;
    if (count <= 1) { dotsEl.innerHTML = ""; return; }
    dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
      `<span class="planner-dock__dot${i === 0 ? ' is-active' : ''}"></span>`
    ).join("");
  }

  function updateActiveDot() {
    const scrollEl = dock.querySelector("#planner-dock-scroll");
    const dotsEl = dock.querySelector("#planner-dock-dots");
    if (!scrollEl || !dotsEl) return;
    const dots = dotsEl.querySelectorAll(".planner-dock__dot");
    if (!dots.length) return;
    const cards = scrollEl.querySelectorAll(".rec-card");
    if (!cards.length) return;
    // 卡片宽度 + gap，参考首张卡片实际宽度，gap=12
    const step = cards[0].getBoundingClientRect().width + 12;
    const idx = Math.max(0, Math.min(dots.length - 1, Math.round(scrollEl.scrollLeft / step)));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
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
        const waitHtml = buildWaitHtml(a, wait, parkClosed ? 'wait-color--closed' : waitCls);
        const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
        const distLabel = getDistLabel(a);
        const isPlayed = playedCounts.has(a.id);
        const playedNum = playedCounts.get(a.id) || 0;
        const isMust = isMustPlayAttraction(a);
        let tagHtml = '';
        if (isMust) {
          if (isPlayed) {
            tagHtml = `<span class="rec-card__tag is-played">已玩${playedNum}次</span>`;
          } else {
            tagHtml = `<span class="rec-card__tag">必玩</span>`;
          }
        }
        return `
          <div class="detail__card rec-card other-attractions__card" data-id="${a.id}">
            <div class="rec-card__head">
              <span class="rec-card__name">${a.name || ''}</span>
              ${tagHtml}
            </div>
            <div class="rec-card__wait detail__wait">${waitHtml}</div>
            <div class="rec-card__dist planner-dock__card-dist">${distLabel}</div>
            <div class="rec-card__actions detail__actions">
              <button type="button" class="rec-card__btn rec-card__btn--secondary btn btn--secondary" data-action="mark-done">已玩过</button>
              <button type="button" class="rec-card__btn rec-card__btn--primary btn btn--primary" data-action="add-recommend">开始导航</button>
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
            btn.textContent = "导航中...";
          } else {
            btn.classList.remove("is-navigating");
            btn.textContent = "开始导航";
          }
        }
      }
    }

    updateWalkDistances();
  }

  function getDistLabel(a) {
    if (userX == null || userZ == null) return "计算中...";
    const px = a.position_x ?? 0;
    const pz = a.position_z ?? 0;
    const dist = Math.hypot(px - userX, pz - userZ); // 场景单位 ≈ 1m
    const distM = Math.round(dist);
    const minutes = Math.max(1, Math.ceil(dist / 80)); // ~80m/min 步速
    return `距离${distM}m，步行约${minutes}分钟`;
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

    // 未玩必玩项目加分：根据是否在 mustPlayList 中直接加分
    let mustBonus = 0;
    if (matchedMust) {
      if (remainMin <= 60) {
        // 紧迫：强推必玩
        mustBonus = 150;
      } else if (remainMin <= 120) {
        // 中等压力：适度加分
        mustBonus = 60;
      } else {
        // 剩余时间充裕(>120分钟)：小加分(20)，给必玩项目轻微优先级信号
        mustBonus = 20;
      }
    }

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

    // 已玩次数惩罚：每玩一次扣分，避免同一项目反复霸占推荐首位
    const playedPenalty = playedCounts.has(a.id) ? (playedCounts.get(a.id) * 30) : 0;

    return (efficiency + mustBonus + proximityBonus - playedPenalty) * photoDiscount;
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

    // 2b. 从候选池中分离由 simulate-low-wait 显式触发的机会项目
    const opportunityFromCandidates = [];
    const regularCandidates = [];
    candidates.forEach(a => {
      if (explicitLowWaitIds.has(String(a.id))) {
        opportunityFromCandidates.push(a);
      } else {
        regularCandidates.push(a);
      }
    });

    // 2c. 已玩过但被显式触发的低排队项目也可再次推荐
    const opportunityFromPlayed = allAttractions.filter(a => {
      if (!playedCounts.has(a.id)) return false;
      if (manualIdSet.has(String(a.id))) return false;
      return explicitLowWaitIds.has(String(a.id));
    });

    // 合并所有机会推荐项（不受 autoSlots 限制）
    const allOpportunityItems = [...opportunityFromCandidates, ...opportunityFromPlayed];
    let opportunityFill = [];
    if (allOpportunityItems.length > 0) {
      const oppScored = allOpportunityItems.map(a => ({ attraction: a, score: calcScore(a) }));
      oppScored.sort((a, b) => b.score - a.score);
      opportunityFill = oppScored.map(s => s.attraction);
    }

    // 3. 常规候选评分排序（排除已归为机会推荐的项目）
    const scored = regularCandidates.map((a) => ({ attraction: a, score: calcScore(a) }));
    scored.sort((a, b) => b.score - a.score);

    // 4. 取 top N（手动推荐不占用自动名额，保持3个自动推荐）
    const autoSlots = 3;
    const regularItems = scored.slice(0, autoSlots).map((s) => s.attraction);

    // 5. 合并：手动推荐 + 常规自动推荐
    let result = [...manualItems, ...regularItems];

    // 6. 低排队机会推荐强制插入（不受3个限制）
    // 规则：如果有选中/导航中的卡片，强制将其置于第一位，低排队插入其后
    //       如果没有选中卡片，低排队直接插入第一位
    if (opportunityFill.length > 0) {
      const navIdx = activeCardId
        ? result.findIndex(a => String(a.id) === String(activeCardId))
        : -1;
      if (navIdx >= 0) {
        // 先将导航卡片强制移到 index 0（无论它之前在哪个位置）
        if (navIdx > 0) {
          const [navCard] = result.splice(navIdx, 1);
          result.unshift(navCard);
        }
        // 导航卡片现在在 index 0，低排队插入到 index 1
        result.splice(1, 0, ...opportunityFill);
      } else {
        // 无选中卡片：低排队直接插入第一位
        result.splice(0, 0, ...opportunityFill);
      }
    }

    // 8. 保底：至少 1 个未关闭项目
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
    const distM = Math.round(Number(info.dist) || 0);
    const minStr = Math.max(1, Math.ceil((Number(info.duration) || 0) / 60));
    const text = `距离${distM}m，步行约${minStr}分钟`;
    els.forEach((el) => { el.textContent = text; });
  }

  // --- 通用卡片选中逻辑 ---
  // 仅负责选中态与滚动定位，不自动开启导航。
  // 导航需由用户显式点击"开始导航"按钮触发。
  function selectCard(id) {
    // 记录调用前的导航状态：若当前正在导航中，selectCard 不应清除导航态
    const wasNavigating = navActiveForCard;
    const prevNavCardId = activeCardId;

    // 始终记录选中意图，即使卡片 DOM 尚未创建（loadData 未完成时），
    // 后续 renderCards / renderOtherCards 会根据 activeCardId 恢复 is-active。
    activeCardId = id;
    // 仅在未导航时才重置 navActiveForCard；导航中时保留当前导航状态
    if (!wasNavigating) {
      navActiveForCard = false; // 选中新卡片不自动开始导航，等用户点击按钮
    }

    const card = dock.querySelector(`.detail__card[data-id="${id}"]`);
    if (!card || card.classList.contains("is-active")) return;

    // "其他项目"中已完成的卡片不允许选中
    if (card.closest("#other-attractions-scroll") && card.classList.contains("is-done")) return;

    // 选中卡片时不再调整数组顺序，仅原地更新选中态并滚动到可见区域
    // 移除其他卡片的选中态，恢复其导航按钮
    dock.querySelectorAll(".detail__card.is-active").forEach(c => {
      c.classList.remove("is-active");
      const btn = c.querySelector("[data-action=navigate]");
      if (btn) {
        // 若该卡片是正在导航中的卡片，保留其"导航中..."按钮态，避免取消导航
        const isNavigatingCard = wasNavigating && String(c.dataset.id) === String(prevNavCardId);
        if (!isNavigatingCard) {
          btn.classList.remove("is-navigating");
          btn.textContent = "开始导航";
        }
      }
    });
    card.classList.add("is-active");
    card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

    // 不自动切换导航按钮为"导航中"，保持"开始导航"待用户主动触发
    // 但若新选中的卡片本身就是正在导航中的卡片，则不要重置其按钮态
    const curBtn = card.querySelector("[data-action=navigate]");
    const isNavigatingTarget = wasNavigating && String(id) === String(prevNavCardId);
    if (curBtn && !isNavigatingTarget) {
      curBtn.classList.remove("is-navigating");
      curBtn.textContent = "开始导航";
    }
  }

  // --- 横滑卡片：根据 scroll 位置同步轮播指示器 ---
  {
    const scrollEl = dock.querySelector("#planner-dock-scroll");
    if (scrollEl) {
      let rafId = 0;
      scrollEl.addEventListener("scroll", () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => { rafId = 0; updateActiveDot(); });
      }, { passive: true });
    }
  }

 // --- 卡片点击 ---
  dock.addEventListener("click", (e) => {
    // "开始导航"按钮（其他项目区域）
    const addBtn = e.target.closest("[data-action=add-recommend]");
    if (addBtn) {
      e.stopPropagation();
      const card = addBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (!id) return;
      const item = allAttractions.find((a) => String(a.id) === String(id));
      if (!item) return;
      // 标记为手动加入推荐（新增项目置顶），并重新渲染（项目移到推荐区域）
      const idStr = String(id);
      if (!manualRecommendIds.has(idStr)) {
        // 重建 Set，将新 id 放在最前面
        const prev = [...manualRecommendIds];
        manualRecommendIds.clear();
        manualRecommendIds.add(idStr);
        prev.forEach(x => manualRecommendIds.add(x));
      }
      attractions = rankRecommendations();
      renderCards();
      renderOtherCards();
      // 中断之前的导航状态，选中当前卡片并开始导航
      selectCard(id);
      // 滚动推荐列表到第一个卡片（即新增项目）
      const scrollContainer = dock.querySelector(".planner-dock__scroll");
      if (scrollContainer) scrollContainer.scrollTo({ left: 0, behavior: "smooth" });
      const navBtnNew = dock.querySelector(`.detail__card[data-id="${id}"] [data-action=navigate]`);
      if (navBtnNew) {
        navBtnNew.classList.add("is-navigating");
        navBtnNew.textContent = "导航中...";
      }
      navActiveForCard = true;
      activeCardId = id;
      window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id, attraction: item } }));
      window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
      window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id, active: true } }));
      // 记录待选中卡片，收起后由 setDockState 统一处理滚动
      _pendingNavCardId = id;
      // 导航激活后将面板收起
      setDockState("collapsed");
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
          // 通知3D场景取消导航状态
          if (navActiveForCard) {
            window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id: activeCardId, active: false } }));
          }
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
        navBtn.textContent = "导航中...";
        navActiveForCard = true;
        window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
        window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id, active: true } }));
        // 记录待选中卡片，收起后由 setDockState 统一处理滚动
        _pendingNavCardId = id;
        // 导航激活后将面板收起
        setDockState("collapsed");
      } else {
        // 未选中卡片上点击"开始导航"按钮，先选中卡片再触发导航
        selectCard(id);
        // selectCard 不会自动激活导航按钮，这里显式标记为"导航中"
        navBtn.classList.add("is-navigating");
        navBtn.textContent = "导航中...";
        navActiveForCard = true;
        // 与地图点击保持一致的事件格式：同时携带 id 与 attraction
        const __navItem = allAttractions.find((a) => String(a.id) === String(id));
        window.dispatchEvent(new CustomEvent("attraction-clicked", { detail: { id, attraction: __navItem } }));
        window.dispatchEvent(new CustomEvent("quick-navigate", { detail: { id } }));
        // 记录待选中卡片，收起后由 setDockState 统一处理滚动
        _pendingNavCardId = id;
        // 导航激活后将面板收起
        setDockState("collapsed");
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
        // 新版推荐卡片：仅在必玩项目上有 .rec-card__tag，需更新文案为「已玩N次」+ is-played 紫色样式
        const attractionItem = allAttractions.find((x) => String(x.id) === String(id))
          || attractions.find((x) => String(x.id) === String(id));
        const isMustPlayItem = isMustPlayAttraction(attractionItem);
        const recTag = card.querySelector(".rec-card__tag");
        if (recTag && isMustPlayItem) {
          recTag.textContent = `已玩${count}次`;
          recTag.classList.add("is-played");
          recTag.classList.remove("is-closed");
        }
        // 兼容"其他项目"卡片旧结构：隐藏"待玩"标签，更新"已玩N次"
        const nextTag = card.querySelector(".planner-dock__card-next");
        if (nextTag) nextTag.style.display = "none";
        const playedTag = card.querySelector(".detail__played-count");
        if (playedTag) {
          playedTag.style.display = "";
          playedTag.textContent = `已玩${count}次`;
        }
        window.dispatchEvent(new CustomEvent("attraction-done", { detail: { id, count } }));

        const isFromOther = !!card.closest("#other-attractions-scroll");
        if (isFromOther) {
          // "其他项目"标记为 done 时，始终移除 is-active 并清除选中态
          card.classList.remove("is-active");
          const navBtn2 = card.querySelector("[data-action=navigate]");
          if (navBtn2) { navBtn2.classList.remove("is-navigating"); navBtn2.textContent = "开始导航"; }
          if (String(activeCardId) === String(id)) {
            // 通知3D场景取消导航状态
            if (navActiveForCard) {
              window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id: activeCardId, active: false } }));
            }
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
              // 通知3D场景取消导航状态
              if (navActiveForCard) {
                window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id: activeCardId, active: false } }));
              }
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

    // 修复：点击其他卡片不应取消当前导航。
    // 之前会在导航激活时派发 navigation-toggled { active: false } 取消导航，
    // 现移除该逻辑，仅在用户主动点击"导航中..."按钮时才取消导航。
    // if (navActiveForCard) {
    //   window.dispatchEvent(new CustomEvent("navigation-toggled", { detail: { id: activeCardId, active: false } }));
    // }

    selectCard(id);

    // 仅派发选中事件用于相机聚焦，不自动开启路线导航；
    // 导航需由用户点击"开始导航"按钮显式触发。
    // 与地图点击（interaction.js）保持一致的 detail 格式：同时携带 id 与 attraction。
    const __cardItem = allAttractions.find((a) => String(a.id) === String(id));
    console.log('[LINKAGE] card clicked, dispatching attraction-clicked, id:', id);
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

   // --- 监听3D地图标签"开始导航"事件，同步面板为"导航中"状态 ---
  window.addEventListener("start-navigation", (e) => {
    const id = e.detail?.id;
    if (!id) return;

    const idStr = String(id);

    // 1. 如果项目不在推荐列表中，加入手动推荐首位
    const inList = attractions.some(a => String(a.id) === idStr);
    if (!inList) {
      const prev = [...manualRecommendIds];
      manualRecommendIds.clear();
      manualRecommendIds.add(idStr);
      prev.forEach(x => manualRecommendIds.add(x));
      attractions = rankRecommendations();
      renderCards();
      renderOtherCards();
    }

    // 2. 选中卡片
    selectCard(id);

    // 3. 设为导航中状态（selectCard 默认不开启导航，需手动覆盖）
    activeCardId = idStr;
    navActiveForCard = true;

    const navBtn = dock.querySelector(`.detail__card[data-id="${idStr}"] [data-action=navigate]`);
    if (navBtn) {
      navBtn.classList.add("is-navigating");
      navBtn.textContent = "导航中...";
    }

    // 4. 滚动到该卡片位置
    const scrollContainer = dock.querySelector(".planner-dock__scroll");
    const targetCard = dock.querySelector(`.detail__card[data-id="${idStr}"]`);
    if (scrollContainer && targetCard) {
      scrollContainer.scrollTo({ left: targetCard.offsetLeft - 16, behavior: "smooth" });
    }
  });

  // --- 监听地图点击，对应卡片进入与面板点击完全一致的选中态 ---
  // 复用 selectCard 以保证视觉效果（is-active 高亮、紫色边框等）与
  // 面板内直接点击卡片完全一致；selectCard 自身已包含 scrollIntoView。
  window.addEventListener("attraction-clicked", (e) => {
    try {
      const id = e.detail?.id || e.detail?.attraction?.id;
      if (!id) return;
      console.log('[LINKAGE] plannerApp received attraction-clicked, selecting card:', id);
      selectCard(id);
    } catch (err) {
      console.error('[LINKAGE] plannerApp attraction-clicked listener error:', err);
    }
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
  }

  // 首次加载
  loadData().then(() => {
    // 启动保护期：loadData 完成后再等 15 秒，确保 LBS 首次定位等异步事件
    // 充分建立稳定基线后才允许 opportunity toast 弹出
    setTimeout(() => { appReady = true; }, 15_000);
  });


  // --- 测试按钮：模拟低排队（仅必玩+热门项目，每分钟自动推送一个） ---
  function isInMustOrPopularPool(a) {
    const candidates = [a.name, a.name_cn].filter(Boolean);
    const combined = [...mustPlayList, ...popularList];
    return combined.some(m => candidates.some(c => c.includes(m) || m.includes(c)));
  }

  function fireSimulateLowWait() {
    if (allAttractions.length === 0) return;

    // 仅从必玩+热门项目中选取当前排队>5分钟的
    const pool = allAttractions.filter(a => {
      if (!isInMustOrPopularPool(a)) return false;
      const w = waitMap[a.id];
      return !w || w.waitMinutes > 5;
    });
    if (pool.length === 0) return;

    const target = pool[Math.floor(Math.random() * pool.length)];
    waitMap[target.id] = { waitMinutes: 5, status: 'open' };
    explicitLowWaitIds.add(String(target.id));

    // 保护当前选中/导航中的卡片：将其加入手动推荐以确保不被挤出推荐列表
    if (activeCardId) {
      manualRecommendIds.add(String(activeCardId));
    }

    // 重新排序并渲染
    attractions = rankRecommendations();
    renderCards();
    renderOtherCards();

    // 兜底恢复选中/导航中卡片的视觉状态（防止 DOM 重建后丢失）
    if (activeCardId) {
      const activeCard = dock.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard) {
        activeCard.classList.add("is-active");
        activeCard.classList.remove("is-loading-in");
        activeCard.style.animationDelay = "";
        const navBtn = activeCard.querySelector("[data-action=navigate]");
        if (navBtn) {
          if (navActiveForCard) {
            navBtn.classList.add("is-navigating");
            navBtn.textContent = "导航中...";
          } else {
            navBtn.classList.remove("is-navigating");
            navBtn.textContent = "开始导航";
          }
        }
      }
    }

    // 通知排队标签刷新
    window.dispatchEvent(new CustomEvent('waittimes-updated', { detail: { waitMap } }));

    // 触发 push 提醒
    showOpportunityToast(target.name, 5);

    console.log('[simulate-low-wait]', target.name, '排队时间已设为5分钟（必玩/热门）');
  }

  // 手动触发
  window.addEventListener('simulate-low-wait', () => fireSimulateLowWait());

  // 每60秒自动推送一个低排队（mock）
  let _lowWaitAutoTimer = null;
  window.addEventListener('simulate-low-wait-auto', () => {
    if (_lowWaitAutoTimer) { clearInterval(_lowWaitAutoTimer); _lowWaitAutoTimer = null; console.log('[simulate-low-wait] 自动推送已停止'); return; }
    _lowWaitAutoTimer = setInterval(() => fireSimulateLowWait(), 60000);
    fireSimulateLowWait(); // 立即触发第一个
    console.log('[simulate-low-wait] 自动推送已启动，每60秒推送一个必玩/热门低排队项目');
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
      const waitHtml = buildWaitHtml(a, wait, parkClosed ? 'wait-color--closed' : waitCls);
      const waitDisplayCls = parkClosed ? 'wait-color--closed' : waitCls;
      waitEls.forEach((waitEl) => {
        waitEl.innerHTML = waitHtml;
        waitEl.className = `detail__wait`;
      });
    }
  }

  // --- 更新"上次刷新时间"标签（相对时间格式）---
  function updateRefreshTime() {
    const el = dock.querySelector("#planner-refresh-time");
    if (!el) return;
    const diff = Math.floor((Date.now() - lastRefreshTime) / 1000); // 秒
    if (diff < 10) {
      el.textContent = '刚刚刷新';
    } else if (diff < 60) {
      el.textContent = `${diff}秒前刷新`;
    } else {
      const min = Math.floor(diff / 60);
      el.textContent = `${min}分钟前刷新`;
    }
  }

  // --- 每60秒自动刷新推荐项目 ---
  refreshTimer = setInterval(async () => {
    const waitList = await fetchWaitTimes();
    waitMap = {};
    for (const w of waitList) {
      waitMap[w.id] = w;
    }
    // 保护当前导航中的项目：如果 activeCardId 对应的卡片正在导航，将其保留在手动推荐中
    if (activeCardId && navActiveForCard) {
      manualRecommendIds.add(String(activeCardId));
    }
    attractions = rankRecommendations();
    renderCards();
    renderOtherCards();

    // 兜底：renderCards / renderOtherCards 内部已基于 activeCardId / navActiveForCard 恢复
    // 视觉状态，但定时刷新会整体重建 DOM 并叠加 is-loading-in 入场动效，
    // 跨容器（推荐区 ↔ 其他项目）查询或时序错位时可能漏恢复。这里在两次 render 之后
    // 用 dock 范围的全局查询再次显式应用「is-active + 导航按钮」状态，确保导航中
    // 卡片在刷新后视觉一致。
    if (activeCardId) {
      const activeCard = dock.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard) {
        // 已完成的卡片不应保留选中态
        if (!playedCounts.has(activeCardId)) {
          activeCard.classList.add("is-active");
          // 选中态卡片禁用入场位移动效，避免与 is-active 高亮叠加产生抖动
          activeCard.classList.remove("is-loading-in");
          activeCard.style.animationDelay = "";
        }
        const navBtn = activeCard.querySelector("[data-action=navigate]");
        if (navBtn) {
          if (navActiveForCard) {
            navBtn.classList.add("is-navigating");
            navBtn.textContent = "导航中...";
          } else {
            navBtn.classList.remove("is-navigating");
            navBtn.textContent = "开始导航";
          }
        }
      }
    }

    lastRefreshTime = Date.now(); // 更新刷新时间戳
    updateRefreshTime();
  }, 60_000);

  // 每30秒更新相对时间显示
  refreshDisplayTimer = setInterval(() => {
    updateRefreshTime();
  }, 30_000);

  // 首次加载完成后初始化刷新时间
  lastRefreshTime = Date.now();
  updateRefreshTime();

  return { dock, setCollapsed, expand: () => setCollapsed(false) };
}
