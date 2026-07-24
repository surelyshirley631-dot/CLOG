import { loadBrews } from "./storage.js";
import { getBeans } from "./beans.js";

const STICKER_PRIMARY = "./sticker.png";
const BREW_RHYTHM_COLOR = "150, 112, 92";
let stickerSourcePromise = null;

function toLocalDateKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseDateKey(dateKey) {
  if (!dateKey) return null;
  const parsed = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const day = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getFullDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("sticker-load-failed"));
    image.src = src;
  });
}

async function buildProcessedStickerSource() {
  const image = await loadImageSource(STICKER_PRIMARY);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return image.src;
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = frame;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const average = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const isNearWhite = average > 238 && spread < 28;
    if (isNearWhite) {
      data[index + 3] = 0;
      continue;
    }
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  context.putImageData(frame, 0, 0);
  if (maxX < minX || maxY < minY) return image.src;

  const padding = 10;
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(width - cropX, maxX - minX + padding * 2 + 1);
  const cropHeight = Math.min(height - cropY, maxY - minY + padding * 2 + 1);
  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return image.src;
  croppedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropped.toDataURL("image/png");
}

function getStickerSource() {
  if (!stickerSourcePromise) {
    stickerSourcePromise = buildProcessedStickerSource().catch(() => STICKER_PRIMARY);
  }
  return stickerSourcePromise;
}

function getRangeAnchor(range, visibleMonth) {
  if (range !== "week") return visibleMonth;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === visibleMonth.getFullYear() && today.getMonth() === visibleMonth.getMonth();
  return isCurrentMonth ? today : endOfMonth(visibleMonth);
}

function groupBrewsByDate(brews) {
  const grouped = new Map();
  brews.forEach(brew => {
    const key = String((brew && brew.date) || "").trim();
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(brew);
    grouped.set(key, list);
  });
  return grouped;
}

function collectBrewCounts(groupedBrews) {
  const counts = new Map();
  groupedBrews.forEach((list, key) => {
    counts.set(key, list.length);
  });
  return counts;
}

function methodLabel(method) {
  if (method === "espresso") return "Espresso";
  if (method === "pourover") return "Pour-over";
  if (method === "immersion") return "Immersion";
  if (method === "coldbrew") return "Cold brew";
  return "Other";
}

function getBeanName(beanId) {
  const bean = getBeans().find(item => item.id === beanId);
  return bean ? bean.name : "Coffee brew";
}

function isCoarsePointerDevice() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function getCalendarDaySelector() {
  let overlay = document.querySelector("[data-calendar-day-selector]");
  if (overlay instanceof HTMLElement) {
    return {
      overlay,
      title: overlay.querySelector("[data-calendar-day-title]"),
      list: overlay.querySelector("[data-calendar-day-list]"),
      close: overlay.querySelector("[data-calendar-day-close]")
    };
  }

  overlay = document.createElement("div");
  overlay.className = "calendar-day-selector";
  overlay.setAttribute("data-calendar-day-selector", "");
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="calendar-day-selector-backdrop" data-calendar-day-close></div>
    <div class="calendar-day-selector-sheet" role="dialog" aria-modal="true" aria-label="Choose a brew">
      <div class="calendar-day-selector-header">
        <div class="calendar-day-selector-title" data-calendar-day-title>Brews</div>
        <button type="button" class="ghost-button small-button" data-calendar-day-close>Close</button>
      </div>
      <div class="calendar-day-selector-list" data-calendar-day-list></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeOverlay = () => {
    overlay.hidden = true;
    document.body.classList.remove("calendar-day-selector-open");
  };

  overlay.querySelectorAll("[data-calendar-day-close]").forEach(node => {
    node.addEventListener("click", closeOverlay);
  });
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeOverlay();
  });

  return {
    overlay,
    title: overlay.querySelector("[data-calendar-day-title]"),
    list: overlay.querySelector("[data-calendar-day-list]"),
    close: overlay.querySelector("[data-calendar-day-close]")
  };
}

