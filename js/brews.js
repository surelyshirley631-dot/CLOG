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

function fillBrewFormValues(brew) {
  const dateInput = document.getElementById("brew-date");
  const methodInput = document.getElementById("brew-method");
  const beanSelect = document.getElementById("brew-bean");
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
  if (dateInput) dateInput.value = brew.date || "";
  if (methodInput) methodInput.value = brew.method || "espresso";
  if (beanSelect) beanSelect.value = brew.beanId || "";
  if (machineInput) machineInput.value = brew.coffeeMachine || "";
  if (grinderInput) grinderInput.value = brew.grinderModel || "";
  if (grindSizeInput) grindSizeInput.value = brew.grindSize || "";
  if (tampSelect) tampSelect.value = brew.tampPressure || "";
  if (waterTempInput) waterTempInput.value = brew.waterTemp != null ? String(brew.waterTemp) : "";
  if (waterPressureInput) waterPressureInput.value = brew.waterPressure != null ? String(brew.waterPressure) : "";
  if (doseInput) doseInput.value = brew.doseGrams != null ? String(brew.doseGrams) : "";
  if (yieldInput) yieldInput.value = brew.yieldGrams != null ? String(brew.yieldGrams) : "";
  if (extractionInput) extractionInput.value = brew.extractionTime != null ? String(brew.extractionTime) : "";
  if (aciditySelect) aciditySelect.value = brew.acidityRating || "";
  if (bitternessSelect) bitternessSelect.value = brew.bitternessRating || "";
  if (bodySelect) bodySelect.value = brew.bodyRating || "";
  if (aftertasteSelect) aftertasteSelect.value = brew.aftertasteRating || "";
  if (scoreSelect) scoreSelect.value = brew.score != null ? String(brew.score) : "";
  if (notesInput) notesInput.value = brew.notes || "";
}

function displayValue(value, suffix = "", emptyText = "Not Set") {
  if (value === undefined || value === null || value === "") return emptyText;
  return `${value}${suffix}`;
}

function methodLabel(method) {
  if (method === "espresso") return "Espresso";
  if (method === "pourover") return "Pour-over";
  if (method === "immersion") return "Immersion";
  if (method === "coldbrew") return "Cold brew";
  return "Other";
}

function metricCard({ label, value, icon }) {
  const card = document.createElement("div");
  card.className = "brew-metric-card";
  const top = document.createElement("div");
  top.className = "brew-metric-top";
  const iconEl = document.createElement("i");
  iconEl.setAttribute("data-lucide", icon);
  iconEl.className = "brew-metric-icon";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  top.appendChild(iconEl);
  top.appendChild(labelEl);
  const valueEl = document.createElement("div");
  const isNotSet = value === "Not Set";
  valueEl.className = isNotSet ? "brew-metric-value brew-metric-value-empty" : "brew-metric-value";
  valueEl.textContent = value;
  card.appendChild(top);
  card.appendChild(valueEl);
  return card;
}

function ratingBar({ label, score }) {
  const safe = Math.max(0, Math.min(5, toNumber(score) || 0));
  const row = document.createElement("div");
  row.className = "brew-rating-row";
  const head = document.createElement("div");
  head.className = "brew-rating-head";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const scoreEl = document.createElement("span");
  scoreEl.className = "brew-rating-score";
  scoreEl.textContent = `${safe}/5`;
  head.appendChild(labelEl);
  head.appendChild(scoreEl);
  const barWrap = document.createElement("div");
  barWrap.className = "brew-rating-bar-track";
  const bar = document.createElement("div");
  bar.className = "brew-rating-bar-fill";
  bar.style.width = `${(safe / 5) * 100}%`;
  barWrap.appendChild(bar);
  row.appendChild(head);
  row.appendChild(barWrap);
  return row;
}

function refreshLucideIcons(container) {
  const lucideLib = window.lucide;
  if (!lucideLib || typeof lucideLib.createIcons !== "function") return;
  lucideLib.createIcons({ icons: container.querySelectorAll("[data-lucide]") });
}

