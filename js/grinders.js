import { loadGrinders, saveGrinders } from "./storage.js";

function generateId() {
  return `grinder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getGrinders() {
  return loadGrinders();
}

export function renderGrinderOptions(select) {
  if (!select) return;
  const grinders = loadGrinders();
  const current = select.value;
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No grinder selected";
  select.appendChild(empty);
  grinders.forEach(grinder => {
    const option = document.createElement("option");
    option.value = grinder.name;
    option.textContent = grinder.name;
    if (current && current === grinder.name) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function renderGrinderList(list, grinders) {
  if (!list) return;
  list.innerHTML = "";
  if (!grinders.length) return;
  grinders.forEach(grinder => {
    const li = document.createElement("li");
    li.className = "item";
    const main = document.createElement("div");
    main.className = "item-main";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = grinder.name;
    main.appendChild(title);
    li.appendChild(main);
    list.appendChild(li);
  });
}

export function bindGrindersUi() {
  const form = document.getElementById("grinder-form");
  const nameInput = document.getElementById("grinder-name-setting");
  const list = document.getElementById("grinder-list");
  const clearBtn = document.getElementById("clear-grinders");
  if (!form || !nameInput || !list || !clearBtn) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const grinders = loadGrinders();
    const exists = grinders.some(g => g.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      grinders.push({ id: generateId(), name });
      saveGrinders(grinders);
    }
    nameInput.value = "";
    renderGrinderList(list, grinders);
    const select = document.getElementById("grinder-model");
    if (select) {
      renderGrinderOptions(select);
    }
    document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders } }));
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all grinder models?");
    if (!confirmed) return;
    saveGrinders([]);
    renderGrinderList(list, []);
    const select = document.getElementById("grinder-model");
    if (select) {
      renderGrinderOptions(select);
    }
    document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders: [] } }));
  });

  const initial = loadGrinders();
  renderGrinderList(list, initial);
  const select = document.getElementById("grinder-model");
  if (select) {
    renderGrinderOptions(select);
  }
}

