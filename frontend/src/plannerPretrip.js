/**
 * 底部悬浮面板 —— 行前模式（预测排队时间）
 * 基于 plannerApp.js 结构，关键差异：
 * - 使用 mock 预测数据（无 API 轮询）
 * - 排队时间显示为"预测X分钟"格式
 * - 无 LBS 距离计算
 * - 推荐逻辑：基于预测排队时间短的优先
 */
import { waitColorClass } from "./config.js";
import { ATTRACTIONS_MOCK, PREDICTED_WAITS, getCurrentPredictedWaits } from "./mockPredictions.js";
import { setRecommendedIds } from "./recommendedStore.js";

export function mountPlannerPretrip() {
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
    <div class="planner-titlebar__tip-banner"><svg class="planner-titlebar__tip-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="6.5" stroke="white"/><path d="M7 3.5V7.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10" r="0.7" fill="white"/></svg>入园当日打开可获得实时游玩建议，让你玩更爽<button type="button" class="planner-titlebar__tip-close" aria-label="关闭提示"><svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.19922 1.2002L17.1992 17.2002M17.1992 1.2002L1.19922 17.2002" stroke="rgba(255,255,255,0.5)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
  `;
  document.body.appendChild(titlebar);

  // tip-banner 关闭按钮
  titlebar.querySelector(".planner-titlebar__tip-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const banner = titlebar.querySelector(".planner-titlebar__tip-banner");
    if (banner) banner.style.display = "none";
  });

  // tip-banner 延迟2秒后动效出现
  const tipBanner = titlebar.querySelector(".planner-titlebar__tip-banner");
  if (tipBanner) {
    setTimeout(() => {
      tipBanner.classList.add("is-visible");
    }, 2000);
  }


  // 返回按钮事件
  titlebar.querySelector(".planner-titlebar__btn--back")?.addEventListener("click", (e) => {
    e.preventDefault();
  });

  // 状态栏时间
  const timeEl = titlebar.querySelector("#planner-titlebar-time");
  const renderStatusBarTime = () => {
    if (!timeEl) return;
    const d = new Date();
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    timeEl.textContent = `${hh}:${mm}`;
  };
  renderStatusBarTime();
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
      <h2 class="planner-dock__title-gradient">提前规划游玩项目，让你省时玩更多<span class="planner-dock__refresh-time" id="planner-refresh-time"></span></h2>
      <div class="planner-dock__date-tabs" id="planner-date-tabs">
        <div class="planner-dock__date-tab is-active" data-date="2025-06-16">
          <span class="planner-dock__date-tab-main">6月16日<span class="planner-dock__date-tab-sub">高峰</span></span>
        </div>
        <div class="planner-dock__date-tab" data-date="2025-06-17">
          <span class="planner-dock__date-tab-main">6月17日</span>
        </div>
        <span class="planner-dock__date-tabs-indicator" id="planner-date-indicator"></span>
      </div>
      <div class="planner-dock__scroll" id="planner-dock-scroll"></div>
      <div class="planner-dock__dots" id="planner-dock-dots" aria-hidden="true"></div>
      <h2 class="planner-dock__section-title other-attractions__title" id="other-attractions-title" style="display:none">其他全部项目</h2>
      <div class="other-attractions__scroll" id="other-attractions-scroll"></div>
    </div>
  `;

  document.body.appendChild(dock);

  // --- home-indicator（handle-bar）样式对齐 planner-dock__dots ---
  const handleBtn = dock.querySelector(".planner-dock__handle");
  if (handleBtn) {
    handleBtn.style.padding = "6px 0 8px";
  }
  const handleBar = dock.querySelector(".planner-dock__handle-bar");
  if (handleBar) {
    handleBar.style.width = "36px";
    handleBar.style.height = "3px";
    handleBar.style.borderRadius = "1.5px";
    handleBar.style.background = "#CCCCFF";
  }

  // --- 日期tab切换 ---
  const dateTabsContainer = dock.querySelector("#planner-date-tabs");
  const dateTabs = dock.querySelectorAll(".planner-dock__date-tab");
  const dateIndicator = dock.querySelector("#planner-date-indicator");

  function moveDateIndicator(tab) {
    if (!dateIndicator || !dateTabsContainer) return;
    const containerRect = dateTabsContainer.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const offsetLeft = tabRect.left - containerRect.left + (tabRect.width - 24) / 2;
    dateIndicator.style.transform = `translateX(${offsetLeft}px)`;
  }

  // 初始位置
  const activeDateTab = dock.querySelector(".planner-dock__date-tab.is-active");
  if (activeDateTab && dateIndicator) {
    requestAnimationFrame(() => moveDateIndicator(activeDateTab));
  }

  dateTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      dateTabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      moveDateIndicator(tab);
      // 切换日期时重新加载推荐
      loadPredictedData();
    });
  });

  // --- 时段选择器状态 ---
  let currentSlot = getCurrentTimeSlot();
  let attractions = []; // 当前推荐
  let allAttractions = ATTRACTIONS_MOCK.slice();
  let waitMap = {}; // id -> { waitMinutes, status }
  let activeCardId = null;
  const playedCounts = new Map();
  const wantedIds = new Set(); // 记住用户点击"想玩"的项目ID

  // 推荐理由映射
  const REASON_MAP = {
    "zootopia-hot-pursuit": "入园后首冲，下午人更多",
    "mine": "上午排队较短，建议优先体验",
    "pirates": "全天排队均匀，午后可安排",
    "winnie-the-pooh": "适合下午休息时段体验",
    "peter-pan": "午后排队变长，建议上午玩",
    "buzz": "排队较短，可穿插安排",
    "dumbo": "轻松项目，随时可玩",
    "tron": "高峰日排队最长，建议开园首冲或尾场",
    "soaring": "体验时长8分钟，高峰日建议午间错峰",
    "thunder": "漂流项目，夏季高峰建议下午体验避暑",
    "rex-racer": "排队时间中等，适合穿插安排",
    "hunny-pot-spin": "亲子轻松项目，随时可安排"
  };

  // 6月17日推荐理由（非高峰日，2日游第二天，兼顾亲子/情侣）
  const REASON_MAP_0617 = {
    "pirates": "非高峰日排队更短，亲子情侣都适合的沉浸体验",
    "soaring": "平日排队约30分钟，适合第二天从容体验",
    "peter-pan": "梦幻世界经典项目，亲子首选，平日几乎免排",
    "hunny-pot-spin": "轻松旋转类项目，适合带小朋友或情侣放松",
    "thunder": "漂流类体验，非高峰日排队时间减半",
    "rex-racer": "刺激但排队短，情侣最爱的冲刺体验",
    "winnie-the-pooh": "温馨故事线，亲子家庭必体验项目",
    "tron": "第二天补玩首选，平日排队缩短近一半",
    "zootopia-hot-pursuit": "平日人流少，无需首冲也能短时排队",
    "mine": "平日排队约20分钟，亲子家庭轻松体验",
    "buzz": "互动射击项目，亲子情侣都适合，几乎不排队",
    "dumbo": "经典旋转飞行，幼儿最爱，平日随到随玩",
    "fantasia-carousel": "平日几乎免排，梦幻世界打卡必选",
    "slinky-dog-spin": "平日排队不超过20分钟，亲子家庭最爱",
    "jet-packs": "飞行体验，平日几乎无需等待",
    "crystal-grotto": "平日轻松乘船，适合情侣浪漫体验",
    "camp-discovery": "户外攀爬探险，平日随到随玩"
  };

  // 6月17日推荐项目顺序（第二天策略：补充前一天未玩 + 平日优势项目）
  const FIXED_ORDER_0617 = [
    "pirates",
    "soaring",
    "peter-pan",
    "hunny-pot-spin",
    "thunder",
    "rex-racer",
    "winnie-the-pooh"
  ];

  function isJune17Active() {
    const activeTab = dock.querySelector(".planner-dock__date-tab.is-active");
    return activeTab && activeTab.dataset.date === "2025-06-17";
  }

  // 必玩挑战
  const mustPlayList = [
    "创极速光轮",
    "加勒比海盗——沉落宝藏之战",
    "七个小矮人矿山车",
    "热力追踪",
    "翡翔·飞越地平线",
    "雷鸣山漂流",
  ];

  function isMustPlayAttraction(a) {
    if (!a) return false;
    const candidates = [a.name].filter(Boolean);
    return mustPlayList.some((m) =>
      candidates.some((c) => c.includes(m) || m.includes(c))
    );
  }

  // --- 折叠控制 ---
  function setDockState(state) {
    dock.classList.toggle("is-collapsed", state === "collapsed");
    dock.classList.toggle("is-full", state === "full");
  }

  function setCollapsed(collapsed) {
    setDockState(collapsed ? "collapsed" : "full");
  }

  // --- 把手交互 ---
  const handleEl = dock.querySelector("#planner-dock-handle");
  const DRAG_THRESHOLD = 36;
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
        suppressClick = true;
        const cls = dock.classList;
        if (dy < 0) {
          if (cls.contains("is-collapsed")) setDockState("full");
        } else {
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
      setCollapsed(!dock.classList.contains("is-collapsed"));
    });
  }

  // 判断当前是否闭园时段
  function isParkClosed() {
    const h = new Date().getHours();
    return h >= 21 || h < 8;
  }

  function getClosedText() {
    const h = new Date().getHours();
    const prefix = h >= 21 ? "明日开园" : "今日开园";
    return `今日已闭园 ${prefix} 08:00`;
  }

  // 获取当前时段 slot
  function getCurrentTimeSlot() {
    const h = new Date().getHours();
    const clamped = Math.max(8, Math.min(20, h));
    return `${String(clamped).padStart(2, "0")}:00`;
  }

  // 构造排队时间 HTML（行前版：显示"预测X分钟"）
  // 计算景点全天平均排队时间
  function getAvgWait(id) {
    const slots = PREDICTED_WAITS[id];
    if (!slots) return null;
    const vals = Object.values(slots).filter(v => v != null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  function buildWaitHtml(a, wait, colorCls) {
    const isClosed = wait?.status === "closed";
    let queuePart;
    if (isParkClosed()) {
      queuePart = "今日已闭园";
    } else if (isClosed) {
      queuePart = "暂停排队";
    } else {
      const avg = getAvgWait(a.id);
      queuePart = avg == null ? "预测平均排队时间—" : `预测平均排队时间${avg}分`;
    }
    const minHeight = Number(a?.min_height_cm) || 0;
    const heightPart = minHeight > 0 ? `身高要求${minHeight}cm` : '无身高要求';
    const effectiveCls = isParkClosed() ? 'wait-color--closed' : (isClosed ? ' is-closed' : '');
    return `${heightPart}<svg class="wait-divider" width="1" height="14" viewBox="0 0 1 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="16" fill="#D9D9D9"/></svg><span class="wait-queue-color ${isParkClosed() ? 'wait-color--closed' : colorCls}${effectiveCls}">${queuePart}</span>`;
  }

  // --- 渲染卡片 ---
  function renderCards() {
    setRecommendedIds(attractions.map((a) => a.id));

    const container = dock.querySelector("#planner-dock-scroll");
    if (!container) return;

    if (attractions.length === 0) {
      container.innerHTML = `<span class="planner-dock__empty" style="font-size:12px;color:#6666FF;text-align:left;display:block;">请手动添加你想玩的项目～</span>`;
      renderDots(0);
      return;
    }

    container.innerHTML = attractions
      .map((a, i) => {
        const wait = waitMap[a.id];
        const wm = wait?.waitMinutes;
        const waitCls = waitColorClass(wm);
        const parkClosed = isParkClosed();
        const waitHtml = buildWaitHtml(a, wait, parkClosed ? 'wait-color--closed' : waitCls);
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
          <div class="detail__card rec-card" data-id="${a.id}" style="height:96px">
            <span class="detail__card-remove" data-action="dismiss"><svg viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span>
            <div class="rec-card__head">
              <span class="rec-card__name">${a.name || ''}</span>
              ${tagHtml}
            </div>
            <div class="rec-card__wait detail__wait">${waitHtml}</div>
            <div class="rec-card__dist planner-dock__card-dist"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.50417 0.300548C4.54237 0.197308 4.6884 0.197308 4.7266 0.300548C5.44724 2.24805 6.98272 3.78353 8.93022 4.50417C9.03346 4.54237 9.03346 4.6884 8.93022 4.7266C6.98272 5.44724 5.44724 6.98272 4.7266 8.93022C4.6884 9.03346 4.54237 9.03346 4.50417 8.93022C3.78353 6.98272 2.24805 5.44724 0.300548 4.7266C0.197308 4.6884 0.197308 4.54237 0.300548 4.50417C2.24805 3.78353 3.78353 2.24805 4.50417 0.300548Z" fill="url(#paint0_linear_498_1008)"/><path d="M9.63661 7.53492C9.65571 7.4833 9.72872 7.4833 9.74782 7.53492C10.1081 8.50867 10.8759 9.27641 11.8496 9.63673C11.9013 9.65583 11.9013 9.72884 11.8496 9.74794C10.8759 10.1083 10.1081 10.876 9.74782 11.8498C9.72872 11.9014 9.65571 11.9014 9.63661 11.8498C9.27629 10.876 8.50855 10.1083 7.5348 9.74794C7.48318 9.72884 7.48318 9.65583 7.5348 9.63673C8.50855 9.27641 9.27629 8.50867 9.63661 7.53492Z" fill="url(#paint1_linear_498_1008)"/><defs><linearGradient id="paint0_linear_498_1008" x1="0.373303" y1="1.19745" x2="9.14803" y2="7.28043" gradientUnits="userSpaceOnUse"><stop stop-color="#6666FF"/></linearGradient><linearGradient id="paint1_linear_498_1008" x1="7.57117" y1="7.98337" x2="11.9585" y2="11.0249" gradientUnits="userSpaceOnUse"><stop stop-color="#6666FF"/></linearGradient></defs></svg>${(isJune17Active() ? REASON_MAP_0617[a.id] : REASON_MAP[a.id]) || a.zone || ''}</div>
            <div class="rec-card__actions detail__actions" style="display:none">
              <button type="button" class="rec-card__btn rec-card__btn--secondary btn btn--secondary" data-action="mark-done">已玩过</button>
              <button type="button" class="rec-card__btn rec-card__btn--primary btn btn--primary" data-action="navigate">查看详情</button>
            </div>
          </div>`;
      })
      .join("");

    // 恢复选中态
    if (activeCardId) {
      const activeCard = container.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard) {
        activeCard.classList.add("is-active");
      }
    }

    renderDots(attractions.length);
    updateActiveDot();

    // 卡片入场动效
    const allCards = container.querySelectorAll(".detail__card");
    allCards.forEach((card, i) => {
      card.classList.add("is-loading-in");
      card.style.animationDelay = `${i * 80}ms`;
      card.addEventListener("animationend", () => {
        card.classList.remove("is-loading-in");
        card.classList.add("is-loaded");
        card.style.animationDelay = "";
      }, { once: true });
    });
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
    const step = cards[0].getBoundingClientRect().width + 12;
    const idx = Math.max(0, Math.min(dots.length - 1, Math.round(scrollEl.scrollLeft / step)));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
  }

  // --- 渲染"其他项目"卡片 ---
  function renderOtherCards() {
    const container = dock.querySelector("#other-attractions-scroll");
    const titleEl = dock.querySelector("#other-attractions-title");
    if (!container) return;

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
        const parkClosed = isParkClosed();
        const waitHtml = buildWaitHtml(a, wait, parkClosed ? 'wait-color--closed' : waitCls);
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
          <div class="detail__card rec-card other-attractions__card" data-id="${a.id}" style="height:96px">
            <button type="button" class="rec-card__btn rec-card__btn--secondary btn btn--secondary other-card__want-btn" data-action="want-play" style="position:absolute;right:9px;top:9px;width:auto;padding:4px 12px;margin:0;font-size:12px;line-height:18px;border-radius:8px;z-index:2">想玩</button>
            <div class="rec-card__head">
              <span class="rec-card__name">${a.name || ''}</span>
              ${tagHtml}
            </div>
            <div class="rec-card__wait detail__wait">${waitHtml}</div>
            <div class="rec-card__dist planner-dock__card-dist"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.50417 0.300548C4.54237 0.197308 4.6884 0.197308 4.7266 0.300548C5.44724 2.24805 6.98272 3.78353 8.93022 4.50417C9.03346 4.54237 9.03346 4.6884 8.93022 4.7266C6.98272 5.44724 5.44724 6.98272 4.7266 8.93022C4.6884 9.03346 4.54237 9.03346 4.50417 8.93022C3.78353 6.98272 2.24805 5.44724 0.300548 4.7266C0.197308 4.6884 0.197308 4.54237 0.300548 4.50417C2.24805 3.78353 3.78353 2.24805 4.50417 0.300548Z" fill="url(#paint0_linear_498_1008)"/><path d="M9.63661 7.53492C9.65571 7.4833 9.72872 7.4833 9.74782 7.53492C10.1081 8.50867 10.8759 9.27641 11.8496 9.63673C11.9013 9.65583 11.9013 9.72884 11.8496 9.74794C10.8759 10.1083 10.1081 10.876 9.74782 11.8498C9.72872 11.9014 9.65571 11.9014 9.63661 11.8498C9.27629 10.876 8.50855 10.1083 7.5348 9.74794C7.48318 9.72884 7.48318 9.65583 7.5348 9.63673C8.50855 9.27641 9.27629 8.50867 9.63661 7.53492Z" fill="url(#paint1_linear_498_1008)"/><defs><linearGradient id="paint0_linear_498_1008" x1="0.373303" y1="1.19745" x2="9.14803" y2="7.28043" gradientUnits="userSpaceOnUse"><stop stop-color="#6666FF"/></linearGradient><linearGradient id="paint1_linear_498_1008" x1="7.57117" y1="7.98337" x2="11.9585" y2="11.0249" gradientUnits="userSpaceOnUse"><stop stop-color="#6666FF"/></linearGradient></defs></svg>${(isJune17Active() ? REASON_MAP_0617[a.id] : REASON_MAP[a.id]) || a.zone || ''}</div>
            <div class="rec-card__actions detail__actions" style="display:none">
              <button type="button" class="rec-card__btn rec-card__btn--secondary btn btn--secondary" data-action="mark-done">已玩过</button>
              <button type="button" class="rec-card__btn rec-card__btn--primary btn btn--primary" data-action="navigate">查看详情</button>
            </div>
          </div>`;
      })
      .join("");

    if (activeCardId) {
      const activeCard = container.querySelector(`.detail__card[data-id="${activeCardId}"]`);
      if (activeCard && !playedCounts.has(activeCardId)) {
        activeCard.classList.add("is-active");
      }
    }
  }

  // --- 固定推荐顺序 ---
  const FIXED_ORDER = [
    "zootopia-hot-pursuit", // 疯狂动物城
    "mine",                 // 七小矮人
    "pirates",              // 加勒比
    "winnie-the-pooh",      // 小熊维尼
    "peter-pan",            // 小飞侠
    "buzz",                 // 巴斯光年
    "dumbo"                 // 小飞象
  ];

  // --- 智能推荐排序 ---
  function rankRecommendations() {
    // 获取当前选中日期
    const activeTab = dock.querySelector(".planner-dock__date-tab.is-active");
    const activeDate = activeTab ? activeTab.dataset.date : "2025-06-16";
    const isJune17 = activeDate === "2025-06-17";
    const order = isJune17 ? FIXED_ORDER_0617 : FIXED_ORDER;

    const idMap = new Map(allAttractions.map(a => [a.id, a]));
    const result = [];
    for (const id of order) {
      if (playedCounts.has(id)) continue;
      const a = idMap.get(id);
      if (!a) continue;
      const w = waitMap[id];
      if (w?.status === 'closed') continue;
      result.push(a);
    }

    // 保底
    if (result.length === 0) {
      const fallback = allAttractions.find(a => waitMap[a.id]?.status !== 'closed');
      if (fallback) result.push(fallback);
    }

    return result;
  }

  // --- 通用卡片选中逻辑 ---
  function selectCard(id) {
    activeCardId = id;

    const card = dock.querySelector(`.detail__card[data-id="${id}"]`);
    if (!card || card.classList.contains("is-active")) return;

    dock.querySelectorAll(".detail__card.is-active").forEach(c => {
      c.classList.remove("is-active");
    });
    card.classList.add("is-active");
    card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  // --- 横滑卡片：同步轮播指示器 ---
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
    // 查看详情按钮（聚焦相机到景点）
    const navBtn = e.target.closest("[data-action=navigate]");
    if (navBtn) {
      const card = navBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (!id) return;
      selectCard(id);
      const item = allAttractions.find((a) => String(a.id) === String(id));
      window.dispatchEvent(
        new CustomEvent("attraction-clicked", { detail: { id, attraction: item } })
      );
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
        // 更新标签
        const attractionItem = allAttractions.find((x) => String(x.id) === String(id));
        const isMustPlayItem = isMustPlayAttraction(attractionItem);
        const recTag = card.querySelector(".rec-card__tag");
        if (recTag && isMustPlayItem) {
          recTag.textContent = `已玩${count}次`;
          recTag.classList.add("is-played");
        }

        if (String(activeCardId) === String(id)) {
          activeCardId = null;
        }
        attractions = rankRecommendations();
        renderCards();
        renderOtherCards();
      }
      return;
    }

    // 想玩按钮（从其他项目加入推荐）
    const wantBtn = e.target.closest("[data-action=want-play]");
    if (wantBtn) {
      e.stopPropagation();
      const card = wantBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (id) {
        wantedIds.add(id); // 记住用户选择
        const item = allAttractions.find(a => String(a.id) === String(id));
        if (item && !attractions.some(a => String(a.id) === String(id))) {
          attractions.push(item);
        }
        renderCards();
        renderOtherCards();
      }
      return;
    }

    // 关闭按钮（从推荐中移除，转入其他项目）
    const dismissBtn = e.target.closest("[data-action=dismiss]");
    if (dismissBtn) {
      e.stopPropagation();
      const card = dismissBtn.closest(".detail__card");
      const id = card?.dataset.id;
      if (id) {
        wantedIds.delete(id); // 清除用户选择记录
        attractions = attractions.filter(a => String(a.id) !== String(id));
        if (String(activeCardId) === String(id)) activeCardId = null;
        renderCards();
        renderOtherCards();
      }
      return;
    }

    // 卡片点击选中
    const card = e.target.closest(".detail__card");
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;

    // "其他全部项目"区域的卡片不可点击选中，仅"想玩"按钮可用
    if (card.closest("#other-attractions-scroll")) return;

    // 如果浮层处于展开态，先收起浮层
    if (dock.classList.contains("is-full")) {
      setCollapsed(true);
    }

    selectCard(id);
    const __cardItem = allAttractions.find((a) => String(a.id) === String(id));
    window.dispatchEvent(
      new CustomEvent("attraction-clicked", { detail: { id, attraction: __cardItem } })
    );
  });

  // --- 监听地图点击 ---
  window.addEventListener("attraction-clicked", (e) => {
    const id = e.detail?.id || e.detail?.attraction?.id;
    if (!id) return;
    selectCard(id);
  });

  // --- 加载预测数据 ---
  function loadPredictedData() {
    currentSlot = getCurrentTimeSlot();
    const predicted = getCurrentPredictedWaits();
    waitMap = predicted;
    attractions = rankRecommendations();

    // 追加用户手动"想玩"的项目（保留跨Tab切换）
    for (const wid of wantedIds) {
      if (!attractions.some(a => String(a.id) === String(wid))) {
        const item = allAttractions.find(a => String(a.id) === String(wid));
        if (item) attractions.push(item);
      }
    }
    renderCards();
    renderOtherCards();

    // 更新刷新时间标签
    const el = dock.querySelector("#planner-refresh-time");
    if (el) el.textContent = `AI智能预测`;
  }

  // 首次加载
  loadPredictedData();

  return { dock, setCollapsed, expand: () => setCollapsed(false) };
}
