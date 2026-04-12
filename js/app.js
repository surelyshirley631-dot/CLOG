import { bindBrewsUi, refillLastBrewIfConfirmed, bindHomeBrewsPreview } from "./brews.js";
import { bindCafesUi } from "./cafes.js";
import { bindBeansUi } from "./beans.js";
import { bindGrindersUi } from "./grinders.js";
import { bindMachinesUi } from "./machines.js";
import {
  exportAll,
  importAll,
  resetAll,
  migrateIfNeeded,
  loadKnowledgeEntries,
  saveKnowledgeEntries,
  loadSelectedKnowledgeScopes,
  saveSelectedKnowledgeScopes
} from "./storage.js";

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

function setHeaderFor(targetId) {
  const title = document.getElementById("app-title");
  const subtitle = document.querySelector(".app-subtitle");
  if (!title || !subtitle) return;
  if (targetId === "home") {
    title.textContent = "My Brew";
    subtitle.textContent = "Coffee log for brews, cafes, and beans";
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
  if (targetId === "tab-explore") {
    title.textContent = "Cafes";
    subtitle.textContent = "Visited and wish-list coffee shops";
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

function showPanel(targetId) {
  const ids = ["home", "tab-brew", "tab-mybrews", "tab-explore", "tab-beans", "tab-grinders", "tab-machines", "tab-rules", "tab-settings"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isActive = id === targetId;
    el.classList.toggle("active", isActive);
    el.style.display = isActive ? "block" : "none";
  });
  const main = document.querySelector(".app-main");
  if (main) {
    main.scrollTop = 0;
  } else {
    window.scrollTo(0, 0);
  }
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
      reader.onload = () => {
        try {
          const raw = String(reader.result || "");
          const cleaned = raw.replace(/^\uFEFF/, "").trim();
          const parsed = JSON.parse(cleaned || "{}");
          const result = importAll(parsed);
          if (result && result.mediaStripped) {
            window.alert("Data imported. Some photos were removed to fit iOS storage limits. Reloading now.");
          } else {
            window.alert("Data imported. Reloading to apply changes.");
          }
          window.location.reload();
        } catch {
          window.alert("Import failed. Please use a CLOG export JSON, or remove large photos and try again.");
        }
      };
      reader.readAsText(file);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Reset all brews, cafes, and beans?");
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

  const renderScopeList = () => {
    if (!scopeList) return;
    const entries = loadKnowledgeEntries();
    const scopes = summarizeScopes(entries);
    const selected = new Set(loadSelectedKnowledgeScopes());
    scopeList.innerHTML = "";
    if (!scopes.length) {
      const empty = document.createElement("div");
      empty.className = "knowledge-empty";
      empty.textContent = "还没有上传范围。先上传文件后再选择范围。";
      scopeList.appendChild(empty);
      if (scopeHint) {
        scopeHint.textContent = "Insight 只会在你勾选的范围中检索建议。";
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
      meta.textContent = `${scope.count} 条`;
      row.appendChild(checkbox);
      row.appendChild(name);
      row.appendChild(meta);
      scopeList.appendChild(row);
    });
    if (scopeHint) {
      const selectedCount = scopes.filter(scope => selected.has(scope.scopeId)).length;
      scopeHint.textContent = selectedCount > 0 ? `当前已选 ${selectedCount} 个范围，Insight 仅在这些范围内检索。` : "当前未选择范围，Insight 不会使用知识条目。";
    }
  };

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => {
      const file = uploadInput.files && uploadInput.files[0];
      if (!file) {
        window.alert("请先选择一个 .txt / .md / .json 文件。");
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
          window.alert("文件内容为空，未导入。");
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
        window.alert(`已上传 ${chunks.length} 条内容到范围「${scopeName}」。`);
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
}

function initApp() {
  migrateIfNeeded();
  initNavigation();
  bindBeansUi();
  bindGrindersUi();
  bindMachinesUi();
  bindBrewsUi();
  bindHomeBrewsPreview();
  bindCafesUi();
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
