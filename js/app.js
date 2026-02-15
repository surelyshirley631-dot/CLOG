import { bindBrewsUi, refillLastBrewIfConfirmed, bindHomeBrewsPreview } from "./brews.js";
import { bindCafesUi } from "./cafes.js";
import { bindBeansUi } from "./beans.js";
import { bindGrindersUi } from "./grinders.js";
import { bindMachinesUi } from "./machines.js";
import { exportAll, importAll, resetAll, migrateIfNeeded } from "./storage.js";

function setHeaderFor(targetId) {
  const title = document.getElementById("app-title");
  const subtitle = document.querySelector(".app-subtitle");
  if (!title || !subtitle) return;
  if (targetId === "home") {
    title.textContent = "CLOG";
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
    title.textContent = "Grinder model";
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
          const parsed = JSON.parse(String(reader.result || "{}"));
          importAll(parsed);
          window.alert("Data imported. Reloading to apply changes.");
          window.location.reload();
        } catch {
          window.alert("Could not import data. Please check the file format.");
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
