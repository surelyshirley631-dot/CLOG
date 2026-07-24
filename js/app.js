import { bindBrewsUi, refillLastBrewIfConfirmed, bindHomeBrewsPreview } from "./brews.js";
import { bindBeansUi } from "./beans.js";
import { bindGrindersUi } from "./grinders.js";
import { bindMachinesUi } from "./machines.js";
import { bindCoffeeCalendarUi } from "./calendar.js";
import { bindSyncStatusUi, initSyncStatus, saveCloudSyncSettings, syncAllDataToCloud } from "./sync.js";
import {
  exportAll,
  importAll,
  resetAll,
  migrateIfNeeded,
  loadKnowledgeEntries,
  saveKnowledgeEntries,
  loadSelectedKnowledgeScopes,
  saveSelectedKnowledgeScopes,
  loadAiSettings,
  saveAiSettings,
  loadSyncSettings
} from "./storage.js";

const PANEL_IDS = ["home", "tab-brew", "tab-mybrews", "tab-calendar", "tab-beans", "tab-grinders", "tab-machines", "tab-rules", "tab-settings"];
const SWIPE_PANEL_IDS = PANEL_IDS.filter(id => id !== "tab-settings");
let currentPanelId = "home";
let isPanelAnimating = false;
const DEFAULT_FIREBASE_SYNC_CONFIG = {
  apiKey: "AIzaSyBUrRIeYFS7bTgasKAXtzdumrso0fjK9SA",
  authDomain: "mybrewsshirley.firebaseapp.com",
  projectId: "mybrewsshirley",
  storageBucket: "mybrewsshirley.firebasestorage.app",
  messagingSenderId: "423587761001",
  appId: "1:423587761001:web:00f9312129383cb19ccbf8"
};

function normalizeScopeId(value) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `scope-${Date.now()}`;
}

function splitKnowledgeText(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return [];
  const blocks = raw
    .split(/\n{2,}/)
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (blocks.length) return blocks;
  return [raw];
}

function extractKnowledgeChunks(rawText) {
  const trimmed = String(rawText || "").replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object" && item.content) return String(item.content).trim();
          return "";
        })
        .filter(Boolean);
    }
    if (parsed && typeof parsed === "object") {
      const list = parsed.items || parsed.entries || parsed.knowledgeEntries;
      if (Array.isArray(list)) {
        return list
          .map(item => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object" && item.content) return String(item.content).trim();
            return "";
          })
          .filter(Boolean);
      }
      if (typeof parsed.content === "string") {
        return splitKnowledgeText(parsed.content);
      }
    }
  } catch {}
  return splitKnowledgeText(trimmed);
}

function summarizeScopes(entries) {
  const scopeMap = new Map();
  entries.forEach(entry => {
    const scopeId = entry.scopeId || "default";
    const scopeName = entry.scopeName || "Default";
    const current = scopeMap.get(scopeId) || { scopeId, scopeName, count: 0, updatedAt: entry.createdAt || "" };
    current.count += 1;
    if ((entry.createdAt || "") > (current.updatedAt || "")) {
      current.updatedAt = entry.createdAt || "";
    }
    scopeMap.set(scopeId, current);
  });
  return Array.from(scopeMap.values()).sort((a, b) => String(a.scopeName).localeCompare(String(b.scopeName)));
}

function stripMediaDeep(value) {
  if (Array.isArray(value)) {
    return value.map(item => stripMediaDeep(item));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      const maybeBase64 = value.startsWith("data:image/") || /^[A-Za-z0-9+/=\s]{4000,}$/.test(value);
      return maybeBase64 ? "" : value;
    }
    return value;
  }
  const next = {};
  Object.keys(value).forEach(key => {
    const lower = key.toLowerCase();
    if (lower.includes("photo") || lower.includes("image") || lower.includes("avatar") || lower.includes("thumbnail") || lower.includes("dataurl")) {
      next[key] = "";
      return;
    }
    next[key] = stripMediaDeep(value[key]);
  });
  return next;
}

function isBeansPath(pathSegments) {
  return pathSegments.some(seg => seg === "beans" || seg === "clog_beans");
}

