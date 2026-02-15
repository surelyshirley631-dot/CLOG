import { loadBrews, saveBrews } from "./storage.js";
import { getBeans, renderBeansOptions, updateBeanStock } from "./beans.js";

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
  const tipsCard = document.getElementById("brew-tips-card");
  const tipsList = document.getElementById("brew-tips-list");
  if (!form || !list || !clearBtn || !beanSelect || !tipsCard || !tipsList) return;

  renderBeansOptions(beanSelect);
  renderBrews(list, loadBrews());

  document.addEventListener("beans-updated", () => {
    renderBeansOptions(beanSelect);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const dateInput = document.getElementById("brew-date");
    const methodInput = document.getElementById("brew-method");
    const grinderInput = document.getElementById("grinder-model");
    const grindSizeInput = document.getElementById("grind-size");
    const tampInput = document.getElementById("tamp-pressure");
    const tampUnitSelect = document.getElementById("tamp-unit");
    const waterTempInput = document.getElementById("water-temp");
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
      grinderModel: grinderInput ? grinderInput.value.trim() : "",
      grindSize: grindSizeInput ? grindSizeInput.value.trim() : "",
      tampPressure: tampInput && tampInput.value ? Number(tampInput.value) : null,
      tampUnit: tampUnitSelect ? tampUnitSelect.value : "kg",
      waterTemp: waterTempInput && waterTempInput.value ? Number(waterTempInput.value) : null,
      doseGrams: dose,
      yieldGrams,
      extractionTime: extractionInput && extractionInput.value ? Number(extractionInput.value) : null,
      acidityRating: aciditySelect ? aciditySelect.value : "",
      bitternessRating: bitternessSelect ? bitternessSelect.value : "",
      bodyRating: bodySelect ? bodySelect.value : "",
      aftertasteRating: aftertasteSelect ? aftertasteSelect.value : "",
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
    renderBrews(list, brews);

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
  });
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

