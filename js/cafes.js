import { loadCafes, saveCafes } from "./storage.js";

function generateId() {
  return `cafe_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function bindCafesUi() {
  const form = document.getElementById("cafe-form");
  const list = document.getElementById("cafe-list");
  const searchInput = document.getElementById("cafe-search");
  const clearBtn = document.getElementById("clear-cafes");
  if (!form || !list || !searchInput || !clearBtn) return;

  const nameInput = document.getElementById("cafe-name");
  const statusInput = document.getElementById("cafe-status");
  const locationInput = document.getElementById("cafe-location");
  const equipmentInput = document.getElementById("cafe-equipment");
  const originInput = document.getElementById("cafe-origin");
  const roastStyleInput = document.getElementById("cafe-roast-style");
  const drinkInput = document.getElementById("visit-drink");
  const ratingInput = document.getElementById("visit-rating");
  const dateInput = document.getElementById("visit-date");
  const notesInput = document.getElementById("visit-notes");
  const photoInput = document.getElementById("cafe-photo");
  if (!nameInput) return;

  let editingId = null;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const cafes = loadCafes();
    const status = statusInput ? statusInput.value : "visited";
    const location = locationInput ? locationInput.value.trim() : "";
    const equipment = equipmentInput ? equipmentInput.value.trim() : "";
    const origin = originInput ? originInput.value.trim() : "";
    const roastStyle = roastStyleInput ? roastStyleInput.value.trim() : "";

    const drink = drinkInput ? drinkInput.value.trim() : "";
    const ratingVal = ratingInput ? ratingInput.value : "";
    const dateVal = dateInput ? dateInput.value : "";
    const notes = notesInput ? notesInput.value.trim() : "";

    let photoData = "";
    if (photoInput && photoInput.files && photoInput.files[0]) {
      photoData = await readFileAsDataUrl(photoInput.files[0]);
    }

    if (editingId) {
      const idx = cafes.findIndex(c => c.id === editingId);
      if (idx !== -1) {
        const existing = cafes[idx];
        const visits = Array.isArray(existing.visits) ? [...existing.visits] : [];
        if (drink || ratingVal || dateVal || notes) {
          visits.unshift({
            drink,
            rating: ratingVal ? Number(ratingVal) : null,
            date: dateVal || null,
            notes
          });
        }
        cafes[idx] = {
          ...existing,
          name,
          status,
          location,
          equipment,
          origin,
          roastStyle,
          visits,
          photo: photoData || existing.photo || null
        };
      }
    } else {
      const cafe = {
        id: generateId(),
        name,
        status,
        location,
        equipment,
        origin,
        roastStyle,
        visits: [],
        photo: photoData || null
      };
      if (drink || ratingVal || dateVal || notes) {
        cafe.visits.push({
          drink,
          rating: ratingVal ? Number(ratingVal) : null,
          date: dateVal || null,
          notes
        });
      }
      cafes.unshift(cafe);
    }

    saveCafes(cafes);
    editingId = null;
    form.reset();
    if (photoInput) {
      photoInput.value = "";
    }
    renderCafes(list, cafes, searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    renderCafes(list, loadCafes(), searchInput.value);
  });

  clearBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all cafes from your directory?");
    if (!confirmed) return;
    saveCafes([]);
    renderCafes(list, [], searchInput.value);
  });

  list.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("cafe-edit-button")) return;
    const li = target.closest("li");
    if (!li || !li.dataset.cafeId) return;
    const cafes = loadCafes();
    const cafe = cafes.find(c => c.id === li.dataset.cafeId);
    if (!cafe) return;
    editingId = cafe.id;
    nameInput.value = cafe.name || "";
    if (statusInput) statusInput.value = cafe.status || "visited";
    if (locationInput) locationInput.value = cafe.location || "";
    if (equipmentInput) equipmentInput.value = cafe.equipment || "";
    if (originInput) originInput.value = cafe.origin || "";
    if (roastStyleInput) roastStyleInput.value = cafe.roastStyle || "";
    if (drinkInput) drinkInput.value = "";
    if (ratingInput) ratingInput.value = "";
    if (dateInput) dateInput.value = "";
    if (notesInput) notesInput.value = "";
    if (photoInput) photoInput.value = "";
  });

  renderCafes(list, loadCafes(), searchInput.value);
}

function renderCafes(list, cafes, query) {
  const q = (query || "").toLowerCase();
  const filtered = cafes.filter(cafe => {
    if (!q) return true;
    return (
      (cafe.name || "").toLowerCase().includes(q) ||
      (cafe.origin || "").toLowerCase().includes(q) ||
      (cafe.location || "").toLowerCase().includes(q)
    );
  });

  list.innerHTML = "";
  if (!filtered.length) return;

  filtered.forEach(cafe => {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.cafeId = cafe.id;

    const main = document.createElement("div");
    main.className = "item-main";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = cafe.name;

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const parts = [];
    if (cafe.location) parts.push(cafe.location);
    if (cafe.equipment) parts.push(cafe.equipment);
    meta.textContent = parts.join(" • ");

    const tags = document.createElement("div");
    tags.className = "item-tags";

    const statusTag = document.createElement("span");
    statusTag.className = "tag tag-pill";
    statusTag.textContent = cafe.status === "wishlist" ? "Want to visit" : "Visited";
    tags.appendChild(statusTag);

    if (cafe.origin) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = cafe.origin;
      tags.appendChild(t);
    }

    if (cafe.roastStyle) {
      const t = document.createElement("span");
      t.className = "tag tag-soft";
      t.textContent = cafe.roastStyle;
      tags.appendChild(t);
    }

    if (Array.isArray(cafe.visits) && cafe.visits.length) {
      const last = cafe.visits[0];
      if (typeof last.rating === "number") {
        const t = document.createElement("span");
        t.className = "tag tag-soft";
        t.textContent = `Last rating ${last.rating}/5`;
        tags.appendChild(t);
      }
      if (last.drink) {
        const t = document.createElement("span");
        t.className = "tag tag-soft";
        t.textContent = last.drink;
        tags.appendChild(t);
      }
    }

    main.appendChild(title);
    main.appendChild(meta);
    main.appendChild(tags);

    li.appendChild(main);

    const side = document.createElement("div");
    side.className = "item-side";
    if (cafe.photo) {
      const img = document.createElement("img");
      img.src = cafe.photo;
      img.alt = `Photo from ${cafe.name}`;
      img.className = "cafe-photo-thumb";
      side.appendChild(img);
    }
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-button small-button cafe-edit-button";
    editBtn.textContent = "Edit";
    side.appendChild(editBtn);
    li.appendChild(side);

    list.appendChild(li);
  });
}
