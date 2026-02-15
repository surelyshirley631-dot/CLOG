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

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const nameInput = document.getElementById("cafe-name");
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) return;
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

    let photoData = "";
    if (photoInput && photoInput.files && photoInput.files[0]) {
      photoData = await readFileAsDataUrl(photoInput.files[0]);
    }

    const cafes = loadCafes();
    const cafe = {
      id: generateId(),
      name,
      status: statusInput ? statusInput.value : "visited",
      location: locationInput ? locationInput.value.trim() : "",
      equipment: equipmentInput ? equipmentInput.value.trim() : "",
      origin: originInput ? originInput.value.trim() : "",
      roastStyle: roastStyleInput ? roastStyleInput.value.trim() : "",
      visits: [],
      photo: photoData || null
    };

    const drink = drinkInput ? drinkInput.value.trim() : "";
    const ratingVal = ratingInput ? ratingInput.value : "";
    const dateVal = dateInput ? dateInput.value : "";
    const notes = notesInput ? notesInput.value.trim() : "";

    if (drink || ratingVal || dateVal || notes) {
      cafe.visits.push({
        drink,
        rating: ratingVal ? Number(ratingVal) : null,
        date: dateVal || null,
        notes
      });
    }

    cafes.unshift(cafe);
    saveCafes(cafes);
    form.reset();
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

    if (cafe.photo) {
      const side = document.createElement("div");
      side.className = "item-side";
      const img = document.createElement("img");
      img.src = cafe.photo;
      img.alt = `Photo from ${cafe.name}`;
      img.className = "cafe-photo-thumb";
      const label = document.createElement("span");
      label.textContent = "Photo";
      side.appendChild(img);
      side.appendChild(label);
      li.appendChild(side);
    }

    list.appendChild(li);
  });
}

