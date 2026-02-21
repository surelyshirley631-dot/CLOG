const STORAGE_KEYS = {
  brews: "clog_brews",
  cafes: "clog_cafes",
  beans: "clog_beans",
  grinders: "clog_grinders",
  machines: "clog_machines"
};

const META_KEY = "clog_meta";
const CURRENT_SCHEMA_VERSION = 2;

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function loadMeta() {
  return safeParse(localStorage.getItem(META_KEY), { schemaVersion: 1 });
}

function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta || { schemaVersion: CURRENT_SCHEMA_VERSION }));
}

function migrateBeansV2() {
  const beans = safeParse(localStorage.getItem(STORAGE_KEYS.beans), []);
  const migrated = beans.map(b => ({
    id: b.id,
    name: b.name,
    beanType: b.beanType || "unknown",
    roastType: b.roastType || "",
    openDate: b.openDate || "",
    notes: b.notes || [b.roaster, b.roastDate && `Roasted ${b.roastDate}`, typeof b.initialWeight === "number" && `Initial ${b.initialWeight}g`].filter(Boolean).join(" | "),
    photoDataUrl: b.photoDataUrl || ""
  }));
  localStorage.setItem(STORAGE_KEYS.beans, JSON.stringify(migrated));
}

export function migrateIfNeeded() {
  const meta = loadMeta();
  if ((meta.schemaVersion || 1) < CURRENT_SCHEMA_VERSION) {
    migrateBeansV2();
    meta.schemaVersion = CURRENT_SCHEMA_VERSION;
    saveMeta(meta);
  }
}

export function loadBrews() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.brews), []);
}

export function saveBrews(brews) {
  localStorage.setItem(STORAGE_KEYS.brews, JSON.stringify(brews));
}

export function loadCafes() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.cafes), []);
}

export function saveCafes(cafes) {
  localStorage.setItem(STORAGE_KEYS.cafes, JSON.stringify(cafes));
}

export function loadBeans() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.beans), []);
}

export function saveBeans(beans) {
  localStorage.setItem(STORAGE_KEYS.beans, JSON.stringify(beans));
}

export function loadGrinders() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.grinders), []);
}

export function saveGrinders(grinders) {
  localStorage.setItem(STORAGE_KEYS.grinders, JSON.stringify(grinders));
}

export function loadMachines() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.machines), []);
}

export function saveMachines(machines) {
  localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(machines));
}

export function exportAll() {
  return {
    brews: loadBrews(),
    cafes: loadCafes(),
    beans: loadBeans(),
    grinders: loadGrinders(),
    machines: loadMachines()
  };
}

export function importAll(data) {
  if (data && Array.isArray(data.brews)) saveBrews(data.brews);
  if (data && Array.isArray(data.cafes)) saveCafes(data.cafes);
  if (data && Array.isArray(data.beans)) saveBeans(data.beans);
  if (data && Array.isArray(data.grinders)) saveGrinders(data.grinders);
  if (data && Array.isArray(data.machines)) saveMachines(data.machines);
  saveMeta({ schemaVersion: CURRENT_SCHEMA_VERSION });
}

export function resetAll() {
  localStorage.removeItem(STORAGE_KEYS.brews);
  localStorage.removeItem(STORAGE_KEYS.cafes);
  localStorage.removeItem(STORAGE_KEYS.beans);
  localStorage.removeItem(STORAGE_KEYS.grinders);
  localStorage.removeItem(STORAGE_KEYS.machines);
}
