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
  if (!nameInput) return;

  let editingId = null;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const beans = loadBeans();
    const beanType = typeSelect ? typeSelect.value : "";
    const roastType = roastTypeSelect ? roastTypeSelect.value : "";
    const openDate = openDateInput ? openDateInput.value : "";
    const notes = notesInput ? notesInput.value.trim() : "";

    const file = photoInput && photoInput.files ? photoInput.files[0] : null;

    const finalize = photoDataUrl => {
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
      saveBeans(beans);
      editingId = null;
      form.reset();
      if (photoInput) {
        photoInput.value = "";
      }
      renderBeans(list, beans);
      document.dispatchEvent(new CustomEvent("beans-updated", { detail: { beans } }));
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
  beans.forEach(bean => {
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