function renderBrewDetails(container, brew) {
  const beans = getBeans();
  const bean = beans.find(b => b.id === brew.beanId);
  const beanName = bean ? bean.name : "No bean linked";
  const scoreValue = toNumber(brew.score);
  container.innerHTML = "";
  container.className = "brew-inline-detail";
  const shell = document.createElement("div");
  shell.className = "brew-detail-shell";
  const card = document.createElement("section");
  card.className = "brew-detail-card-modern";

  const head = document.createElement("div");
  head.className = "brew-detail-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h4");
  title.className = "brew-detail-headline";
  title.textContent = `${beanName} • ${methodLabel(brew.method)}`;
  const dateRow = document.createElement("div");
  dateRow.className = "brew-detail-date";
  const dateIcon = document.createElement("i");
  dateIcon.setAttribute("data-lucide", "calendar-days");
  dateIcon.className = "brew-detail-date-icon";
  const dateText = document.createElement("span");
  dateText.textContent = displayValue(brew.date, "", "Not Set");
  dateRow.appendChild(dateIcon);
  dateRow.appendChild(dateText);
  titleWrap.appendChild(title);
  titleWrap.appendChild(dateRow);

  const badge = document.createElement("div");
  badge.className = "brew-detail-score-badge";
  badge.textContent = scoreValue !== null ? String(scoreValue) : "—";

  head.appendChild(titleWrap);
  head.appendChild(badge);

  const grid = document.createElement("div");
  grid.className = "brew-detail-columns";
  const left = document.createElement("div");
  const leftTitle = document.createElement("h5");
  leftTitle.className = "brew-detail-section-title";
  leftTitle.textContent = "Core Parameters";
  const metricsGrid = document.createElement("div");
  metricsGrid.className = "brew-core-grid";
  left.appendChild(leftTitle);
  left.appendChild(metricsGrid);

  const right = document.createElement("div");
  const rightTitle = document.createElement("h5");
  rightTitle.className = "brew-detail-section-title";
  rightTitle.textContent = "Flavor Ratings";
  const ratingsWrap = document.createElement("div");
  ratingsWrap.className = "brew-ratings-stack";
  right.appendChild(rightTitle);
  right.appendChild(ratingsWrap);

  grid.appendChild(left);
  grid.appendChild(right);

  card.appendChild(head);
  card.appendChild(grid);
  shell.appendChild(card);
  container.appendChild(shell);
  if (!metricsGrid || !ratingsWrap) return;
  [
    { label: "Coffee Bean", value: beanName, icon: "bean" },
    { label: "Machine", value: displayValue(brew.coffeeMachine), icon: "coffee" },
    { label: "Grinder", value: displayValue(brew.grinderModel), icon: "settings-2" },
    { label: "Grind Size", value: displayValue(brew.grindSize), icon: "ruler" },
    { label: "Water Temp", value: displayValue(brew.waterTemp, "°C"), icon: "thermometer" },
    { label: "Pressure", value: displayValue(brew.waterPressure, " bar"), icon: "gauge" },
    { label: "Tamp", value: displayValue(brew.tampPressure), icon: "hand" }
  ].forEach(item => metricsGrid.appendChild(metricCard(item)));
  [
    { label: "Acidity", score: brew.acidityRating },
    { label: "Bitterness", score: brew.bitternessRating },
    { label: "Body", score: brew.bodyRating },
    { label: "Aftertaste", score: brew.aftertasteRating }
  ].forEach(item => ratingsWrap.appendChild(ratingBar(item)));
  refreshLucideIcons(container);
}