function stripNonBeanMediaDeep(value, path = []) {
  if (Array.isArray(value)) {
    return value.map(item => stripNonBeanMediaDeep(item, path));
  }
  const inBeans = isBeansPath(path);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      const maybeBase64 = value.startsWith("data:image/") || /^[A-Za-z0-9+/=\s]{4000,}$/.test(value);
      if (maybeBase64 && !inBeans) return "";
    }
    return value;
  }
  const next = {};
  Object.keys(value).forEach(key => {
    const lower = key.toLowerCase();
    const nextPath = [...path, lower];
    if (lower.includes("photo") || lower.includes("image") || lower.includes("avatar") || lower.includes("thumbnail") || lower.includes("dataurl")) {
      if (isBeansPath(nextPath)) {
        next[key] = stripNonBeanMediaDeep(value[key], nextPath);
      } else {
        next[key] = "";
      }
      return;
    }
    next[key] = stripNonBeanMediaDeep(value[key], nextPath);
  });
  return next;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-load-failed"));
    image.src = dataUrl;
  });
}

async function compressDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.length < 300000) return dataUrl;
  try {
    const image = await loadImageFromDataUrl(dataUrl);
    const edgeSteps = [1600, 1280, 1024, 900, 768];
    const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.44];
    let best = dataUrl;
    for (const maxEdge of edgeSteps) {
      const ratio = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0, width, height);
      for (const quality of qualitySteps) {
        const compressed = canvas.toDataURL("image/jpeg", quality);
        if (compressed.length < best.length) {
          best = compressed;
        }
      }
    }
    return best;
  } catch {
    return dataUrl;
  }
}

async function optimizeImportMedia(value, parentKey = "") {
  if (Array.isArray(value)) {
    const items = [];
    for (const item of value) {
      items.push(await optimizeImportMedia(item, parentKey));
    }
    return items;
  }
  if (!value || typeof value !== "object") {
    const maybeMediaKey =
      parentKey.includes("photo") || parentKey.includes("image") || parentKey.includes("avatar") || parentKey.includes("thumbnail") || parentKey.includes("dataurl");
    if (typeof value === "string" && (value.startsWith("data:image/") || maybeMediaKey)) {
      return compressDataUrl(value);
    }
    return value;
  }
  const next = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    next[key] = await optimizeImportMedia(value[key], key.toLowerCase());
  }
  return next;
}

function setHeaderFor(targetId) {
  const title = document.getElementById("app-title");
  const subtitle = document.querySelector(".app-subtitle");
  if (!title || !subtitle) return;
  if (targetId === "home") {
    title.textContent = "My Brew";
    subtitle.textContent = "Coffee log for brews, calendar, and beans";
    return;
  }
  if (targetId === "tab-brew") {
    title.textContent = "Brew";
    subtitle.textContent = "Manual brew records and optimization";
    return;
  }
  if (targetId === "tab-mybrews") {
    title.textContent = "My brews";
    subtitle.textContent = "Saved brew data and sorting";
    return;
  }
  if (targetId === "tab-calendar") {
    title.textContent = "Coffee Calendar";
    subtitle.textContent = "Monthly brew stickers and charted coffee habits";
    return;
  }
  if (targetId === "tab-beans") {
    title.textContent = "Beans";
    subtitle.textContent = "Pantry, stock, and freshness window";
    return;
  }
  if (targetId === "tab-grinders") {
    title.textContent = "My grinders";
    subtitle.textContent = "Your grinders library";
    return;
  }
  if (targetId === "tab-machines") {
    title.textContent = "My machines";
    subtitle.textContent = "Espresso and coffee gear";
    return;
  }
  if (targetId === "tab-rules") {
    title.textContent = "Golden Rules";
    subtitle.textContent = "Grinding principles and logic";
    return;
  }
  if (targetId === "tab-settings") {
    title.textContent = "Data";
    subtitle.textContent = "Export, import, and reset";
  }
}

function getPanelIndex(panelId) {
  return SWIPE_PANEL_IDS.indexOf(panelId);
}

function isSwipePanel(panelId) {
  return SWIPE_PANEL_IDS.includes(panelId);
}

function resetPanelTransitionStyles(panel) {
  panel.classList.remove("is-transitioning");
  panel.style.removeProperty("position");
  panel.style.removeProperty("inset");
  panel.style.removeProperty("width");
  panel.style.removeProperty("z-index");
  panel.style.removeProperty("transform");
  panel.style.removeProperty("opacity");
  panel.style.removeProperty("box-shadow");
  panel.style.removeProperty("filter");
}

function clearPanelTransitionShell() {
  const main = document.querySelector(".app-main");
  if (!main) return;
  main.classList.remove("is-panel-transitioning");
  main.style.removeProperty("min-height");
}