function openCalendarDaySelector(date, dayBrews) {
  if (!dayBrews.length) return;
  if (dayBrews.length === 1) {
    openBrewFromCalendar(dayBrews[0]);
    return;
  }

  const selector = getCalendarDaySelector();
  if (!(selector.title instanceof HTMLElement) || !(selector.list instanceof HTMLElement)) return;

  selector.title.textContent = `${getFullDateLabel(date)} · ${dayBrews.length} brews`;
  selector.list.innerHTML = "";

  dayBrews.forEach(brew => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day-choice";
    const beanName = getBeanName(brew.beanId);
    const scoreText = brew.score != null && brew.score !== "" ? `Score ${brew.score}` : "No score";
    const timeText = brew.extractionTime != null ? `${brew.extractionTime}s` : "Time not set";
    button.innerHTML = `
      <span class="calendar-day-choice-title">${beanName}</span>
      <span class="calendar-day-choice-meta">${methodLabel(brew.method)} · ${timeText} · ${scoreText}</span>
    `;
    button.addEventListener("click", () => {
      selector.overlay.hidden = true;
      document.body.classList.remove("calendar-day-selector-open");
      openBrewFromCalendar(brew);
    });
    selector.list.appendChild(button);
  });

  selector.overlay.hidden = false;
  document.body.classList.add("calendar-day-selector-open");
}

function getRangeEntries(range, anchorDate, countsByDate) {
  if (range === "year") {
    const months = [];
    const year = anchorDate.getFullYear();
    for (let month = 0; month < 12; month += 1) {
      const label = new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });
      let count = 0;
      countsByDate.forEach((value, key) => {
        const date = parseDateKey(key);
        if (date && date.getFullYear() === year && date.getMonth() === month) {
          count += value;
        }
      });
      months.push({ label, count, title: `${label} ${year}: ${count} brew${count === 1 ? "" : "s"}` });
    }
    return months;
  }

  if (range === "week") {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const key = toLocalDateKey(date);
      const count = countsByDate.get(key) || 0;
      return {
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        count,
        title: `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${count} brew${count === 1 ? "" : "s"}`
      };
    });
  }

  if (range === "month") {
    const monthStart = startOfMonth(anchorDate);
    const monthEnd = endOfMonth(anchorDate);
    const gridStart = startOfWeek(monthStart);
    const lastGridDay = addDays(monthEnd, 6 - ((monthEnd.getDay() + 6) % 7));
    const entries = [];
    let weekIndex = 0;
    for (let weekStart = new Date(gridStart); weekStart <= lastGridDay; weekStart = addDays(weekStart, 7)) {
      let count = 0;
      let hasMonthDay = false;
      for (let offset = 0; offset < 7; offset += 1) {
        const date = addDays(weekStart, offset);
        const key = toLocalDateKey(date);
        if (date.getMonth() === anchorDate.getMonth()) {
          hasMonthDay = true;
          count += countsByDate.get(key) || 0;
        }
      }
      if (!hasMonthDay) continue;
      weekIndex += 1;
      entries.push({
        label: `Week ${weekIndex}`,
        count,
        title: `Week ${weekIndex}: ${count} brew${count === 1 ? "" : "s"}`
      });
    }
    return entries;
  }

  const start = startOfMonth(anchorDate);
  const end = endOfMonth(anchorDate);
  const entries = [];
  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    const key = toLocalDateKey(date);
    const count = countsByDate.get(key) || 0;
    entries.push({
      label: String(date.getDate()),
      count,
      title: `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${count} brew${count === 1 ? "" : "s"}`
    });
  }
  return entries;
}

function openBrewFromCalendar(brew) {
  if (!brew || !brew.id) return;
  document.dispatchEvent(new CustomEvent("open-panel", { detail: { targetId: "tab-mybrews" } }));
  document.dispatchEvent(new CustomEvent("focus-brew", { detail: { brewId: brew.id, date: brew.date || "" } }));
}

function createStickerElement(brew) {
  const shell = document.createElement("button");
  shell.type = "button";
  shell.className = "calendar-sticker-shell";
  shell.setAttribute("aria-label", `Open brew from ${brew && brew.date ? brew.date : "calendar"}`);
  const sticker = document.createElement("img");
  sticker.className = "calendar-sticker";
  sticker.alt = "Coffee cup sticker";
  getStickerSource().then(src => {
    sticker.src = src;
  });
  shell.appendChild(sticker);
  shell.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openBrewFromCalendar(brew);
  });
  return shell;
}

function createStickerStack(dayBrews) {
  const count = dayBrews.length;
  const stack = document.createElement("div");
  stack.className = "calendar-sticker-stack";
  stack.dataset.count = String(count);
  for (let index = 0; index < count; index += 1) {
    stack.appendChild(createStickerElement(dayBrews[index]));
  }
  return stack;
}

