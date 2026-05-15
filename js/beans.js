import { loadBeans, saveBeans } from "./storage.js";

function generateId() {
  return `bean_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

function classifyFreshness(roastDateIso) {
  if (!roastDateIso) {
    return { label: "Unknown window", className: "" };
  }
  const roast = new Date(roastDateIso);
  const now = new Date();
  const days = daysBetween(roast, now);
  if (days <= 3) {
    return { label: "Very fresh", className: "bean-freshness-fresh" };
  }
  if (days <= 14) {
    return { label: "At peak", className: "bean-freshness-peak" };
  }
  if (days <= 28) {
    return { label: "Use soon", className: "bean-freshness-soon" };
  }
  return { label: "Past best window", className: "bean-freshness-past" };
}

export function getBeans() {
  return loadBeans();
}

export function updateBeanStock(beanId, deltaGrams) {
  const beans = loadBeans();
  const idx = beans.findIndex(b => b.id === beanId);
  if (idx === -1) return;
  const bean = beans[idx];
  const current = typeof bean.remainingWeight === "number" ? bean.remainingWeight : bean.initialWeight || 0;
  const updated = Math.max(0, current - (deltaGrams || 0));
  beans[idx] = { ...bean, remainingWeight: updated };
  saveBeans(beans);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function toOptimizedPhotoDataUrl(file) {
  const original = await readFileAsDataUrl(file);
  const image = await loadImage(original);
  const maxEdge = 1280;
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return original;
  }
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function normalizeOcrLine(line) {
  return String(line || "")
    .replace(/[|]/g, "I")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateForInput(value) {
  if (!value) return "";
  const cleaned = String(value).trim().replace(/[.]/g, "-").replace(/\//g, "-");
  const yyyyMmDd = cleaned.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (yyyyMmDd) {
    const [, year, month, day] = yyyyMmDd;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const ddMmYyyy = cleaned.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function extractOpenDate(text) {
  const patterns = [
    /(?:open(?:ed)?|opened on|date opened|open date)\s*[:\-]?\s*([0-9./-]{6,10})/i,
    /(?:roast(?:ed)?|roast date|packed on|bagged on)\s*[:\-]?\s*([0-9./-]{6,10})/i,
    /\b(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/,
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const normalized = normalizeDateForInput(match[1]);
    if (normalized) return normalized;
  }
  return "";
}

function detectBeanType(text) {
  if (/\bblend\b/i.test(text)) return "blend";
  if (/\barabica\b/i.test(text)) return "arabica";
  if (/\brobusta\b/i.test(text)) return "robusta";
  if (/\bliberica\b/i.test(text)) return "liberica";
  if (/\bexcelsa\b/i.test(text)) return "excelsa";
  return "";
}

function detectRoastType(text) {
  if (/\bmedium[\s-]?dark\b/i.test(text)) return "medium-dark";
  if (/\bmedium[\s-]?light\b/i.test(text)) return "medium-light";
  if (/\bdark roast\b|\bdark\b/i.test(text)) return "dark";
  if (/\blight roast\b|\blight\b/i.test(text)) return "light";
  if (/\bmedium roast\b|\bmedium\b/i.test(text)) return "medium";
  return "";
}

function extractBeanName(lines) {
  const blocked = /(farm|altitude|variety|aroma|origin|process|washed|natural|roast|date|grams|weight|notes|producer|region|coffee|beans|espresso|filter|blend|anaerobic|geisha|gesha)/i;
  const candidates = lines
    .map(normalizeOcrLine)
    .filter(line => line && line.length >= 3 && line.length <= 48)
    .filter(line => !/\d{2,}/.test(line))
    .filter(line => !blocked.test(line));
  if (!candidates.length) return "";
  const best = candidates[0].replace(/^[^A-Za-z]+/, "").trim();
  return best;
}

function extractStructuredNotes(lines) {
  const noteLabels = /(farm|altitude|variety|aroma|flavor|flavour|origin|region|producer|process|washed|natural|honey|anaerobic|roaster|lot|elevation)/i;
  const seen = new Set();
  const selected = [];
  lines.forEach(line => {
    const cleaned = normalizeOcrLine(line);
    if (!cleaned || cleaned.length < 3) return;
    if (!noteLabels.test(cleaned)) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(cleaned);
  });
  return selected.slice(0, 8).join("\n");
}

function parsePackageOcrText(rawText) {
  const text = String(rawText || "").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map(normalizeOcrLine)
    .filter(Boolean);
  return {
    name: extractBeanName(lines),
    beanType: detectBeanType(text),
    roastType: detectRoastType(text),
    openDate: extractOpenDate(text),
    notes: extractStructuredNotes(lines),
    rawText: lines.join("\n")
  };
}

async function recognizePackageText(file) {
  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    throw new Error("OCR engine is not loaded yet. Please check your connection and try again.");
  }
  const source = await readFileAsDataUrl(file);
  const result = await window.Tesseract.recognize(source, "eng", {
    logger: () => {}
  });
  return result && result.data && typeof result.data.text === "string" ? result.data.text : "";
}

function trySaveBeans(beans) {
  try {
    saveBeans(beans);
    return true;
  } catch {
    window.alert("保存失败：图片过大，请换一张更小的图片后重试。");
    return false;
  }
}

export function bindBeansUi() {
  const form = document.getElementById("bean-form");
  const list = document.getElementById("bean-list");
  const clearBtn = document.getElementById("clear-beans");
  if (!form || !list || !clearBtn) return;

  const nameInput = document.getElementById("bean-name");
  const typeSelect = document.getElementById("bean-type");
  const roastTypeSelect = document.getElementById("bean-roast-type");
  const openDateInput = document.getElementById("bean-open-date");
  const notesInput = document.getElementById("bean-notes");
  const photoInput = document.getElementById("bean-photo");
  const ocrInput = document.getElementById("bean-package-ocr");
  const ocrRunBtn = document.getElementById("bean-ocr-run");
  const ocrStatus = document.getElementById("bean-ocr-status");
  if (!nameInput) return;

  let editingId = null;

  const setOcrStatus = (message, tone = "") => {
    if (!ocrStatus) return;
    ocrStatus.textContent = message;
    ocrStatus.className = tone ? `bean-ocr-status ${tone}` : "bean-ocr-status";
  };

  const applyOcrResult = parsed => {
    if (parsed.name && !nameInput.value.trim()) {
      nameInput.value = parsed.name;
    }
    if (typeSelect && parsed.beanType && !typeSelect.value) {
      typeSelect.value = parsed.beanType;
    }
    if (roastTypeSelect && parsed.roastType && !roastTypeSelect.value) {
      roastTypeSelect.value = parsed.roastType;
    }
    if (openDateInput && parsed.openDate && !openDateInput.value) {
      openDateInput.value = parsed.openDate;
    }
    if (notesInput) {
      const current = notesInput.value.trim();
      const next = parsed.notes || "";
      if (next && !current) {
        notesInput.value = next;
      } else if (next && current && !current.includes(next)) {
        notesInput.value = `${current}\n${next}`.trim();
      }
    }
  };

  if (ocrRunBtn && ocrInput) {
    ocrRunBtn.addEventListener("click", async () => {
      const file = ocrInput.files && ocrInput.files[0];
      if (!file) {
        setOcrStatus("Choose or capture a package photo first.", "is-error");
        return;
      }
      ocrRunBtn.disabled = true;
      setOcrStatus("Reading photo details...", "is-working");
      try {
        const text = await recognizePackageText(file);
        const parsed = parsePackageOcrText(text);
        applyOcrResult(parsed);
        const filledCount = [parsed.name, parsed.beanType, parsed.roastType, parsed.openDate, parsed.notes].filter(Boolean).length;
        if (!filledCount) {
          setOcrStatus("Photo info finished, but no clear bean fields were detected. You can still use the photo upload below.", "is-warning");
        } else {
          setOcrStatus(`Photo info filled ${filledCount} field${filledCount === 1 ? "" : "s"}. Bean photo upload stays separate.`, "is-success");
        }
      } catch (error) {
        setOcrStatus(error instanceof Error ? error.message : "Photo info failed. Please try a clearer package photo.", "is-error");
      } finally {
        ocrRunBtn.disabled = false;
      }
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const beans = loadBeans();
    const beanType = typeSelect ? typeSelect.value : "";
    const roastType = roastTypeSelect ? roastTypeSelect.value : "";
    const openDate = openDateInput ? openDateInput.value : "";
    const notes = notesInput ? notesInput.value.trim() : "";

    const file = photoInput && photoInput.files ? photoInput.files[0] : null;
    let photoDataUrl = "";
    if (file) {
      try {
        photoDataUrl = await toOptimizedPhotoDataUrl(file);
      } catch {
        window.alert("图片读取失败，请重新选择图片。");
        return;
      }
    }

    if (editingId) {
      const idx = beans.findIndex(b => b.id === editingId);
      if (idx !== -1) {
        const existing = beans[idx];
        beans[idx] = {
          ...existing,
          name,
          beanType,
          roastType,
          openDate,
          notes,
          photoDataUrl: photoDataUrl || existing.photoDataUrl || ""
        };
      }
    } else {
      const bean = {
        id: generateId(),
        name,
        beanType,
        roastType,
        openDate,
        notes,
        photoDataUrl: photoDataUrl || ""
      };
      beans.unshift(bean);
    }

    if (!trySaveBeans(beans)) {
      return;
    }
    editingId = null;
    form.reset();
    if (photoInput) {
      photoInput.value = "";
    }
    if (ocrInput) {
      ocrInput.value = "";
    }
    setOcrStatus("");
    renderBeans(list, beans);
    document.dispatchEvent(new CustomEvent("beans-updated", { detail: { beans } }));
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all beans from your pantry?");
    if (!confirmed) return;
    saveBeans([]);
    renderBeans(list, []);
    document.dispatchEvent(new CustomEvent("beans-updated", { detail: { beans: [] } }));
  });

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("bean-edit-button")) return;
    const li = target.closest("li");
    if (!li || !li.dataset.beanId) return;
    const beans = loadBeans();
    const bean = beans.find(b => b.id === li.dataset.beanId);
    if (!bean) return;
    editingId = bean.id;
    nameInput.value = bean.name || "";
    if (typeSelect) typeSelect.value = bean.beanType || "";
    if (roastTypeSelect) roastTypeSelect.value = bean.roastType || "";
    if (openDateInput) openDateInput.value = bean.openDate || "";
    if (notesInput) notesInput.value = bean.notes || "";
    if (photoInput) photoInput.value = "";
    if (ocrInput) ocrInput.value = "";
    setOcrStatus("Editing bean entry. You can run Photo info again to append package details.", "is-working");
  });

  renderBeans(list, loadBeans());
}

export function renderBeansOptions(select) {
  const beans = loadBeans();
  const current = select.value;
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No bean selected";
  select.appendChild(empty);
  beans.forEach(bean => {
    const option = document.createElement("option");
    option.value = bean.id;
    option.textContent = bean.name;
    if (current && current === bean.id) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function renderBeans(list, beans) {
  list.innerHTML = "";
  if (!beans.length) return;
  const sortedBeans = [...beans].sort((a, b) => {
    const aDate = a && a.openDate ? Date.parse(a.openDate) : NaN;
    const bDate = b && b.openDate ? Date.parse(b.openDate) : NaN;
    const aValid = Number.isFinite(aDate);
    const bValid = Number.isFinite(bDate);
    if (aValid && bValid) return bDate - aDate;
    if (aValid) return -1;
    if (bValid) return 1;
    return String(a && a.name ? a.name : "").localeCompare(String(b && b.name ? b.name : ""));
  });
  sortedBeans.forEach(bean => {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.beanId = bean.id;
    const main = document.createElement("div");
    main.className = "item-main";
    if (bean.photoDataUrl) {
      const thumbnail = document.createElement("img");
      thumbnail.className = "bean-photo-thumb";
      thumbnail.src = bean.photoDataUrl;
      thumbnail.alt = bean.name || "Bean photo";
      main.appendChild(thumbnail);
    }
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = bean.name;
    const meta = document.createElement("div");
    meta.className = "item-meta";
    const parts = [];
    if (bean.beanType) parts.push(bean.beanType);
    if (bean.roastType) parts.push(bean.roastType);
    if (bean.openDate) parts.push(`Opened ${bean.openDate}`);
    meta.textContent = parts.join(" • ");
    const tags = document.createElement("div");
    tags.className = "item-tags";
    if (bean.notes) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = bean.notes;
      tags.appendChild(t);
    }
    main.appendChild(title);
    main.appendChild(meta);
    main.appendChild(tags);
    li.appendChild(main);

    const actions = document.createElement("div");
    actions.className = "item-side";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-button small-button bean-edit-button";
    editBtn.textContent = "Edit";
    actions.appendChild(editBtn);
    li.appendChild(actions);

    list.appendChild(li);
  });
}
