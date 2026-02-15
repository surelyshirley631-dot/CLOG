import { loadBrews, saveBrews } from "./storage.js";
import { getBeans, renderBeansOptions, updateBeanStock } from "./beans.js";
import { renderGrinderOptions } from "./grinders.js";
import { renderMachineOptions } from "./machines.js";

function generateId() {
  return `brew_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function computeRatio(dose, yieldGrams) {
  if (!dose || !yieldGrams || dose <= 0) return "";
  const r = yieldGrams / dose;
  return `1:${r.toFixed(1)}`;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n;
}

function buildOptimizationTips(brew) {
  const tips = [];
  const acidity = toNumber(brew.acidityRating);
  const bitterness = toNumber(brew.bitternessRating);
  const body = toNumber(brew.bodyRating);
  const extraction = toNumber(brew.extractionTime);
  const waterTemp = toNumber(brew.waterTemp);

  if (bitterness !== null && acidity !== null) {
    if (bitterness >= 4 && acidity <= 3) {
      tips.push("Cup leans bitter: try a coarser grind or a shorter extraction time.");
    }
    if (acidity >= 4 && bitterness <= 3) {
      tips.push("Cup leans acidic: try a finer grind or a slightly longer extraction.");
    }
  }

  if (body !== null && body <= 2) {
    tips.push("Body feels light: increase dose slightly or try a finer grind.");
  }

  if (extraction !== null && extraction > 35) {
    tips.push("Extraction time is long: reduce dose, coarsen grind, or increase output.");
  }

  if (extraction !== null && extraction < 20) {
    tips.push("Extraction time is short: increase contact time or use a finer grind.");
  }

  if (waterTemp !== null && waterTemp > 96) {
    tips.push("Water is very hot: try lowering temperature to around 92–94 °C.");
  }

  if (waterTemp !== null && waterTemp < 88) {
    tips.push("Water is quite cool: consider raising temperature for better extraction.");
  }

  return tips;
}

export function bindBrewsUi() {
  const form = document.getElementById("brew-form");
  const list = document.getElementById("brew-list");
  const clearBtn = document.getElementById("clear-brews");
  const beanSelect = document.getElementById("brew-bean");
  const machineSelect = document.getElementById("brew-machine");
  const grinderSelect = document.getElementById("brew-grinder");
  const tipsCard = document.getElementById("brew-tips-card");
  const tipsList = document.getElementById("brew-tips-list");
  if (!form || !list || !clearBtn || !beanSelect || !machineSelect || !grinderSelect || !tipsCard || !tipsList) return;

  renderBeansOptions(beanSelect);
  renderMachineOptions(machineSelect);
  renderGrinderOptions(grinderSelect);
  renderBrews(list, loadBrews());

  document.addEventListener("beans-updated", () => {
    renderBeansOptions(beanSelect);
  });

  document.addEventListener("grinders-updated", () => {
    renderGrinderOptions(grinderSelect);
  });

  document.addEventListener("machines-updated", () => {
    renderMachineOptions(machineSelect);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const dateInput = document.getElementById("brew-date");
    const methodInput = document.getElementById("brew-method");
    const machineInput = document.getElementById("brew-machine");
    const grinderInput = document.getElementById("brew-grinder");
    const grindSizeInput = document.getElementById("grind-size");
    const tampSelect = document.getElementById("tamp-pressure");
    const waterTempInput = document.getElementById("water-temp");
    const waterPressureInput = document.getElementById("water-pressure");
    const scoreSelect = document.getElementById("brew-score");
    const doseInput = document.getElementById("dose-grams");
    const yieldInput = document.getElementById("yield-grams");
    const extractionInput = document.getElementById("extraction-time");
    const aciditySelect = document.getElementById("acidity-rating");
    const bitternessSelect = document.getElementById("bitterness-rating");
    const bodySelect = document.getElementById("body-rating");
    const aftertasteSelect = document.getElementById("aftertaste-rating");
    const notesInput = document.getElementById("brew-notes");
    if (!dateInput || !methodInput) return;

    const dose = doseInput && doseInput.value ? Number(doseInput.value) : null;
    const yieldGrams = yieldInput && yieldInput.value ? Number(yieldInput.value) : null;

    const brew = {
      id: generateId(),
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      method: methodInput.value,
      beanId: beanSelect.value || "",
      coffeeMachine: machineInput ? machineInput.value : "",
      grinderModel: grinderInput ? grinderInput.value : "",
      grindSize: grindSizeInput ? grindSizeInput.value.trim() : "",
      tampPressure: tampSelect ? tampSelect.value : "",
      waterTemp: waterTempInput && waterTempInput.value ? Number(waterTempInput.value) : null,
      waterPressure: waterPressureInput && waterPressureInput.value !== "" ? Number(waterPressureInput.value) : null,
      doseGrams: dose,
      yieldGrams,
      extractionTime: extractionInput && extractionInput.value ? Number(extractionInput.value) : null,
      acidityRating: aciditySelect ? aciditySelect.value : "",
      bitternessRating: bitternessSelect ? bitternessSelect.value : "",
      bodyRating: bodySelect ? bodySelect.value : "",
      aftertasteRating: aftertasteSelect ? aftertasteSelect.value : "",
      score: scoreSelect && scoreSelect.value ? Number(scoreSelect.value) : null,
      notes: notesInput ? notesInput.value.trim() : "",
      ratioText: computeRatio(dose, yieldGrams)
    };

    const brews = loadBrews();
    brews.unshift(brew);
    saveBrews(brews);

    if (brew.beanId && brew.doseGrams) {
      updateBeanStock(brew.beanId, brew.doseGrams);
      document.dispatchEvent(new CustomEvent("beans-updated", { detail: { beans: getBeans() } }));
    }

    form.reset();
    renderBeansOptions(beanSelect);
    renderMachineOptions(machineSelect);
    renderGrinderOptions(grinderSelect);
    renderBrews(list, brews);
    document.dispatchEvent(new CustomEvent("brews-updated", { detail: { brews } }));

    const tips = buildOptimizationTips(brew);
    tipsList.innerHTML = "";
    if (tips.length) {
      tips.forEach(t => {
        const li = document.createElement("li");
        li.textContent = t;
        tipsList.appendChild(li);
      });
      tipsCard.hidden = false;
    } else {
      tipsCard.hidden = true;
    }
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all brew logs?");
    if (!confirmed) return;
    saveBrews([]);
    renderBrews(list, []);
    document.dispatchEvent(new CustomEvent("brews-updated", { detail: { brews: [] } }));
  });
}

export function bindHomeBrewsPreview() {
  const controls = document.getElementById("brew-sort-controls");
  const dirSelect = document.getElementById("brew-sort-direction");
  const list = document.getElementById("home-brew-list");
  if (!controls || !dirSelect || !list) return;
  let criterion = "date";
  const apply = () => {
    const brews = loadBrews().slice();
    const dir = dirSelect.value || "desc";
    const mul = dir === "asc" ? 1 : -1;
    if (criterion === "date") {
      brews.sort((a, b) => mul * String(a.date || "").localeCompare(String(b.date || "")));
    } else if (criterion === "score") {
      brews.sort((a, b) => mul * (Number(a.score || 0) - Number(b.score || 0)));
    } else if (criterion === "machine") {
      brews.sort((a, b) => mul * String(a.coffeeMachine || "").localeCompare(String(b.coffeeMachine || "")));
    }
    renderBrews(list, brews);
  };
  controls.querySelectorAll("[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      criterion = btn.getAttribute("data-sort") || "date";
      apply();
    });
  });
  dirSelect.addEventListener("change", apply);
  apply();
  document.addEventListener("brews-updated", apply);
}
export function refillLastBrewIfConfirmed() {
  const brews = loadBrews();
  if (!brews.length) return;
  const confirmed = window.confirm("Refill with the data from last time?");
  if (!confirmed) return;
  const last = brews[0];
  const dateInput = document.getElementById("brew-date");
  const methodInput = document.getElementById("brew-method");
  const beanSelect = document.getElementById("brew-bean");
  const machineSelect = document.getElementById("brew-machine");
  const grinderSelect = document.getElementById("brew-grinder");
  const grindSizeInput = document.getElementById("grind-size");
  const tampSelect = document.getElementById("tamp-pressure");
  const waterTempInput = document.getElementById("water-temp");
  const waterPressureInput = document.getElementById("water-pressure");
  const scoreSelect = document.getElementById("brew-score");
  const doseInput = document.getElementById("dose-grams");
  const yieldInput = document.getElementById("yield-grams");
  const extractionInput = document.getElementById("extraction-time");
  const aciditySelect = document.getElementById("acidity-rating");
  const bitternessSelect = document.getElementById("bitterness-rating");
  const bodySelect = document.getElementById("body-rating");
  const aftertasteSelect = document.getElementById("aftertaste-rating");
  const notesInput = document.getElementById("brew-notes");
  if (dateInput) dateInput.value = last.date || "";
  if (methodInput) methodInput.value = last.method || "espresso";
  if (beanSelect) beanSelect.value = last.beanId || "";
  if (machineSelect) machineSelect.value = last.coffeeMachine || "";
  if (grinderSelect) grinderSelect.value = last.grinderModel || "";
  if (grindSizeInput) grindSizeInput.value = last.grindSize || "";
  if (tampSelect) tampSelect.value = last.tampPressure || "";
  if (waterTempInput) waterTempInput.value = last.waterTemp != null ? String(last.waterTemp) : "";
  if (waterPressureInput) waterPressureInput.value = last.waterPressure != null ? String(last.waterPressure) : "";
  if (doseInput) doseInput.value = last.doseGrams != null ? String(last.doseGrams) : "";
  if (yieldInput) yieldInput.value = last.yieldGrams != null ? String(last.yieldGrams) : "";
  if (extractionInput) extractionInput.value = last.extractionTime != null ? String(last.extractionTime) : "";
  if (aciditySelect) aciditySelect.value = last.acidityRating || "";
  if (bitternessSelect) bitternessSelect.value = last.bitternessRating || "";
  if (bodySelect) bodySelect.value = last.bodyRating || "";
  if (aftertasteSelect) aftertasteSelect.value = last.aftertasteRating || "";
  if (scoreSelect) scoreSelect.value = last.score != null ? String(last.score) : "";
  if (notesInput) notesInput.value = last.notes || "";
}

function methodLabel(method) {
  if (method === "espresso") return "Espresso";
  if (method === "pourover") return "Pour-over";
  if (method === "immersion") return "Immersion";
  if (method === "coldbrew") return "Cold brew";
  return "Other";
}

function buildFlavorSummary(brew) {
  const parts = [];
  if (brew.acidityRating) parts.push(`Acidity ${brew.acidityRating}/5`);
  if (brew.bitternessRating) parts.push(`Bitterness ${brew.bitternessRating}/5`);
  if (brew.bodyRating) parts.push(`Body ${brew.bodyRating}/5`);
  if (brew.aftertasteRating) parts.push(`Aftertaste ${brew.aftertasteRating}/5`);
  return parts.join(" • ");
}

function renderBrews(list, brews) {
  list.innerHTML = "";
  if (!brews.length) return;

  const beans = getBeans();

  brews.forEach(brew => {
    const li = document.createElement("li");
    li.className = "item";

    const main = document.createElement("div");
    main.className = "item-main";

    const title = document.createElement("div");
    title.className = "item-title";
    const bean = beans.find(b => b.id === brew.beanId);
    const beanName = bean ? bean.name : "No bean linked";
    title.textContent = `${beanName} • ${methodLabel(brew.method)}`;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const pieces = [];
    if (brew.date) pieces.push(brew.date);
    if (brew.doseGrams && brew.yieldGrams) {
      const ratio = brew.ratioText || computeRatio(brew.doseGrams, brew.yieldGrams);
      pieces.push(`${brew.doseGrams.toFixed(1)} g in, ${brew.yieldGrams.toFixed(1)} g out (${ratio})`);
    }
    if (brew.extractionTime) {
      pieces.push(`${brew.extractionTime}s`);
    }
    if (brew.waterTemp) {
      pieces.push(`${brew.waterTemp.toFixed(1)} °C`);
    }
    if (typeof brew.waterPressure === "number") {
      pieces.push(`${brew.waterPressure.toFixed(1)} bar`);
    }
    meta.textContent = pieces.join(" • ");

    const tags = document.createElement("div");
    tags.className = "item-tags";
    const flavor = buildFlavorSummary(brew);
    if (flavor) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = flavor;
      tags.appendChild(t);
    }
    if (brew.coffeeMachine) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = brew.coffeeMachine;
      tags.appendChild(t);
    }
    if (brew.grinderModel) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = brew.grinderModel;
      tags.appendChild(t);
    }
    if (brew.grindSize) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = `Grind ${brew.grindSize}`;
      tags.appendChild(t);
    }
    if (brew.notes) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = brew.notes;
      tags.appendChild(t);
    }

    main.appendChild(title);
    main.appendChild(meta);
    main.appendChild(tags);

    li.appendChild(main);
    list.appendChild(li);
  });
}
