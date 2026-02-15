import { loadMachines, saveMachines } from "./storage.js";

function generateId() {
  return `machine_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getMachines() {
  return loadMachines();
}

export function renderMachineOptions(select) {
  if (!select) return;
  const machines = loadMachines();
  const current = select.value;
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No machine selected";
  select.appendChild(empty);
  machines.forEach(machine => {
    const option = document.createElement("option");
    option.value = machine.name;
    option.textContent = machine.name;
    if (current && current === machine.name) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function renderMachineList(list, machines) {
  if (!list) return;
  list.innerHTML = "";
  if (!machines.length) return;
  machines.forEach(machine => {
    const li = document.createElement("li");
    li.className = "item";
    const main = document.createElement("div");
    main.className = "item-main";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = machine.name;
    main.appendChild(title);
    if (machine.notes) {
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = machine.notes;
      main.appendChild(meta);
    }
    li.appendChild(main);
    list.appendChild(li);
  });
}

export function bindMachinesUi() {
  const form = document.getElementById("machine-form");
  const nameInput = document.getElementById("machine-name-setting");
  const notesInput = document.getElementById("machine-notes-setting");
  const list = document.getElementById("machine-list");
  const clearBtn = document.getElementById("clear-machines");
  if (!form || !nameInput || !list || !clearBtn) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";
    if (!name) return;
    const machines = loadMachines();
    const exists = machines.some(m => m.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      machines.push({ id: generateId(), name, notes });
      saveMachines(machines);
    }
    nameInput.value = "";
    if (notesInput) notesInput.value = "";
    renderMachineList(list, machines);
    const select = document.getElementById("coffee-machine");
    if (select) {
      renderMachineOptions(select);
    }
    document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines } }));
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all machines?");
    if (!confirmed) return;
    saveMachines([]);
    renderMachineList(list, []);
    const select = document.getElementById("coffee-machine");
    if (select) {
      renderMachineOptions(select);
    }
    document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines: [] } }));
  });

  const initial = loadMachines();
  renderMachineList(list, initial);
  const select = document.getElementById("coffee-machine");
  if (select) {
    renderMachineOptions(select);
  }
}