function setPanelVisibility(targetId) {
  PANEL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === targetId;
    el.classList.toggle("active", isActive);
    el.style.display = isActive ? "block" : "none";
    resetPanelTransitionStyles(el);
  });
}

function finalizePanelChange(targetId) {
  const main = document.querySelector(".app-main");
  if (main) {
    clearPanelTransitionShell();
    main.scrollTop = 0;
  } else {
    window.scrollTo(0, 0);
  }
  currentPanelId = targetId;
  setHeaderFor(targetId);
  const dataBtn = document.getElementById("data-button");
  if (dataBtn) {
    dataBtn.style.display = targetId === "home" ? "block" : "none";
  }
  const rulesBar = document.querySelector(".home-rules-bar");
  if (rulesBar) {
    rulesBar.style.display = targetId === "home" ? "flex" : "none";
  }
}

function preparePanelTransition(main, fromEl, toEl) {
  const fromHeight = fromEl.offsetHeight;
  toEl.style.display = "block";
  const toHeight = toEl.offsetHeight;
  main.classList.add("is-panel-transitioning");
  main.style.minHeight = `${Math.max(fromHeight, toHeight)}px`;
  [fromEl, toEl].forEach((panel, index) => {
    panel.style.display = "block";
    panel.style.position = "absolute";
    panel.style.inset = "0";
    panel.style.width = "100%";
    panel.style.zIndex = index === 0 ? "1" : "2";
    panel.classList.add("is-transitioning");
  });
}

function applySwipePose(fromEl, toEl, direction, progress, width) {
  const clamped = Math.max(0, Math.min(1, progress));
  const outgoingSign = direction === "forward" ? -1 : 1;
  const incomingSign = -outgoingSign;
  const eased = 1 - Math.pow(1 - clamped, 1.12);
  const edgeResistance = 1 - Math.pow(clamped, 1.82) * 0.1374;
  const outgoingX = outgoingSign * width * 0.17 * eased * edgeResistance;
  const incomingX = incomingSign * width * 0.78 * (1 - eased * 0.985) * edgeResistance;
  const outgoingScale = 1 - eased * 0.018;
  const incomingScale = 0.986 + eased * 0.014;
  const outgoingOpacity = 1 - eased * 0.3;
  const incomingOpacity = 0.8 + eased * 0.2;
  const outgoingShadow = `0 18px 40px rgba(62, 39, 35, ${0.16 + eased * 0.1})`;
  const incomingShadow = `0 24px 54px rgba(62, 39, 35, ${0.18 + eased * 0.12})`;
  fromEl.style.transform = `translate3d(${outgoingX}px, 0, 0) scale(${outgoingScale})`;
  fromEl.style.opacity = String(outgoingOpacity);
  fromEl.style.boxShadow = outgoingShadow;
  fromEl.style.filter = `saturate(${1 - eased * 0.06})`;
  toEl.style.transform = `translate3d(${incomingX}px, 0, 0) scale(${incomingScale})`;
  toEl.style.opacity = String(incomingOpacity);
  toEl.style.boxShadow = incomingShadow;
  toEl.style.filter = `saturate(${0.96 + eased * 0.08})`;
}

function animatePanelChange(fromEl, toEl, direction) {
  const main = document.querySelector(".app-main");
  if (!main || !fromEl || !toEl || fromEl === toEl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setPanelVisibility(toEl ? toEl.id : currentPanelId);
    return Promise.resolve();
  }
  const outgoingSign = direction === "forward" ? -1 : 1;
  const incomingSign = -outgoingSign;
  const panelWidth = main.clientWidth || window.innerWidth || 360;
  const incomingOffset = Math.min(Math.round(panelWidth * 0.62), 300);
  const outgoingOffset = Math.min(Math.round(panelWidth * 0.12), 64);
  preparePanelTransition(main, fromEl, toEl);

  const outgoing = fromEl.animate(
    [
      { transform: "translateX(0) scale(1)", opacity: 1 },
      { transform: `translateX(${outgoingSign * outgoingOffset * 0.88}px) scale(0.992)`, opacity: 0.82, offset: 0.7 },
      { transform: `translateX(${outgoingSign * outgoingOffset}px) scale(0.988)`, opacity: 0.76 }
    ],
    { duration: 340, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)", fill: "forwards" }
  );

  const incoming = toEl.animate(
    [
      { transform: `translateX(${incomingSign * incomingOffset}px) scale(0.992)`, opacity: 0.86 },
      { transform: "translateX(-4px) scale(1.002)", opacity: 0.98, offset: 0.76 },
      { transform: "translateX(0) scale(1)", opacity: 1 }
    ],
    { duration: 360, easing: "cubic-bezier(0.22, 0.9, 0.3, 1)", fill: "forwards" }
  );

  return Promise.allSettled([outgoing.finished, incoming.finished]).then(() => {
    setPanelVisibility(toEl.id);
  });
}

