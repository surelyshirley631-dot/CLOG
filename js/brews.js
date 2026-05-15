import { loadBrews, saveBrews, loadKnowledgeEntries, loadSelectedKnowledgeScopes, loadAiSettings } from "./storage.js";
import { getBeans, renderBeansOptions, updateBeanStock } from "./beans.js";
import { renderGrinderOptions } from "./grinders.js";
import { renderMachineOptions } from "./machines.js";
import { syncBrewToCloud } from "./sync.js";

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

function getTodayDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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
  stopBrewTimer();
  syncBrewScoreRatingUi();
  syncFormTimerDisplay();
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

function formatMass(value) {
  const n = toNumber(value);
  if (n === null) return "Not Set";
  return `${n.toFixed(1)}g`;
}

function formatSeconds(value) {
  const n = toNumber(value);
  if (n === null) return "Not Set";
  return `${Math.max(0, n).toFixed(3)}s`;
}

function formatTimerFromMs(msValue) {
  const totalMs = Math.max(0, Math.round(msValue));
  const totalCentis = Math.floor(totalMs / 10);
  const mins = Math.floor(totalCentis / 6000);
  const secs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function formatTimer(valueSeconds) {
  const n = toNumber(valueSeconds);
  if (n === null) return "--:--.--";
  return formatTimerFromMs(n * 1000);
}

let brewTimerElapsedMs = 0;
let brewTimerRunning = false;
let brewTimerTickHandle = null;
let brewTimerStartedAtMs = 0;

function getCurrentTimerElapsedMs() {
  if (!brewTimerRunning) return brewTimerElapsedMs;
  return brewTimerElapsedMs + (performance.now() - brewTimerStartedAtMs);
}

function syncFormTimerDisplay() {
  const timerValue = document.getElementById("brew-timer-value");
  if (!timerValue) return;
  timerValue.textContent = formatTimerFromMs(getCurrentTimerElapsedMs());
}

function setTimerRunningState() {
  const mainBtn = document.getElementById("brew-timer-main");
  const resetBtn = document.getElementById("brew-timer-reset");
  if (mainBtn) {
    mainBtn.textContent = brewTimerRunning ? "Pause" : "Start";
    mainBtn.setAttribute("aria-label", brewTimerRunning ? "Pause timer" : "Start timer");
  }
  if (!resetBtn) return;
  const canReset = brewTimerRunning || brewTimerElapsedMs > 0;
  resetBtn.hidden = !canReset;
  resetBtn.disabled = !canReset;
  resetBtn.setAttribute("aria-disabled", String(!canReset));
}

function stopBrewTimer() {
  if (brewTimerRunning) {
    brewTimerElapsedMs = getCurrentTimerElapsedMs();
  }
  if (brewTimerTickHandle) {
    window.clearInterval(brewTimerTickHandle);
    brewTimerTickHandle = null;
  }
  brewTimerRunning = false;
  setTimerRunningState();
}

function startBrewTimer() {
  if (brewTimerRunning) return;
  brewTimerRunning = true;
  brewTimerStartedAtMs = performance.now();
  brewTimerTickHandle = window.setInterval(() => {
    syncFormTimerDisplay();
  }, 31);
  setTimerRunningState();
  syncFormTimerDisplay();
}

function resetBrewTimer() {
  stopBrewTimer();
  brewTimerElapsedMs = 0;
  syncFormTimerDisplay();
  setTimerRunningState();
}

function bindBrewTimerControls() {
  const mainBtn = document.getElementById("brew-timer-main");
  const resetBtn = document.getElementById("brew-timer-reset");
  if (mainBtn) {
    mainBtn.addEventListener("click", () => {
      if (brewTimerRunning) {
        stopBrewTimer();
        syncFormTimerDisplay();
        return;
      }
      startBrewTimer();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!resetBtn.disabled) {
        resetBrewTimer();
      }
    });
  }
  setTimerRunningState();
}

function extractMeaningfulNotes(notes) {
  if (!notes || !String(notes).trim()) return "";
  const cleaned = String(notes).replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 140);
}

