import { loadGrinders, saveGrinders } from "./storage.js";
import { syncGrinderToCloud, uploadGrinderPhotoToCloud } from "./sync.js";

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
  if (!form || !nameInput || !list || !clearBtn) return;

  let editingId = null;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";
    if (!name) return;
    const grinders = loadGrinders();
    const targetGrinderId = editingId || generateId();
    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    const buildNextGrinders = media => {
      const nextMedia = media && typeof media === "object" ? media : {};
      if (editingId) {
        const idx = grinders.findIndex(grinder => grinder.id === editingId);
        if (idx !== -1) {
          const next = grinders.slice();
          const existing = next[idx];
          next[idx] = {
            ...existing,
            name,
            notes,
            photoDataUrl: nextMedia.photoDataUrl || existing.photoDataUrl || "",
            photoUrl: nextMedia.photoUrl || existing.photoUrl || "",
            photoStoragePath: nextMedia.photoStoragePath || existing.photoStoragePath || ""
          };
          return next;
        }
      }
      return [
        ...grinders,
        {
          id: targetGrinderId,
          name,
          notes,
          photoDataUrl: nextMedia.photoDataUrl || "",
          photoUrl: nextMedia.photoUrl || "",
          photoStoragePath: nextMedia.photoStoragePath || ""
        }
      ];
    };

    const finalize = nextGrinders => {
      if (!nextGrinders) return;
      const activeEditingId = editingId;
      editingId = null;
      nameInput.value = "";
      if (notesInput) {
        notesInput.value = "";
      }
      if (photoInput) {
        photoInput.value = "";
      }
      renderGrinderList(list, nextGrinders);
      refreshGrinderSelect();
      document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders: nextGrinders } }));
      const savedGrinder = activeEditingId
        ? nextGrinders.find(grinder => grinder.id === activeEditingId)
        : nextGrinders[nextGrinders.length - 1];
      if (savedGrinder) {
        syncGrinderToCloud(savedGrinder).catch(error => {
          console.error("Grinder cloud backup failed", error);
        });
      }
    };

    if (file) {
      try {
        const photoCandidates = await optimizeGrinderPhotoCandidates(file);
        let nextGrinders = null;
        let cloudMedia = null;
        if (photoCandidates[0]) {
          try {
            const uploadResult = await uploadGrinderPhotoToCloud(targetGrinderId, photoCandidates[0]);
            if (!uploadResult.skipped) {
              cloudMedia = uploadResult;
            }
          } catch (error) {
            console.warn("Grinder photo cloud upload failed, falling back to local save.", error);
          }
        }
        if (cloudMedia) {
          nextGrinders = buildNextGrinders(cloudMedia);
          if (!trySaveGrinders(nextGrinders)) {
            window.alert("图片已上传云端，但本地保存没有完成。请重新保存一次。");
            return;
          }
        } else {
          for (const candidate of photoCandidates) {
            const attemptedGrinders = buildNextGrinders({
              photoDataUrl: candidate,
              photoUrl: "",
              photoStoragePath: ""
            });
            if (!trySaveGrinders(attemptedGrinders, { silent: true })) continue;
            nextGrinders = attemptedGrinders;
            break;
          }
        }
        if (!nextGrinders) {
          window.alert("保存失败：已自动尝试压缩图片，但当前浏览器可用空间还是不够。这次不会清空你已填写的研磨机信息，请换一张更小的图片后重试。");
          return;
        }
        finalize(nextGrinders);
      } catch {
        window.alert("Grinder photo could not be processed. Please try another image.");
      }
    } else {
      const nextGrinders = buildNextGrinders({});
      if (!trySaveGrinders(nextGrinders)) return;
      finalize(nextGrinders);
    }
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