function showPanel(targetId, options = {}) {
  if (!targetId || isPanelAnimating && targetId !== currentPanelId) return;
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;
  if (targetId === currentPanelId) {
    setPanelVisibility(targetId);
    finalizePanelChange(targetId);
    return;
  }
  const currentEl = document.getElementById(currentPanelId);
  const targetIndex = getPanelIndex(targetId);
  const currentIndex = getPanelIndex(currentPanelId);
  const inferredDirection =
    targetIndex !== -1 && currentIndex !== -1 && targetIndex > currentIndex ? "forward" : "backward";
  const direction = options.direction || inferredDirection;
  const shouldAnimate = options.animate !== false;

  if (!shouldAnimate || !currentEl) {
    setPanelVisibility(targetId);
    finalizePanelChange(targetId);
    return;
  }

  isPanelAnimating = true;
  animatePanelChange(currentEl, targetEl, direction)
    .catch(() => {
      setPanelVisibility(targetId);
    })
    .finally(() => {
      isPanelAnimating = false;
      finalizePanelChange(targetId);
    });
}

function isSwipeBlockedTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, button, label, a, summary, [contenteditable='true']"));
}

function initSwipeNavigation() {
  const main = document.querySelector(".app-main");
  if (!main) return;
  const swipeState = {
    startX: 0,
    startY: 0,
    startTime: 0,
    active: false,
    blocked: false,
    dragging: false,
    direction: "",
    targetId: "",
    currentEl: null,
    targetEl: null,
    panelWidth: 0,
    deltaX: 0,
    framePending: false
  };

  const resetSwipeState = () => {
    swipeState.active = false;
    swipeState.blocked = false;
    swipeState.dragging = false;
    swipeState.direction = "";
    swipeState.targetId = "";
    swipeState.currentEl = null;
    swipeState.targetEl = null;
    swipeState.panelWidth = 0;
    swipeState.deltaX = 0;
    swipeState.framePending = false;
  };

  const renderSwipeFrame = () => {
    swipeState.framePending = false;
    if (!swipeState.dragging || !swipeState.currentEl || !swipeState.targetEl) return;
    const progress = Math.min(Math.abs(swipeState.deltaX) / swipeState.panelWidth, 1);
    applySwipePose(swipeState.currentEl, swipeState.targetEl, swipeState.direction, progress, swipeState.panelWidth);
  };

  const restoreCurrentPanel = () => {
    if (swipeState.currentEl) {
      setPanelVisibility(currentPanelId);
      clearPanelTransitionShell();
    }
    resetSwipeState();
  };

  main.addEventListener("touchstart", event => {
    if (event.touches.length !== 1 || isPanelAnimating || !isSwipePanel(currentPanelId)) {
      resetSwipeState();
      return;
    }
    swipeState.startX = event.touches[0].clientX;
    swipeState.startY = event.touches[0].clientY;
    swipeState.startTime = performance.now();
    swipeState.active = true;
    swipeState.blocked = isSwipeBlockedTarget(event.target);
  }, { passive: true });

  main.addEventListener("touchmove", event => {
    if (!swipeState.active || swipeState.blocked || isPanelAnimating) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;

    if (!swipeState.dragging) {
      if (Math.abs(deltaY) > 14 && Math.abs(deltaY) > Math.abs(deltaX)) {
        resetSwipeState();
        return;
      }
      if (Math.abs(deltaX) < 12 || Math.abs(deltaX) < Math.abs(deltaY) * 1.1) return;
      const currentIndex = getPanelIndex(currentPanelId);
      const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
      const nextPanelId = SWIPE_PANEL_IDS[nextIndex];
      if (!nextPanelId) {
        resetSwipeState();
        return;
      }
      swipeState.dragging = true;
      swipeState.direction = deltaX < 0 ? "forward" : "backward";
      swipeState.targetId = nextPanelId;
      swipeState.currentEl = document.getElementById(currentPanelId);
      swipeState.targetEl = document.getElementById(nextPanelId);
      swipeState.panelWidth = main.clientWidth || window.innerWidth || 360;
      if (!swipeState.currentEl || !swipeState.targetEl) {
        resetSwipeState();
        return;
      }
      preparePanelTransition(main, swipeState.currentEl, swipeState.targetEl);
    }

    event.preventDefault();
    swipeState.deltaX = deltaX;
    if (!swipeState.framePending) {
      swipeState.framePending = true;
      window.requestAnimationFrame(renderSwipeFrame);
    }
  }, { passive: false });

  main.addEventListener("touchend", event => {
    if (!swipeState.active || swipeState.blocked || isPanelAnimating) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = swipeState.dragging ? swipeState.deltaX : touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;
    if (swipeState.dragging && swipeState.currentEl && swipeState.targetEl) {
      const elapsed = Math.max(1, performance.now() - swipeState.startTime);
      const velocity = Math.abs(deltaX) / elapsed;
      const progress = Math.min(Math.abs(deltaX) / swipeState.panelWidth, 1);
      const shouldCommit = progress > 0.16 || velocity > 0.42;
      isPanelAnimating = true;
      const direction = swipeState.direction;
      const fromEl = swipeState.currentEl;
      const toEl = swipeState.targetEl;
      const targetId = swipeState.targetId;
      const fromFrames = shouldCommit
        ? [
            { transform: fromEl.style.transform || "translate3d(0px, 0, 0) scale(1)", opacity: Number(fromEl.style.opacity || "1") },
            {
              transform: `translate3d(${direction === "forward" ? -Math.min(swipeState.panelWidth * 0.17, 92) : Math.min(swipeState.panelWidth * 0.17, 92)}px, 0, 0) scale(0.982)`,
              opacity: 0.7
            }
          ]
        : [
            { transform: fromEl.style.transform || "translate3d(0px, 0, 0) scale(1)", opacity: Number(fromEl.style.opacity || "1") },
            { transform: "translate3d(0px, 0, 0) scale(1)", opacity: 1 }
          ];
      const toFrames = shouldCommit
        ? [
            { transform: toEl.style.transform || "translate3d(0px, 0, 0) scale(1)", opacity: Number(toEl.style.opacity || "1") },
            { transform: "translate3d(0px, 0, 0) scale(1)", opacity: 1 }
          ]
        : [
            { transform: toEl.style.transform || "translate3d(0px, 0, 0) scale(1)", opacity: Number(toEl.style.opacity || "1") },
            {
              transform: `translate3d(${direction === "forward" ? swipeState.panelWidth * 0.78 : -swipeState.panelWidth * 0.78}px, 0, 0) scale(0.986)`,
              opacity: 0.8
            }
          ];
      const duration = shouldCommit ? 260 : 200;
      const easing = shouldCommit ? "cubic-bezier(0.2, 0.92, 0.22, 1)" : "cubic-bezier(0.22, 0.82, 0.24, 1)";
      const outgoing = fromEl.animate(fromFrames, { duration, easing, fill: "forwards" });
      const incoming = toEl.animate(toFrames, { duration, easing, fill: "forwards" });
      Promise.allSettled([outgoing.finished, incoming.finished]).finally(() => {
        if (shouldCommit) {
          setPanelVisibility(targetId);
          finalizePanelChange(targetId);
        } else {
          setPanelVisibility(currentPanelId);
          clearPanelTransitionShell();
        }
        isPanelAnimating = false;
        resetSwipeState();
      });
      return;
    }

    const isHorizontal = Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35;
    if (!isHorizontal) {
      resetSwipeState();
      return;
    }
    const currentIndex = getPanelIndex(currentPanelId);
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextPanelId = SWIPE_PANEL_IDS[nextIndex];
    if (!nextPanelId) {
      resetSwipeState();
      return;
    }
    resetSwipeState();
    showPanel(nextPanelId, {
      animate: true,
      direction: deltaX < 0 ? "forward" : "backward"
    });
  }, { passive: true });

  main.addEventListener("touchcancel", () => {
    if (swipeState.dragging) {
      restoreCurrentPanel();
      return;
    }
    resetSwipeState();
  }, { passive: true });
}