function tokenizeQuery(text) {
  const raw = String(text || "").toLowerCase();
  const english = raw.match(/[a-z]{3,}/g) || [];
  const chinese = raw.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  return Array.from(new Set([...english, ...chinese]));
}

function pickScopedKnowledge(brew, limit = 2) {
  const selectedScopeIds = loadSelectedKnowledgeScopes();
  if (!selectedScopeIds.length) return [];
  const allEntries = loadKnowledgeEntries();
  const entries = allEntries.filter(entry => selectedScopeIds.includes(entry.scopeId));
  if (!entries.length) return [];
  const query = [
    brew.notes || "",
    brew.grindSize || "",
    brew.waterTemp != null ? `temp ${brew.waterTemp}` : "",
    brew.extractionTime != null ? `time ${brew.extractionTime}` : "",
    brew.waterPressure != null ? `pressure ${brew.waterPressure}` : ""
  ].join(" ");
  const tokens = tokenizeQuery(query);
  const scored = entries
    .map(entry => {
      const content = String(entry.content || "");
      const lower = content.toLowerCase();
      const score = tokens.reduce((sum, token) => (lower.includes(token) ? sum + 1 : sum), 0);
      return { entry, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.entry);
  if (scored.length) return scored;
  return entries.slice(0, limit);
}

function buildInsightPromptContext(brew, scopedKnowledge, fallbackText) {
  const parts = [
    `Notes: ${brew.notes || "none"}`,
    `Grind: ${brew.grindSize || "Not Set"}`,
    `Temp: ${brew.waterTemp != null ? `${brew.waterTemp}°C` : "Not Set"}`,
    `Time: ${brew.extractionTime != null ? `${brew.extractionTime}s` : "Not Set"}`,
    `Pressure: ${brew.waterPressure != null ? `${brew.waterPressure} bar` : "Not Set"}`,
    `Fallback Advice: ${fallbackText}`
  ];
  if (scopedKnowledge.length) {
    parts.push(
      `Selected Scope Notes: ${scopedKnowledge
        .map(entry => String(entry.content || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(" | ")}`
    );
  }
  return parts.join("\n");
}

function resolveAiProvider(ai) {
  const model = String(ai.model || "").toLowerCase();
  const key = String(ai.apiKey || "");
  if (key.startsWith("AIza") || model.startsWith("gemini")) return "gemini";
  return "openai";
}

async function requestAiInsight(brew, fallbackText, scopedKnowledge) {
  const ai = loadAiSettings();
  if (!ai.enabled || !ai.apiKey) return fallbackText;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);
  const provider = resolveAiProvider(ai);
  const promptContext = buildInsightPromptContext(brew, scopedKnowledge, fallbackText);
  try {
    let response;
    if (provider === "gemini") {
      const model = ai.model || "gemini-2.0-flash";
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are a coffee extraction coach. Respond in English only, in 1-2 concise sentences, with directly actionable next-cup adjustments. Do not mention technical terms like RAG, model, document source, or retrieval."
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: promptContext }]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 140
          }
        }),
        signal: controller.signal
      });
    } else {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ai.apiKey}`
        },
        body: JSON.stringify({
          model: ai.model || "gpt-4o-mini",
          temperature: 0.4,
          max_tokens: 140,
          messages: [
            {
              role: "system",
              content:
                "You are a coffee extraction coach. Respond in English only, in 1-2 concise sentences, with directly actionable next-cup adjustments. Do not mention technical terms like RAG, model, document source, or retrieval."
            },
            {
              role: "user",
              content: promptContext
            }
          ]
        }),
        signal: controller.signal
      });
    }
    if (!response.ok) return fallbackText;
    const data = await response.json();
    let content = "";
    if (provider === "gemini") {
      const parts =
        data && data.candidates && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)
          ? data.candidates[0].content.parts
          : [];
      content = parts
        .map(part => String((part && part.text) || "").trim())
        .filter(Boolean)
        .join(" ");
    } else {
      content = data && data.choices && data.choices[0] && data.choices[0].message ? String(data.choices[0].message.content || "").trim() : "";
    }
    if (!content) return fallbackText;
    return content.replace(/\s+/g, " ").trim();
  } catch {
    return fallbackText;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function applyInsightText(insightBody, brew) {
  const fallbackText = buildInsightText(brew);
  insightBody.textContent = fallbackText;
  const scopedKnowledge = pickScopedKnowledge(brew, 2);
  const requestKey = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  insightBody.setAttribute("data-request-key", requestKey);
  requestAiInsight(brew, fallbackText, scopedKnowledge).then(text => {
    if (!insightBody.isConnected) return;
    if (insightBody.getAttribute("data-request-key") !== requestKey) return;
    insightBody.textContent = text || fallbackText;
  });
}

function buildInsightText(brew) {
  const notesText = extractMeaningfulNotes(brew.notes);
  const notesLower = notesText.toLowerCase();
  const grind = displayValue(brew.grindSize);
  const temp = displayValue(brew.waterTemp, "°C");
  const time = formatSeconds(brew.extractionTime);
  const lines = [];

  const noteRules = [
    {
      match: /(太酸|偏酸|酸尖|sour|sharp|tart)/i,
      advice: `Your notes suggest the cup leans sharp and acidic up front. For the next brew, tighten grind by half a step, raise temperature to ${temp === "Not Set" ? "93-94°C" : `${Math.min(96, (toNumber(brew.waterTemp) || 93) + 1)}°C`}, and target ${time === "Not Set" ? "24-30s" : `${Math.max(22, (toNumber(brew.extractionTime) || 24) + 2)}s`}.`
    },
    {
      match: /(苦涩|过苦|木涩|bitter|astringent|dry)/i,
      advice: `Your notes point to bitterness in the finish. Go half a step coarser, shorten the shot to ${time === "Not Set" ? "22-26s" : `${Math.max(18, (toNumber(brew.extractionTime) || 25) - 2)}s`}, and keep water closer to ${temp === "Not Set" ? "91-93°C" : `${Math.max(88, (toNumber(brew.waterTemp) || 92) - 1)}°C`}.`
    },
    {
      match: /(流速快|跑得快|过快|fast flow|runs fast|gusher)/i,
      advice: `The flow seems too fast. Go one step finer and slightly increase dose so the flow settles, with a target time around ${time === "Not Set" ? "25-30s" : `${Math.max(24, toNumber(brew.extractionTime) || 25)}s`}.`
    },
    {
      match: /(流速慢|堵塞|闷住|slow flow|choke|stalled)/i,
      advice: "The flow looks too slow or close to choking. Start by going half a step coarser and easing puck resistance so extraction returns to a smoother range."
    }
  ];

  noteRules.forEach(rule => {
    if (rule.match.test(notesText) || rule.match.test(notesLower)) {
      lines.push(rule.advice);
    }
  });

  if (!lines.length) {
    const tempValue = toNumber(brew.waterTemp);
    const timeValue = toNumber(brew.extractionTime);
    if (timeValue !== null && timeValue < 20) {
      lines.push("This brew ran short. Try a slightly finer grind and a bit more contact time to build sweetness and body.");
    } else if (timeValue !== null && timeValue > 35) {
      lines.push("This brew ran long. Go slightly coarser or reduce dose a touch to avoid bitterness building in the finish.");
    }
    if (tempValue !== null && tempValue > 96) {
      lines.push("The water temperature is on the high side. Bring it down to about 92-94°C for a cleaner cup.");
    } else if (tempValue !== null && tempValue < 88) {
      lines.push("The water temperature is low. Raise it to around 90-93°C to improve extraction completeness.");
    }
  }

  if (!lines.length) {
    lines.push(`Use the current settings as your baseline (Grind ${grind} / Temp ${temp} / Time ${time}). On the next cup, change only one variable, such as grind or time, to find the sweetness balance point more reliably.`);
  }

  const scopedKnowledge = pickScopedKnowledge(brew, 2);
  if (scopedKnowledge.length) {
    const knowledgeText = scopedKnowledge
      .map(entry => String(entry.content || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map(text => text.slice(0, 72))
      .join("; ");
    if (knowledgeText) {
      lines[0] = `${lines[0]} Selected note highlights: ${knowledgeText}.`;
    }
  }

  if (notesText) {
    return `Based on your note "${notesText}", ${lines[0]}`;
  }
  return lines[0];
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

function syncBrewScoreRatingUi() {
  const scoreInput = document.getElementById("brew-score");
  const ratingWrap = document.getElementById("brew-score-beans");
  const valueLabel = document.getElementById("brew-score-value");
  if (!scoreInput || !ratingWrap) return;
  const score = Math.max(0, Math.min(10, Number(scoreInput.value) || 0));
  ratingWrap.querySelectorAll(".brew-bean-btn").forEach(button => {
    const value = Number(button.getAttribute("data-score") || "0");
    const isActive = score >= value && value > 0;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  if (valueLabel) {
    valueLabel.textContent = score > 0 ? `${score}/10` : "Not Rated";
  }
}

function initBrewScoreRatingUi() {
  const scoreInput = document.getElementById("brew-score");
  const ratingWrap = document.getElementById("brew-score-beans");
  if (!scoreInput || !ratingWrap) return;
  const beanSvg = `
    <svg viewBox="0 0 28 34" aria-hidden="true">
      <defs>
        <linearGradient id="beanGradient" x1="7" y1="4" x2="22" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#4a2f1f"></stop>
          <stop offset="58%" stop-color="#7c4a28"></stop>
          <stop offset="100%" stop-color="#b45309"></stop>
        </linearGradient>
      </defs>
      <ellipse class="bean-body" cx="14" cy="17" rx="9.6" ry="13.2"></ellipse>
      <path class="bean-seam-shadow" d="M13.4 6.4c-2.4 3.6-2.5 6.8-.4 9.6 2 2.8 1.8 5.7-1.5 9.8"></path>
      <path class="bean-seam" d="M14.6 6.5c-2.2 3.3-2.2 6.1-.3 8.7 1.9 2.7 1.7 5.3-1.2 8.9"></path>
      <ellipse class="bean-highlight" cx="10" cy="10.8" rx="2.4" ry="3.8"></ellipse>
    </svg>
  `;
  ratingWrap.querySelectorAll(".brew-bean-btn").forEach(button => {
    button.innerHTML = beanSvg;
  });
  if (ratingWrap.getAttribute("data-bound") !== "true") {
    ratingWrap.querySelectorAll(".brew-bean-btn").forEach(button => {
      button.addEventListener("click", () => {
        const value = Number(button.getAttribute("data-score") || "0");
        const current = Number(scoreInput.value) || 0;
        scoreInput.value = current === value ? "" : String(value);
        button.classList.remove("pop");
        void button.offsetWidth;
        button.classList.add("pop");
        syncBrewScoreRatingUi();
      });
    });
    ratingWrap.setAttribute("data-bound", "true");
  }
  syncBrewScoreRatingUi();
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

  const scoreWrap = document.createElement("div");
  scoreWrap.className = "brew-detail-score-wrap";
  const badge = document.createElement("div");
  badge.className = "brew-detail-score-badge";
  badge.textContent = scoreValue !== null ? String(scoreValue) : "—";
  const badgeLabel = document.createElement("div");
  badgeLabel.className = "brew-score-caption";
  badgeLabel.textContent = "SCORE";
  scoreWrap.appendChild(badge);
  scoreWrap.appendChild(badgeLabel);

  const insightCard = document.createElement("div");
  insightCard.className = "brew-insight-card";
  const insightTitle = document.createElement("div");
  insightTitle.className = "brew-insight-title";
  insightTitle.textContent = "INSIGHT";
  const insightBody = document.createElement("div");
  insightBody.className = "brew-insight-body";
  applyInsightText(insightBody, brew);
  insightCard.appendChild(insightTitle);
  insightCard.appendChild(insightBody);
  if (scoreValue !== null && scoreValue > 0) {
    insightCard.classList.add("is-ready");
    requestAnimationFrame(() => {
      insightCard.classList.add("is-visible");
    });
  } else {
    insightCard.hidden = true;
  }
  scoreWrap.appendChild(insightCard);

  head.appendChild(titleWrap);
  head.appendChild(scoreWrap);

  const metricsGrid = document.createElement("div");
  metricsGrid.className = "brew-detail-mobile-grid";
  const tempCard = document.createElement("div");
  tempCard.className = "brew-detail-module";
  const tempLabel = document.createElement("div");
  tempLabel.className = "brew-detail-module-label";
  tempLabel.textContent = "TEMP (°C)";
  const tempValue = document.createElement("div");
  tempValue.className = "brew-detail-module-value";
  tempValue.textContent = displayValue(brew.waterTemp);
  tempCard.appendChild(tempLabel);
  tempCard.appendChild(tempValue);

  const timeCard = document.createElement("div");
  timeCard.className = "brew-detail-module";
  const timeLabel = document.createElement("div");
  timeLabel.className = "brew-detail-module-label";
  timeLabel.textContent = "TIME (S)";
  const timeValue = document.createElement("div");
  timeValue.className = "brew-detail-module-value";
  timeValue.textContent = formatSeconds(brew.extractionTime);
  timeCard.appendChild(timeLabel);
  timeCard.appendChild(timeValue);

  const doseYieldCard = document.createElement("div");
  doseYieldCard.className = "brew-detail-module brew-detail-dose-yield";
  const doseYieldLabel = document.createElement("div");
  doseYieldLabel.className = "brew-detail-module-label";
  doseYieldLabel.textContent = "DOSE / YIELD";
  const doseYieldValues = document.createElement("div");
  doseYieldValues.className = "brew-detail-dose-yield-values";
  const doseValue = document.createElement("span");
  doseValue.className = "brew-detail-dose-yield-value";
  doseValue.textContent = formatMass(brew.doseGrams);
  const separator = document.createElement("span");
  separator.className = "brew-detail-dose-yield-separator";
  separator.textContent = "|";
  const yieldValue = document.createElement("span");
  yieldValue.className = "brew-detail-dose-yield-value";
  yieldValue.textContent = formatMass(brew.yieldGrams);
  doseYieldValues.appendChild(doseValue);
  doseYieldValues.appendChild(separator);
  doseYieldValues.appendChild(yieldValue);
  doseYieldCard.appendChild(doseYieldLabel);
  doseYieldCard.appendChild(doseYieldValues);

  const timerCard = document.createElement("div");
  timerCard.className = "brew-detail-module";
  const timerLabel = document.createElement("div");
  timerLabel.className = "brew-detail-module-label";
  timerLabel.textContent = "TIMER";
  const timerValue = document.createElement("div");
  timerValue.className = "brew-detail-module-timer";
  const timerIcon = document.createElement("i");
  timerIcon.className = "brew-detail-timer-icon";
  timerIcon.setAttribute("data-lucide", "clock-3");
  const timerText = document.createElement("span");
  timerText.className = "brew-detail-module-value";
  timerText.textContent = formatTimer(brew.extractionTime);
  timerValue.appendChild(timerIcon);
  timerValue.appendChild(timerText);
  timerCard.appendChild(timerLabel);
  timerCard.appendChild(timerValue);

  metricsGrid.appendChild(tempCard);
  metricsGrid.appendChild(timeCard);
  metricsGrid.appendChild(doseYieldCard);
  metricsGrid.appendChild(timerCard);

  const notesTitle = document.createElement("h5");
  notesTitle.className = "brew-detail-section-title";
  notesTitle.textContent = "Notes";
  const notesBox = document.createElement("div");
  notesBox.className = "brew-notes-box";
  notesBox.textContent = brew.notes && brew.notes.trim() ? brew.notes.trim() : "No tasting notes.";
  const notesWrap = document.createElement("div");
  notesWrap.className = "brew-detail-notes-wrap";
  notesWrap.appendChild(notesTitle);
  const acidityLegacy = toNumber(brew.acidityRating);
  const bitternessLegacy = toNumber(brew.bitternessRating);
  if (acidityLegacy !== null || bitternessLegacy !== null) {
    const legacy = document.createElement("div");
    legacy.className = "brew-legacy-profile";
    const parts = [];
    if (acidityLegacy !== null) parts.push(`Acidity ${acidityLegacy}`);
    if (bitternessLegacy !== null) parts.push(`Bitterness ${bitternessLegacy}`);
    legacy.textContent = `Legacy Profile: ${parts.join(", ")}.`;
    notesWrap.appendChild(legacy);
  }
  notesWrap.appendChild(notesBox);

  card.appendChild(head);
  card.appendChild(metricsGrid);
  card.appendChild(notesWrap);
  shell.appendChild(card);
  container.appendChild(shell);
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
  initBrewScoreRatingUi();
  bindBrewTimerControls();
  stopBrewTimer();
  syncFormTimerDisplay();
  const dateInput = document.getElementById("brew-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayDateString();
  }
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

  form.addEventListener("submit", async event => {
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
      date: dateInput.value || getTodayDateString(),
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
    resetBrewTimer();
    form.reset();
    if (dateInput) {
      dateInput.value = getTodayDateString();
    }
    syncBrewScoreRatingUi();
    syncFormTimerDisplay();
    renderBeansOptions(beanSelect);
    renderMachineOptions(machineSelect);
    renderGrinderOptions(grinderSelect);
    renderBrews(list, brews);
    document.dispatchEvent(new CustomEvent("brews-updated", { detail: { brews } }));
    syncBrewToCloud(brew).catch(error => {
      console.error("Cloud backup failed", error);
    });

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
  const dateInput = document.getElementById("brew-date");
  const today = getTodayDateString();
  if (dateInput) {
    dateInput.value = today;
  }
  const brews = loadBrews();
  if (!brews.length) return;
  const confirmed = window.confirm("Refill with the data from last time?");
  if (!confirmed) return;
  const last = brews[0];
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
  if (dateInput) dateInput.value = today;
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
  stopBrewTimer();
  syncBrewScoreRatingUi();
  syncFormTimerDisplay();
}

function buildFlavorSummary(brew) {
  const parts = [];
  if (brew.acidityRating) parts.push(`Acidity ${brew.acidityRating}/5`);
  if (brew.bitternessRating) parts.push(`Bitterness ${brew.bitternessRating}/5`);
  if (brew.bodyRating) parts.push(`Body ${brew.bodyRating}/5`);
  if (brew.aftertasteRating) parts.push(`Aftertaste ${brew.aftertasteRating}/5`);
  return parts.join(" • ");
}

function compareBrewsByDateDesc(a, b) {
  const aDate = Date.parse((a && a.date) || "");
  const bDate = Date.parse((b && b.date) || "");
  const aValid = Number.isFinite(aDate);
  const bValid = Number.isFinite(bDate);
  if (aValid && bValid && aDate !== bDate) return bDate - aDate;
  if (aValid && !bValid) return -1;
  if (!aValid && bValid) return 1;
  return String((b && b.id) || "").localeCompare(String((a && a.id) || ""));
}

function renderBrews(list, brews, selectedDetailId = "") {
  list.innerHTML = "";
  if (!brews.length) return;

  const beans = getBeans();
  const isMainList = list.id === "brew-list";
  const isHomeList = list.id === "home-brew-list";
  const displayBrews = isMainList ? [...brews].sort(compareBrewsByDateDesc) : brews;

  displayBrews.forEach(brew => {
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
      side.className = "item-side brew-side";
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
        const scoreCaption = document.createElement("span");
        scoreCaption.className = "brew-score-caption brew-score-caption-small";
        scoreCaption.textContent = "SCORE";
        side.appendChild(scoreLabel);
        side.appendChild(scoreCaption);
      }
      li.appendChild(side);
    }

    if (isHomeList && selectedDetailId === brew.id) {
      li.appendChild(buildInlineDetail(brew));
    }

    list.appendChild(li);
  });
}
