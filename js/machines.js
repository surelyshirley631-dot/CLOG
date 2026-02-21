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
    if (machine.photoDataUrl) {
      const thumb = document.createElement("img");
      thumb.className = "bean-photo-thumb";
      thumb.src = machine.photoDataUrl;
      thumb.alt = machine.name || "Machine photo";
      main.appendChild(thumb);
    }
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
    li.dataset.machineId = machine.id;
    li.appendChild(main);

    const side = document.createElement("div");
    side.className = "item-side";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-button small-button machine-edit-button";
    editBtn.textContent = "Edit";
    side.appendChild(editBtn);
    li.appendChild(side);

    list.appendChild(li);
  });
}

export function bindMachinesUi() {
  const form = document.getElementById("machine-form");
  const nameInput = document.getElementById("machine-name-setting");
  const notesInput = document.getElementById("machine-notes-setting");
  const photoInput = document.getElementById("machine-photo-setting");
  const list = document.getElementById("machine-list");
  const clearBtn = document.getElementById("clear-machines");
  if (!form || !nameInput || !list || !clearBtn) return;

  let editingId = null;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";
    if (!name) return;
    const machines = loadMachines();
    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    const finalize = photoDataUrl => {
      if (editingId) {
        const idx = machines.findIndex(m => m.id === editingId);
        if (idx !== -1) {
          const existing = machines[idx];
          machines[idx] = {
            ...existing,
            name,
            notes,
            photoDataUrl: photoDataUrl || existing.photoDataUrl || ""
          };
        }
      } else {
        const id = generateId();
        machines.push({
          id,
          name,
          notes,
          photoDataUrl: photoDataUrl || ""
        });
      }
      saveMachines(machines);
      editingId = null;
      nameInput.value = "";
      if (notesInput) {
        notesInput.value = "";
      }
      if (photoInput) {
        photoInput.value = "";
      }
      renderMachineList(list, machines);
      const select = document.getElementById("coffee-machine");
      if (select) {
        renderMachineOptions(select);
      }
      document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines } }));
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        finalize(typeof reader.result === "string" ? reader.result : "");
      };
      reader.readAsDataURL(file);
    } else {
      finalize("");
    }
  });

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("machine-edit-button")) return;
    const li = target.closest("li");
    if (!li || !li.dataset.machineId) return;
    const machines = loadMachines();
    const machine = machines.find(m => m.id === li.dataset.machineId);
    if (!machine) return;
    editingId = machine.id;
    nameInput.value = machine.name || "";
    if (notesInput) {
      notesInput.value = machine.notes || "";
    }
    if (photoInput) {
      photoInput.value = "";
    }
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all machines?");
    if (!confirmed) return;
    saveMachines([]);
    editingId = null;
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