function initZoomGuard() {
  let lastTouchEnd = 0;

  ["gesturestart", "gesturechange", "gestureend"].forEach(eventName => {
    document.addEventListener(eventName, event => {
      event.preventDefault();
    }, { passive: false });
  });

  document.addEventListener("touchmove", event => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", event => {
    const now = Date.now();
    if (now - lastTouchEnd < 280) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}

function initNavigation() {
  const homeCards = Array.from(document.querySelectorAll(".home-card, .split-card"));
  const homeTrigger = document.getElementById("app-home-trigger");
  const dataBtn = document.getElementById("data-button");
  homeCards.forEach(card => {
    card.addEventListener("click", () => {
      const targetId = card.getAttribute("data-target");
      if (!targetId) return;
      if (targetId === "tab-brew") {
        showPanel(targetId);
        refillLastBrewIfConfirmed();
      } else {
        showPanel(targetId);
      }
    });
  });
  if (homeTrigger) {
    homeTrigger.addEventListener("click", event => {
      event.preventDefault();
      showPanel("home");
    });
  }
  const navButtons = Array.from(document.querySelectorAll("[data-nav-target]"));
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-nav-target");
      if (!targetId) return;
      showPanel(targetId);
    });
  });
  if (dataBtn) {
    dataBtn.addEventListener("click", () => {
      showPanel("tab-settings");
    });
  }
  document.addEventListener("open-panel", event => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const targetId = detail && detail.targetId ? detail.targetId : "";
    if (!targetId) return;
    showPanel(targetId);
  });
  initSwipeNavigation();
}

