import { loadMachines, saveMachines } from "./storage.js";
import { syncMachineToCloud } from "./sync.js";

function generateId() {
  return `machine_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("machine-image-load-failed"));
    image.src = dataUrl;
  });
}

async function optimizeMachinePhoto(file) {
  if (!file) return "";
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("machine-photo-read-failed"));
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return "";
  try {
    const image = await loadImageFromDataUrl(dataUrl);
    const attempts = [
      { maxEdge: 1280, quality: 0.78 },
      { maxEdge: 1080, quality: 0.72 },
      { maxEdge: 900, quality: 0.66 },
      { maxEdge: 768, quality: 0.6 },
      { maxEdge: 640, quality: 0.54 }
    ];
    let best = dataUrl;
    for (const attempt of attempts) {
      const ratio = Math.min(1, attempt.maxEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return dataUrl;
      context.drawImage(image, 0, 0, width, height);
      const candidate = canvas.toDataURL("image/jpeg", attempt.quality);
      best = candidate;
      if (candidate.length <= 320000) {
        return candidate;
      }
    }
    return best;
  } catch {
    return dataUrl;
  }
}

function trySaveMachines(machines) {
  try {
    saveMachines(machines);
    return true;
  } catch {
    window.alert("Upload failed: the photo is too large for local storage. Try a smaller image.");
    return false;
  }
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

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";
    if (!name) return;
    const machines = loadMachines();
    const savedMachineId = editingId;
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
      if (!trySaveMachines(machines)) return;
      editingId = null;
      nameInput.value = "";
      if (notesInput) {
        notesInput.value = "";
      }
      if (photoInput) {
        photoInput.value = "";
      }
      renderMachineList(list, machines);
      const select = document.getElementById("brew-machine");
      if (select) {
        renderMachineOptions(select);
      }
      document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines } }));
      const savedMachine = savedMachineId ? machines.find(machine => machine.id === savedMachineId) : machines[machines.length - 1];
      if (savedMachine) {
        syncMachineToCloud(savedMachine).catch(error => {
          console.error("Machine cloud backup failed", error);
        });
      }
    };

    if (file) {
      try {
        const photoDataUrl = await optimizeMachinePhoto(file);
        finalize(photoDataUrl);
      } catch {
        window.alert("Machine photo could not be processed. Please try another image.");
      }
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
    const select = document.getElementById("brew-machine");
    if (select) {
      renderMachineOptions(select);
    }
    document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines: [] } }));
  });

  const initial = loadMachines();
  renderMachineList(list, initial);
  const select = document.getElementById("brew-machine");
  if (select) {
    renderMachineOptions(select);
  }
}