function attachCalendarTooltip(cell) {
  const show = () => {
    cell.classList.add("is-tooltip-visible");
  };
  const hide = () => {
    cell.classList.remove("is-tooltip-visible");
  };

  cell.addEventListener("mouseenter", show);
  cell.addEventListener("mouseleave", hide);
  cell.addEventListener("focus", show);
  cell.addEventListener("blur", hide);
  cell.addEventListener("click", event => {
    event.preventDefault();
    const isVisible = cell.classList.contains("is-tooltip-visible");
    document.querySelectorAll(".calendar-day.is-tooltip-visible").forEach(node => {
      if (node !== cell) node.classList.remove("is-tooltip-visible");
    });
    cell.classList.toggle("is-tooltip-visible", !isVisible);
  });
  cell.addEventListener("keydown", event => {
    if (!(event.key === "Enter" || event.key === " ")) return;
    event.preventDefault();
    const isVisible = cell.classList.contains("is-tooltip-visible");
    document.querySelectorAll(".calendar-day.is-tooltip-visible").forEach(node => {
      if (node !== cell) node.classList.remove("is-tooltip-visible");
    });
    cell.classList.toggle("is-tooltip-visible", !isVisible);
  });
}

function attachCalendarInteractions(cell, date, dayBrews) {
  attachCalendarTooltip(cell);

  cell.addEventListener("click", event => {
    if (!isCoarsePointerDevice() || !dayBrews.length) return;
    event.preventDefault();
    event.stopPropagation();
    cell.classList.remove("is-tooltip-visible");
    openCalendarDaySelector(date, dayBrews);
  });

  cell.addEventListener("keydown", event => {
    if (!(event.key === "Enter" || event.key === " ")) return;
    if (!dayBrews.length) return;
    event.preventDefault();
    openCalendarDaySelector(date, dayBrews);
  });
}

function renderCalendarGrid(grid, monthDate, brewsByDate) {
  grid.innerHTML = "";
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart);
  const lastGridDay = addDays(monthEnd, 6 - ((monthEnd.getDay() + 6) % 7));
  const todayKey = toLocalDateKey(new Date());
  let maxCount = 0;
  for (let date = new Date(gridStart); date <= lastGridDay; date = addDays(date, 1)) {
    const key = toLocalDateKey(date);
    maxCount = Math.max(maxCount, (brewsByDate.get(key) || []).length);
  }

  for (let date = new Date(gridStart); date <= lastGridDay; date = addDays(date, 1)) {
    const key = toLocalDateKey(date);
    const dayBrews = brewsByDate.get(key) || [];
    const count = dayBrews.length;
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    if (date.getMonth() !== monthDate.getMonth()) cell.classList.add("is-outside");
    if (key === todayKey) cell.classList.add("is-today");
    if (count > 0) cell.classList.add("has-brew");
    const intensity = maxCount ? count / maxCount : 0;
    cell.style.setProperty("--calendar-cell-tint", `${0.06 + intensity * 0.24}`);
    cell.style.setProperty("--calendar-cell-border", `${0.12 + intensity * 0.22}`);
    cell.style.setProperty("--calendar-cell-scale", count ? "1.02" : "1.01");

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(date.getDate());
    cell.appendChild(dayNumber);

    if (count > 0) {
      cell.appendChild(createStickerStack(dayBrews));
    }

    const tooltip = document.createElement("span");
    tooltip.className = "calendar-day-tooltip";
    tooltip.textContent = getFullDateLabel(date);
    cell.appendChild(tooltip);

    attachCalendarInteractions(cell, date, dayBrews);
    grid.appendChild(cell);
  }
}

function renderWeekRhythm(container, entries, max) {
  container.className = "calendar-heatmap calendar-heatmap-week-bars";
  entries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "calendar-rhythm-row";

    const meta = document.createElement("div");
    meta.className = "calendar-rhythm-meta";
    const label = document.createElement("span");
    label.className = "calendar-rhythm-label";
    label.textContent = entry.label;
    meta.appendChild(label);

    const bar = document.createElement("div");
    bar.className = "calendar-rhythm-bar";
    const fill = document.createElement("div");
    fill.className = "calendar-rhythm-fill";
    const widthPercent = max === 0 ? 0 : Math.max(10, (entry.count / max) * 100);
    const alpha = max === 0 ? 0.12 : 0.28 + (entry.count / max) * 0.42;
    fill.style.width = `${entry.count === 0 ? 0 : widthPercent}%`;
    fill.style.background = `rgba(${BREW_RHYTHM_COLOR}, ${alpha.toFixed(3)})`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.className = "calendar-rhythm-value";
    value.textContent = `${entry.count}`;

    row.appendChild(meta);
    row.appendChild(bar);
    row.appendChild(value);
    container.appendChild(row);
  });
}