function initSettings() {
  const exportBtn = document.getElementById("export-data");
  const importInput = document.getElementById("import-data");
  const resetBtn = document.getElementById("reset-data");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clog-coffee-data.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (importInput) {
    importInput.addEventListener("change", () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = String(reader.result || "");
          const cleaned = raw.replace(/^\uFEFF/, "").trim();
          const parsed = JSON.parse(cleaned || "{}");
          try {
            importAll(parsed, { mode: "merge" });
            window.alert("Data merged successfully. Reloading to apply changes.");
            window.location.reload();
          } catch {
            const optimized = await optimizeImportMedia(parsed);
            try {
              importAll(optimized, { mode: "merge" });
              window.alert("Data merged. Images were optimized to fit local storage limits. Reloading now.");
              window.location.reload();
            } catch {
              try {
                const beanPreferred = stripNonBeanMediaDeep(parsed);
                importAll(beanPreferred, { mode: "merge" });
                window.alert("Data merged with fallback cleanup. Bean photos were prioritized and preserved when possible. Reloading now.");
                window.location.reload();
              } catch {
                const sanitized = stripMediaDeep(parsed);
                try {
                  importAll(sanitized, { mode: "merge" });
                  window.alert("Data merged after full media cleanup. Please re-import a smaller image backup if you need photos.");
                  window.location.reload();
                } catch {
                  window.alert("Import failed: local storage limit reached. Please reduce image size/count and try again.");
                }
              }
            }
          }
        } catch {
          window.alert("Import failed. Please use a valid CLOG JSON export.");
        }
      };
      reader.readAsText(file);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Reset all brews, calendar data, and beans?");
      if (!confirmed) return;
      resetAll();
      window.location.reload();
    });
  }

  const scopeNameInput = document.getElementById("knowledge-scope-name");
  const uploadInput = document.getElementById("knowledge-upload-file");
  const uploadBtn = document.getElementById("knowledge-upload-btn");
  const selectAllBtn = document.getElementById("knowledge-select-all");
  const clearSelectionBtn = document.getElementById("knowledge-clear-selection");
  const scopeList = document.getElementById("knowledge-scope-list");
  const scopeHint = document.getElementById("knowledge-scope-hint");
  const modelInput = document.getElementById("insight-model-name");
  const apiKeyInput = document.getElementById("insight-api-key");
  const saveModelBtn = document.getElementById("insight-save-settings");
  const modelHint = document.getElementById("insight-model-hint");
  const syncApiKeyInput = document.getElementById("sync-firebase-api-key");
  const syncAuthDomainInput = document.getElementById("sync-firebase-auth-domain");
  const syncProjectIdInput = document.getElementById("sync-firebase-project-id");
  const syncStorageBucketInput = document.getElementById("sync-firebase-storage-bucket");
  const syncSenderIdInput = document.getElementById("sync-firebase-sender-id");
  const syncAppIdInput = document.getElementById("sync-firebase-app-id");
  const syncSaveBtn = document.getElementById("sync-save-settings");
  const syncNowBtn = document.getElementById("sync-now-button");
  const syncHint = document.getElementById("sync-settings-hint");

  const renderScopeList = () => {
    if (!scopeList) return;
    const entries = loadKnowledgeEntries();
    const scopes = summarizeScopes(entries);
    const selected = new Set(loadSelectedKnowledgeScopes());
    scopeList.innerHTML = "";
    if (!scopes.length) {
      const empty = document.createElement("div");
      empty.className = "knowledge-empty";
      empty.textContent = "No scope uploaded yet. Upload a file first, then select scopes.";
      scopeList.appendChild(empty);
      if (scopeHint) {
        scopeHint.textContent = "Insight only searches within the scopes you select.";
      }
      return;
    }
    scopes.forEach(scope => {
      const row = document.createElement("label");
      row.className = "knowledge-scope-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = scope.scopeId;
      checkbox.checked = selected.has(scope.scopeId);
      checkbox.addEventListener("change", () => {
        const next = new Set(loadSelectedKnowledgeScopes());
        if (checkbox.checked) {
          next.add(scope.scopeId);
        } else {
          next.delete(scope.scopeId);
        }
        saveSelectedKnowledgeScopes(Array.from(next));
        renderScopeList();
      });
      const name = document.createElement("span");
      name.className = "knowledge-scope-name";
      name.textContent = scope.scopeName;
      const meta = document.createElement("span");
      meta.className = "knowledge-scope-meta";
      meta.textContent = `${scope.count} entries`;
      row.appendChild(checkbox);
      row.appendChild(name);
      row.appendChild(meta);
      scopeList.appendChild(row);
    });
    if (scopeHint) {
      const selectedCount = scopes.filter(scope => selected.has(scope.scopeId)).length;
      scopeHint.textContent = selectedCount > 0 ? `${selectedCount} scope(s) selected. Insight only searches within selected scopes.` : "No scope selected. Insight will not use uploaded knowledge entries.";
    }
  };

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (!file) {
        window.alert("Please select a .txt / .md / .json file first.");
        return;
      }
      const inputName = scopeNameInput ? scopeNameInput.value.trim() : "";
      const fallbackName = String(file.name || "").replace(/\.[^.]+$/, "");
      const scopeName = inputName || fallbackName || "New Scope";
      const scopeId = normalizeScopeId(scopeName);
      const reader = new FileReader();
      reader.onload = () => {
        const chunks = extractKnowledgeChunks(String(reader.result || ""));
        if (!chunks.length) {
          window.alert("The file is empty. Nothing was imported.");
          return;
        }
        const now = new Date().toISOString();
        const nextEntries = [
          ...loadKnowledgeEntries(),
          ...chunks.map((content, index) => ({
            id: `knowledge_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
            scopeId,
            scopeName,
            title: `${scopeName} ${index + 1}`,
            content,
            createdAt: now
          }))
        ];
        saveKnowledgeEntries(nextEntries);
        const selected = new Set(loadSelectedKnowledgeScopes());
        selected.add(scopeId);
        saveSelectedKnowledgeScopes(Array.from(selected));
        if (scopeNameInput) scopeNameInput.value = "";
        uploadInput.value = "";
        renderScopeList();
        window.alert(`Uploaded ${chunks.length} entry(ies) into scope "${scopeName}".`);
      };
      reader.readAsText(file);
    });
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const scopeIds = summarizeScopes(loadKnowledgeEntries()).map(scope => scope.scopeId);
      saveSelectedKnowledgeScopes(scopeIds);
      renderScopeList();
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      saveSelectedKnowledgeScopes([]);
      renderScopeList();
    });
  }

  renderScopeList();

  const renderAiSettings = () => {
    const settings = loadAiSettings();
    if (modelInput) {
      modelInput.value = settings.model || "gemini-2.0-flash";
    }
    if (apiKeyInput) {
      apiKeyInput.value = settings.apiKey || "";
    }
    if (modelHint) {
      modelHint.textContent = settings.enabled
        ? `Enabled ${settings.model}. Insight first tries AI suggestions (Gemini/OpenAI), then falls back to local rules on failure.`
        : "No API key configured. Insight uses local rule-based suggestions.";
    }
  };

  const renderSyncSettings = () => {
    const settings = loadSyncSettings();
    if (syncApiKeyInput) syncApiKeyInput.value = settings.apiKey || DEFAULT_FIREBASE_SYNC_CONFIG.apiKey;
    if (syncAuthDomainInput) syncAuthDomainInput.value = settings.authDomain || DEFAULT_FIREBASE_SYNC_CONFIG.authDomain;
    if (syncProjectIdInput) syncProjectIdInput.value = settings.projectId || DEFAULT_FIREBASE_SYNC_CONFIG.projectId;
    if (syncStorageBucketInput) syncStorageBucketInput.value = settings.storageBucket || DEFAULT_FIREBASE_SYNC_CONFIG.storageBucket;
    if (syncSenderIdInput) syncSenderIdInput.value = settings.messagingSenderId || DEFAULT_FIREBASE_SYNC_CONFIG.messagingSenderId;
    if (syncAppIdInput) syncAppIdInput.value = settings.appId || DEFAULT_FIREBASE_SYNC_CONFIG.appId;
    if (syncHint) {
      if (settings.enabled && settings.lastSyncedAt) {
        syncHint.textContent = `Auto backup is enabled. Last sync: ${new Date(settings.lastSyncedAt).toLocaleString()}.`;
      } else if (settings.enabled) {
        syncHint.textContent = "Auto backup is enabled. New brews, beans, machines, and photos will sync to Firebase. Make sure Firestore and Storage are both turned on.";
      } else if (settings.projectId && !settings.appId) {
        syncHint.textContent = "Firebase project info is partly filled in. Add the remaining Web app config to enable cloud backup.";
      } else {
        syncHint.textContent = "When enabled, brews, beans, machines, and bean or machine photos are backed up to Firebase Firestore and Storage. Turn on both products before the first sync.";
      }
    }
  };

  if (saveModelBtn) {
    saveModelBtn.addEventListener("click", () => {
      const model = modelInput ? modelInput.value.trim() : "gemini-2.0-flash";
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
      saveAiSettings({
        enabled: Boolean(apiKey),
        model: model || "gemini-2.0-flash",
        apiKey
      });
      renderAiSettings();
      window.alert(apiKey ? "Model configuration saved." : "API key cleared. Insight will use local rules.");
    });
  }

  if (syncSaveBtn) {
    syncSaveBtn.addEventListener("click", async () => {
      const apiKey = syncApiKeyInput ? syncApiKeyInput.value.trim() : "";
      const authDomain = syncAuthDomainInput ? syncAuthDomainInput.value.trim() : "";
      const projectId = syncProjectIdInput ? syncProjectIdInput.value.trim() : "";
      const storageBucket = syncStorageBucketInput ? syncStorageBucketInput.value.trim() : "";
      const messagingSenderId = syncSenderIdInput ? syncSenderIdInput.value.trim() : "";
      const appId = syncAppIdInput ? syncAppIdInput.value.trim() : "";
      const settings = saveCloudSyncSettings({
        enabled: Boolean(apiKey && authDomain && projectId && storageBucket && messagingSenderId && appId),
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId
      });
      renderSyncSettings();
      if (!settings.enabled) {
        window.alert("Cloud backup disabled. The app will continue saving locally.");
        return;
      }
      try {
        await syncAllDataToCloud();
        renderSyncSettings();
        window.alert("Firebase backup configured. Existing brews, beans, machines, and photos have been synced.");
      } catch (error) {
        renderSyncSettings();
        window.alert(`Sync setup saved, but backup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      try {
        await syncAllDataToCloud();
        renderSyncSettings();
        window.alert("Brews, beans, machines, and photos synced to Firebase.");
      } catch (error) {
        renderSyncSettings();
        window.alert(`Cloud sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  renderAiSettings();
  renderSyncSettings();
}

function initApp() {
  migrateIfNeeded();
  initZoomGuard();
  initNavigation();
  bindBeansUi();
  bindGrindersUi();
  bindMachinesUi();
  bindBrewsUi();
  bindHomeBrewsPreview();
  bindCoffeeCalendarUi();
  bindSyncStatusUi();
  initSyncStatus();
  initSettings();
  showPanel("home");
  const splash = document.getElementById("splash");
  if (splash) {
    setTimeout(() => {
      splash.style.opacity = "0";
      splash.style.pointerEvents = "none";
    }, 1700);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

if ("serviceWorker" in navigator) {
  let didReload = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (didReload) return;
    didReload = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(registration => {
        registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            if (!navigator.serviceWorker.controller) return;
            installing.postMessage({ type: "SKIP_WAITING" });
          });
        });
      })
      .catch(() => {});
  });
}
