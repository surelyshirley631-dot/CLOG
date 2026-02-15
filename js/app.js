import { bindBrewsUi } from "./brews.js";
import { bindCafesUi } from "./cafes.js";
import { bindBeansUi } from "./beans.js";
import { exportAll, importAll, resetAll } from "./storage.js";

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
  if (targetId === "tab-settings") {
    title.textContent = "Settings";
    subtitle.textContent = "Data export, import, and reset";
  }
}

function showPanel(targetId) {
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  panels.forEach(panel => {
    panel.classList.toggle("active", panel.id === targetId);
  });
  const main = document.querySelector(".app-main");
  if (main) {
    main.scrollTop = 0;
  } else {
    window.scrollTo(0, 0);
  }
  setHeaderFor(targetId);
}

function initNavigation() {
  const homeCards = Array.from(document.querySelectorAll(".home-card"));
  const title = document.getElementById("app-title");
  homeCards.forEach(card => {
    card.addEventListener("click", () => {
      const targetId = card.getAttribute("data-target");
      if (!targetId) return;
      showPanel(targetId);
    });
  });
  if (title) {
    title.addEventListener("click", () => {
      showPanel("home");
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
  initNavigation();
  bindBeansUi();
  bindBrewsUi();
  bindCafesUi();
  initSettings();
  setHeaderFor("home");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