function buildInlineDetail(brew) {
  const panel = document.createElement("div");
  panel.className = "brew-inline-detail";
  renderBrewDetails(panel, brew);
  return panel;
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

  let editingId = null;

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

    const brews = loadBrews();
    const base = {
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

    let brew;
    if (editingId) {
      const idx = brews.findIndex(b => b.id === editingId);
      if (idx !== -1) {
        const existing = brews[idx];
        brew = { ...existing, ...base };
        brews[idx] = brew;
      } else {
        brew = { id: generateId(), ...base };
        brews.unshift(brew);
      }
    } else {
      brew = { id: generateId(), ...base };
      brews.unshift(brew);
    }
    saveBrews(brews);

    if (!editingId && brew.beanId && brew.doseGrams) {
      updateBeanStock(brew.beanId, brew.doseGrams);
      document.dispatchEvent(new CustomEvent("beans-updated", { detail: { beans: getBeans() } }));
    }

    editingId = null;
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

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("brew-edit-button")) return;
    const li = target.closest("li");
    if (!li || !li.dataset.brewId) return;
    const brews = loadBrews();
    const brew = brews.find(b => b.id === li.dataset.brewId);
    if (!brew) return;
    editingId = brew.id;
    fillBrewFormValues(brew);
  });
}

export function bindHomeBrewsPreview() {
  const controls = document.getElementById("brew-sort-controls");
  const dirSelect = document.getElementById("brew-sort-direction");
  const list = document.getElementById("home-brew-list");
  if (!controls || !dirSelect || !list) return;
  let detailId = "";
  let criterion = "date";
  const setActive = () => {
    controls.querySelectorAll("[data-sort]").forEach(btn => {
      const isActive = (btn.getAttribute("data-sort") || "") === criterion;
      btn.classList.toggle("chip-active", Boolean(isActive));
    });
  };
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
    renderBrews(list, brews, detailId);
    setActive();
  };
  controls.querySelectorAll("[data-sort]").forEach(btn => {
    btn.addEventListener("click", () => {
      criterion = btn.getAttribute("data-sort") || "date";
      apply();
    });
  });
  dirSelect.addEventListener("change", apply);
  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const li = target.closest("li");
    if (!li || !li.dataset.brewId) return;
    if (!target.classList.contains("brew-view-button")) return;
    const brewId = li.dataset.brewId;
    if (detailId === brewId) {
      detailId = "";
      apply();
      return;
    }
    detailId = brewId;
    apply();
  });
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

function buildFlavorSummary(brew) {
  const parts = [];
  if (brew.acidityRating) parts.push(`Acidity ${brew.acidityRating}/5`);
  if (brew.bitternessRating) parts.push(`Bitterness ${brew.bitternessRating}/5`);
  if (brew.bodyRating) parts.push(`Body ${brew.bodyRating}/5`);
  if (brew.aftertasteRating) parts.push(`Aftertaste ${brew.aftertasteRating}/5`);
  return parts.join(" • ");
}

function renderBrews(list, brews, selectedDetailId = "") {
  list.innerHTML = "";
  if (!brews.length) return;

  const beans = getBeans();
  const isMainList = list.id === "brew-list";
  const isHomeList = list.id === "home-brew-list";

  brews.forEach(brew => {
    const li = document.createElement("li");
    li.className = "item";
    if (isHomeList && selectedDetailId === brew.id) {
      li.classList.add("item-open");
    }
    li.dataset.brewId = brew.id;

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
    pieces.forEach((piece, index) => {
      if (index > 0) {
        meta.append(" • ");
      }
      const span = document.createElement("span");
      span.textContent = piece;
      meta.appendChild(span);
    });
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

    if (isMainList || isHomeList) {
      const side = document.createElement("div");
      side.className = "item-side";
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = `ghost-button small-button ${isMainList ? "brew-edit-button" : "brew-view-button"}`;
      if (isMainList) {
        actionBtn.textContent = "Edit";
      } else {
        actionBtn.textContent = selectedDetailId === brew.id ? "Hide" : "View";
      }
      side.appendChild(actionBtn);
      const score = toNumber(brew.score);
      if (score !== null) {
        const scoreLabel = document.createElement("span");
        scoreLabel.className = "brew-side-score";
        scoreLabel.textContent = String(score);
        side.appendChild(scoreLabel);
      }
      li.appendChild(side);
    }

    if (isHomeList && selectedDetailId === brew.id) {
      li.appendChild(buildInlineDetail(brew));
    }

    list.appendChild(li);
  });
}
