import { loadMachines, saveMachines } from "./storage.js";
import { syncMachineToCloud, uploadMachinePhotoToCloud } from "./sync.js";

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

async function optimizeMachinePhotoCandidates(file) {
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
      { maxEdge: 640, quality: 0.54 },
      { maxEdge: 520, quality: 0.46 },
      { maxEdge: 420, quality: 0.38 }
    ];
    const candidates = [];
    const seen = new Set();
    const pushCandidate = value => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };
    for (const attempt of attempts) {
      const ratio = Math.min(1, attempt.maxEdge / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        pushCandidate(dataUrl);
        return candidates;
      }
      context.drawImage(image, 0, 0, width, height);
      const candidate = canvas.toDataURL("image/jpeg", attempt.quality);
      pushCandidate(candidate);
    }
    if (!candidates.length) {
      pushCandidate(dataUrl);
    }
    return candidates;
  } catch {
    return [dataUrl];
  }
}

function trySaveMachines(machines, options = {}) {
  const { silent = false } = options;
  try {
    saveMachines(machines);
    return true;
  } catch {
    if (!silent) {
      window.alert("保存失败：已自动尝试压缩图片，但当前浏览器可用空间还是不够。这次不会清空你已填写的机器信息，请换一张更小的图片后重试。");
    }
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
    const targetMachineId = editingId || generateId();
    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    const buildNextMachines = media => {
      const nextMedia = media && typeof media === "object" ? media : {};
      if (editingId) {
        return machines.map(machine => {
          if (machine.id !== editingId) return machine;
          return {
            ...machine,
            name,
            notes,
            photoDataUrl: nextMedia.photoDataUrl || machine.photoDataUrl || "",
            photoUrl: nextMedia.photoUrl || machine.photoUrl || "",
            photoStoragePath: nextMedia.photoStoragePath || machine.photoStoragePath || ""
          };
        });
      }
      return [
        ...machines,
        {
          id: targetMachineId,
          name,
          notes,
          photoDataUrl: nextMedia.photoDataUrl || "",
          photoUrl: nextMedia.photoUrl || "",
          photoStoragePath: nextMedia.photoStoragePath || ""
        }
      ];
    };

    const finalize = nextMachines => {
      if (!nextMachines) return;
      const activeEditingId = editingId;
      editingId = null;
      nameInput.value = "";
      if (notesInput) {
        notesInput.value = "";
      } else {
        nameInput.value = "";
      }
      if (photoInput) {
        photoInput.value = "";
      }
      renderMachineList(list, nextMachines);
      const select = document.getElementById("brew-machine");
      if (select) {
        renderMachineOptions(select);
      }
      document.dispatchEvent(new CustomEvent("machines-updated", { detail: { machines: nextMachines } }));
      const savedMachine = activeEditingId ? nextMachines.find(machine => machine.id === activeEditingId) : nextMachines[nextMachines.length - 1];
      if (savedMachine) {
        syncMachineToCloud(savedMachine).catch(error => {
          console.error("Machine cloud backup failed", error);
        });
      }
    };

    if (file) {
      try {
        const photoCandidates = await optimizeMachinePhotoCandidates(file);
        let nextMachines = null;
        let cloudMedia = null;
        if (photoCandidates[0]) {
          try {
            const uploadResult = await uploadMachinePhotoToCloud(targetMachineId, photoCandidates[0]);
            if (!uploadResult.skipped) {
              cloudMedia = uploadResult;
            }
          } catch (error) {
            console.warn("Machine photo cloud upload failed, falling back to local save.", error);
          }
        }
        if (cloudMedia) {
          nextMachines = buildNextMachines(cloudMedia);
          if (!trySaveMachines(nextMachines)) {
            window.alert("图片已上传云端，但本地保存没有完成。请重新保存一次。");
            return;
          }
        } else {
          for (const candidate of photoCandidates) {
            const attemptedMachines = buildNextMachines({ photoDataUrl: candidate, photoUrl: "", photoStoragePath: "" });
            if (!trySaveMachines(attemptedMachines, { silent: true })) continue;
            nextMachines = attemptedMachines;
            break;
          }
        }
        if (!nextMachines) {
          window.alert("保存失败：已自动尝试压缩图片，但当前浏览器可用空间还是不够。这次不会清空你已填写的机器信息，请换一张更小的图片后重试。");
          return;
        }
        finalize(nextMachines);
      } catch {
        window.alert("Machine photo could not be processed. Please try another image.");
      }
    } else {
      const nextMachines = buildNextMachines({});
      if (!trySaveMachines(nextMachines)) return;
      finalize(nextMachines);
    }
  });

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editBtn = target.closest(".machine-edit-button");
    if (!editBtn) return;
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
