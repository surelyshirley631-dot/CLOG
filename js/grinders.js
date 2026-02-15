import { loadGrinders, saveGrinders } from "./storage.js";

function generateId() {
  return `grinder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    li.appendChild(main);
    li.dataset.grinderId = grinder.id;
    list.appendChild(li);
  });
}

export function bindGrindersUi() {
  const form = document.getElementById("grinder-form");
  const nameInput = document.getElementById("grinder-name-setting");
  const photoInput = document.getElementById("grinder-photo-setting");
  const list = document.getElementById("grinder-list");
  const clearBtn = document.getElementById("clear-grinders");
  if (!form || !nameInput || !list || !clearBtn) return;

  let editingId = null;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const grinders = loadGrinders();
    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    const finalize = photoDataUrl => {
      if (editingId) {
        const idx = grinders.findIndex(g => g.id === editingId);
        if (idx !== -1) {
          const existing = grinders[idx];
          grinders[idx] = {
            ...existing,
            name,
            photoDataUrl: photoDataUrl || existing.photoDataUrl || ""
          };
        }
      } else {
        const id = generateId();
        grinders.push({
          id,
          name,
          photoDataUrl: photoDataUrl || ""
        });
      }
      saveGrinders(grinders);
      editingId = null;
      nameInput.value = "";
      if (photoInput) {
        photoInput.value = "";
      }
      renderGrinderList(list, grinders);
      const select = document.getElementById("coffee-machine");
      if (select) {
        renderGrinderOptions(select);
      }
      document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders } }));
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
    const li = target instanceof HTMLElement ? target.closest("li") : null;
    if (!li || !li.dataset.grinderId) return;
    const grinders = loadGrinders();
    const grinder = grinders.find(g => g.id === li.dataset.grinderId);
    if (!grinder) return;
    editingId = grinder.id;
    nameInput.value = grinder.name || "";
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
    const select = document.getElementById("coffee-machine");
    if (select) {
      renderGrinderOptions(select);
    }
    document.dispatchEvent(new CustomEvent("grinders-updated", { detail: { grinders: [] } }));
  });

  const initial = loadGrinders();
  renderGrinderList(list, initial);
  const select = document.getElementById("coffee-machine");
  if (select) {
    renderGrinderOptions(select);
  }
}
