import { loadGrinders, saveGrinders } from "./storage.js";
import {
  saveGrinderCloudFirst
} from "./sync.js";

function generateId() {
  return `grinder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("grinder-image-load-failed"));
    image.src = dataUrl;
  });
}

async function optimizeGrinderPhotoCandidates(file) {
  if (!file) return "";
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("grinder-photo-read-failed"));
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

function trySaveGrinders(grinders, options = {}) {
  const { silent = false } = options;
  try {
    saveGrinders(grinders);
    return true;
  } catch {
    if (!silent) {
      window.alert("保存失败：已自动尝试压缩图片，但当前浏览器可用空间还是不够。这次不会清空你已填写的研磨机信息，请换一张更小的图片后重试。");
    }
    return false;
  }
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
    if (grinder.photoDataUrl) {
      const thumb = document.createElement("img");
      thumb.className = "bean-photo-thumb";
      thumb.src = grinder.photoDataUrl;
      thumb.alt = grinder.name || "Grinder photo";
      main.appendChild(thumb);
    }
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = grinder.name;
    main.appendChild(title);
    if (grinder.notes) {
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = grinder.notes;
      main.appendChild(meta);
    }
    li.dataset.grinderId = grinder.id;
    li.appendChild(main);

    const side = document.createElement("div");
    side.className = "item-side";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-button small-button grinder-edit-button";
    editBtn.textContent = "Edit";
    side.appendChild(editBtn);
    li.appendChild(side);

    list.appendChild(li);
  });
}

function refreshGrinderSelect() {
  const select = document.getElementById("brew-grinder");
  if (!select) return;
  renderGrinderOptions(select);
}

export function bindGrindersUi() {
  const form = document.getElementById("grinder-form");
  const nameInput = document.getElementById("grinder-name-setting");
  const notesInput = document.getElementById("grinder-notes-setting");
  const photoInput = document.getElementById("grinder-photo-setting");
  const list = document.getElementById("grinder-list");
  const clearBtn = document.getElementById("clear-grinders");
  const statusEl = document.getElementById("grinder-form-status");
  if (!form || !nameInput || !list || !clearBtn) return;

  let editingId = null;

  const setStatus = (message, tone = "") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = tone ? `bean-ocr-status ${tone}` : "bean-ocr-status";
  };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";
    if (!name) return;
    const grinders = loadGrinders();
    const targetGrinderId = editingId || generateId();
    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    let photoCandidates = [];
    if (file) {
      setStatus("Processing grinder photo…", "is-working");
      try {
        photoCandidates = await optimizeGrinderPhotoCandidates(file);
      } catch {
        setStatus("Grinder photo could not be processed. Please try another image.", "is-error");
        window.alert("Grinder photo could not be processed. Please try another image.");
        return;
      }
    }

    setStatus("Saving grinder to Firebase…", "is-working");
    const baseGrinder = (() => {
      if (editingId) {
        const existing = grinders.find(grinder => grinder.id === editingId);
        if (existing) {
          return {
            ...existing,
            name,
            notes
          };
        }
      }
      return {
        id: targetGrinderId,
        name,
        notes
      };
    })();

    let result = null;
    let usedPhotoDataUrl = "";
    const fallbackErrorMessages = [];
    const candidates = photoCandidates.length ? photoCandidates : [""];
    for (const photoDataUrl of candidates) {
      try {
        result = await saveGrinderCloudFirst(baseGrinder, {
          photoDataUrl,
          existingItems: grinders,
          allowLocalPhotoDataUrl: false
        });
        usedPhotoDataUrl = photoDataUrl;
        break;
      } catch (error) {
        fallbackErrorMessages.push(error instanceof Error ? error.message : "Grinder cloud save failed.");
      }
    }
    if (!result && photoCandidates.length) {
      try {
        const smallestPhoto = photoCandidates[photoCandidates.length - 1];
        result = await saveGrinderCloudFirst(baseGrinder, {
          photoDataUrl: smallestPhoto,
          existingItems: grinders,
          allowLocalPhotoDataUrl: true
        });
        usedPhotoDataUrl = smallestPhoto;
      } catch (_finalError) {
        result = null;
      }
    }
    if (!result) {
      const lastMessage = fallbackErrorMessages[fallbackErrorMessages.length - 1] || "保存失败。";
      setStatus(`${lastMessage} 这次没有保存成功，你填写的研磨机信息仍保留在表单里。`, "is-error");
      window.alert(`保存失败：${lastMessage}。这次没有保存成功，你填写的研磨机信息仍保留在表单里。`);
      return;
    }

    const activeEditingId = editingId;
    editingId = null;
    nameInput.value = "";
    if (notesInput) {
      notesInput.value = "";
    }
    if (photoInput) {
      photoInput.value = "";
    }
    const nextGrinders = result.items;
    if (result.mode === "cloud-first") {
      setStatus("Saved to Firebase. Photos are kept in Storage, not in this device storage.", "is-success");
    } else if (result.mode === "local-fallback") {
      setStatus(
        usedPhotoDataUrl
          ? `Cloud save failed (${result.error || "unknown"}), so this grinder was saved locally first. Connect Firebase permissions to move the photo to cloud storage.`
          : `Cloud save failed (${result.error || "unknown"}), so this grinder was saved locally first.`,
        "is-warning"
      );
    } else {
      setStatus("Saved locally. Enable Firebase in Settings to back this up.", "is-warning");
    }
    renderGrinderList(list, nextGrinders);
    refreshGrinderSelect();
    document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders: nextGrinders } }));
  });

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editBtn = target.closest(".grinder-edit-button");
    if (!editBtn) return;
    const li = target.closest("li");
    if (!li || !li.dataset.grinderId) return;
    const grinders = loadGrinders();
    const grinder = grinders.find(g => g.id === li.dataset.grinderId);
    if (!grinder) return;
    editingId = grinder.id;
    nameInput.value = grinder.name || "";
    if (notesInput) {
      notesInput.value = grinder.notes || "";
    }
    if (photoInput) {
      photoInput.value = "";
    }
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all grinder models?");
    if (!confirmed) return;
    saveGrinders([]);
    editingId = null;
    renderGrinderList(list, []);
    refreshGrinderSelect();
    document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders: [] } }));
  });

  const initial = loadGrinders();
  renderGrinderList(list, initial);
  refreshGrinderSelect();
}