function renderMonthRhythm(container, entries, max) {
  container.className = "calendar-heatmap calendar-heatmap-week-bars";
  entries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "calendar-rhythm-row calendar-rhythm-row-compact";

    const meta = document.createElement("div");
    meta.className = "calendar-rhythm-meta";
    const label = document.createElement("span");
    label.className = "calendar-rhythm-label";
    label.textContent = entry.label;
    meta.appendChild(label);

    const bar = document.createElement("div");
    bar.className = "calendar-rhythm-bar";
    const fill = document.createElement("div");
    fill.className = "calendar-rhythm-fill";
    const widthPercent = max === 0 ? 0 : Math.max(12, (entry.count / max) * 100);
    const alpha = max === 0 ? 0.12 : 0.22 + (entry.count / max) * 0.44;
    fill.style.width = `${entry.count === 0 ? 0 : widthPercent}%`;
    fill.style.background = `rgba(${BREW_RHYTHM_COLOR}, ${alpha.toFixed(3)})`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.className = "calendar-rhythm-value";
    value.textContent = `${entry.count}`;

    row.appendChild(meta);
    row.appendChild(bar);
    row.appendChild(value);
    container.appendChild(row);
  });
}

function renderGridRhythm(container, entries, range, max) {
  container.className = `calendar-heatmap calendar-heatmap-${range}`;
  entries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "calendar-heatmap-cell";
    const intensity = max === 0 ? 0.08 : Math.max(0.14, entry.count / max);
    item.style.setProperty("--heat-intensity", String(intensity));

    const swatch = document.createElement("div");
    swatch.className = "calendar-heatmap-swatch";
    const label = document.createElement("span");
    label.className = "calendar-heatmap-label";
    label.textContent = entry.label;

    item.appendChild(swatch);
    item.appendChild(label);
    container.appendChild(item);
  });
}

function renderBrewRhythm(container, caption, range, visibleMonth, countsByDate) {
  container.innerHTML = "";
  const anchorDate = getRangeAnchor(range, visibleMonth);
  const entries = getRangeEntries(range, anchorDate, countsByDate);
  const max = entries.reduce((largest, entry) => Math.max(largest, entry.count), 0);
  if (range === "week") {
    renderWeekRhythm(container, entries, max);
    caption.textContent = "";
    caption.hidden = true;
    return;
  }
  if (range === "month") {
    renderMonthRhythm(container, entries, max);
    caption.textContent = "";
    caption.hidden = true;
    return;
  }
  caption.hidden = false;
  renderGridRhythm(container, entries, range, max);
  caption.textContent = `${anchorDate.getFullYear()} shown as a monthly rhythm overview.`;
}

export function bindCoffeeCalendarUi() {
  const monthLabel = document.getElementById("calendar-month-label");
  const grid = document.getElementById("coffee-calendar-grid");
  const prevBtn = document.getElementById("calendar-prev");
  const nextBtn = document.getElementById("calendar-next");
  const todayBtn = document.getElementById("calendar-today");
  const heatmap = document.getElementById("calendar-heatmap");
  const heatmapCaption = document.getElementById("calendar-heatmap-caption");
  const rangeToggle = document.getElementById("calendar-range-toggle");
  if (!monthLabel || !grid || !prevBtn || !nextBtn || !todayBtn || !heatmap || !heatmapCaption || !rangeToggle) return;

  let visibleMonth = startOfMonth(new Date());
  let activeRange = "week";

  const render = () => {
    const brewsByDate = groupBrewsByDate(loadBrews());
    const countsByDate = collectBrewCounts(brewsByDate);
    monthLabel.textContent = getMonthLabel(visibleMonth);
    renderCalendarGrid(grid, visibleMonth, brewsByDate);
    renderBrewRhythm(heatmap, heatmapCaption, activeRange, visibleMonth, countsByDate);
    rangeToggle.querySelectorAll("[data-range]").forEach(button => {
      const isActive = button.getAttribute("data-range") === activeRange;
      button.classList.toggle("chip-active", isActive);
    });
  };

  prevBtn.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    render();
  });
  nextBtn.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    render();
  });
  todayBtn.addEventListener("click", () => {
    visibleMonth = startOfMonth(new Date());
    render();
  });
  rangeToggle.querySelectorAll("[data-range]").forEach(button => {
    button.addEventListener("click", () => {
      activeRange = button.getAttribute("data-range") || "week";
      render();
    });
  });

  document.addEventListener("click", event => {
    const target = event.target;
    if (target instanceof Element && target.closest(".calendar-day")) return;
    grid.querySelectorAll(".calendar-day.is-tooltip-visible").forEach(node => {
      node.classList.remove("is-tooltip-visible");
    });
  });

  document.addEventListener("brews-updated", render);
  render();
}
