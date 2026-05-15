import { bindBrewsUi, refillLastBrewIfConfirmed, bindHomeBrewsPreview } from "./brews.js";
import { bindBeansUi } from "./beans.js";
import { bindGrindersUi } from "./grinders.js";
import { bindMachinesUi } from "./machines.js";
import { bindCoffeeCalendarUi } from "./calendar.js";
import { bindSyncStatusUi, initSyncStatus, saveCloudSyncSettings, syncAllBrewsToCloud } from "./sync.js";
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

function setPanelVisibility(targetId) {
  PANEL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === targetId;
    el.classList.toggle("active", isActive);
    el.style.display = isActive ? "block" : "none";
    el.classList.remove("is-transitioning");
    el.style.removeProperty("position");
    el.style.removeProperty("inset");
    el.style.removeProperty("width");
    el.style.removeProperty("z-index");
  });
}

function finalizePanelChange(targetId) {
  const main = document.querySelector(".app-main");
  if (main) {
    main.classList.remove("is-panel-transitioning");
    main.style.removeProperty("min-height");
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

function animatePanelChange(fromEl, toEl, direction) {
  const main = document.querySelector(".app-main");
  if (!main || !fromEl || !toEl || fromEl === toEl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setPanelVisibility(toEl ? toEl.id : currentPanelId);
    return Promise.resolve();
  }
  const fromHeight = fromEl.offsetHeight;
  toEl.style.display = "block";
  const toHeight = toEl.offsetHeight;
  const sign = direction === "backward" ? 1 : -1;
  const incomingOffset = Math.min(Math.round(main.clientWidth * 0.56), 280);
  const outgoingOffset = Math.min(Math.round(main.clientWidth * 0.24), 120);
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

  const outgoing = fromEl.animate(
    [
      { transform: "translateX(0) scale(1)", opacity: 1 },
      { transform: `translateX(${sign * -outgoingOffset}px) scale(0.985)`, opacity: 0.52 }
    ],
    { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
  );

  const incoming = toEl.animate(
    [
      { transform: `translateX(${sign * incomingOffset}px) scale(0.982)`, opacity: 0.72 },
      { transform: "translateX(0) scale(1)", opacity: 1 }
    ],
    { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
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
    active: false,
    blocked: false
  };

  main.addEventListener("touchstart", event => {
    if (event.touches.length !== 1 || isPanelAnimating || !isSwipePanel(currentPanelId)) {
      swipeState.active = false;
      return;
    }
    swipeState.startX = event.touches[0].clientX;
    swipeState.startY = event.touches[0].clientY;
    swipeState.active = true;
    swipeState.blocked = isSwipeBlockedTarget(event.target);
  }, { passive: true });

  main.addEventListener("touchend", event => {
    if (!swipeState.active || swipeState.blocked || isPanelAnimating) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;
    const isHorizontal = Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35;
    if (!isHorizontal) return;
    const currentIndex = getPanelIndex(currentPanelId);
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextPanelId = SWIPE_PANEL_IDS[nextIndex];
    if (!nextPanelId) return;
    showPanel(nextPanelId, {
      animate: true,
      direction: deltaX < 0 ? "forward" : "backward"
    });
  }, { passive: true });

  main.addEventListener("touchcancel", () => {
    swipeState.active = false;
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
  const title = document.getElementById("app-title");
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
  if (title) {
    title.addEventListener("click", () => {
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
  const syncUrlInput = document.getElementById("sync-supabase-url");
  const syncKeyInput = document.getElementById("sync-supabase-key");
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
    if (syncUrlInput) syncUrlInput.value = settings.supabaseUrl || "";
    if (syncKeyInput) syncKeyInput.value = settings.anonKey || "";
    if (syncHint) {
      if (settings.enabled && settings.lastSyncedAt) {
        syncHint.textContent = `Auto backup is enabled. Last sync: ${new Date(settings.lastSyncedAt).toLocaleString()}.`;
      } else if (settings.enabled) {
        syncHint.textContent = "Auto backup is enabled. New brews will sync to Supabase table brew_logs.";
      } else if (settings.supabaseUrl && !settings.anonKey) {
        syncHint.textContent = "Project URL saved. Backup is still in Local only mode until you add the Supabase anon key.";
      } else {
        syncHint.textContent = "When enabled, every saved brew is upserted to Supabase table brew_logs.";
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
      const supabaseUrl = syncUrlInput ? syncUrlInput.value.trim() : "";
      const anonKey = syncKeyInput ? syncKeyInput.value.trim() : "";
      const settings = saveCloudSyncSettings({
        enabled: Boolean(supabaseUrl && anonKey),
        supabaseUrl,
        anonKey
      });
      renderSyncSettings();
      if (!settings.enabled) {
        window.alert("Cloud backup disabled. The app will continue saving locally.");
        return;
      }
      try {
        await syncAllBrewsToCloud();
        renderSyncSettings();
        window.alert("Supabase sync configured. Existing brews have been backed up.");
      } catch (error) {
        renderSyncSettings();
        window.alert(`Sync setup saved, but backup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener("click", async () => {
      try {
        await syncAllBrewsToCloud();
        renderSyncSettings();
        window.alert("Brews synced to cloud.");
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
