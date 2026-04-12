const STORAGE_KEYS = {
  brews: "clog_brews",
  cafes: "clog_cafes",
  beans: "clog_beans",
  grinders: "clog_grinders",
  machines: "clog_machines",
  knowledgeEntries: "clog_knowledge_entries",
  selectedKnowledgeScopes: "clog_selected_knowledge_scopes",
  aiSettings: "clog_ai_settings"
};

const META_KEY = "clog_meta";
const CURRENT_SCHEMA_VERSION = 4;

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeBeans(beans) {
  return asArray(beans).map(bean => ({
    id: bean && bean.id ? bean.id : `bean_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: bean && bean.name ? String(bean.name) : "",
    beanType: bean && bean.beanType ? String(bean.beanType) : "unknown",
    roastType: bean && bean.roastType ? String(bean.roastType) : "",
    openDate: bean && bean.openDate ? String(bean.openDate) : "",
    notes:
      bean && bean.notes
        ? String(bean.notes)
        : [bean && bean.roaster, bean && bean.roastDate ? `Roasted ${bean.roastDate}` : "", typeof (bean && bean.initialWeight) === "number" ? `Initial ${bean.initialWeight}g` : ""]
            .filter(Boolean)
            .join(" | "),
    photoDataUrl: bean && bean.photoDataUrl ? String(bean.photoDataUrl) : ""
  }));
}

function normalizeKnowledgeEntries(entries) {
  return asArray(entries)
    .map(entry => ({
      id: entry && entry.id ? String(entry.id) : `knowledge_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      scopeId: entry && entry.scopeId ? String(entry.scopeId) : "default",
      scopeName: entry && entry.scopeName ? String(entry.scopeName) : "Default",
      title: entry && entry.title ? String(entry.title) : "",
      content: entry && entry.content ? String(entry.content) : "",
      createdAt: entry && entry.createdAt ? String(entry.createdAt) : new Date().toISOString()
    }))
    .filter(entry => entry.content.trim().length > 0);
}

function normalizeSelectedKnowledgeScopes(scopeIds) {
  return Array.from(
    new Set(
      asArray(scopeIds)
        .map(scopeId => String(scopeId || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeAiSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const model = source.model ? String(source.model).trim() : "gpt-4o-mini";
  const apiKey = source.apiKey ? String(source.apiKey).trim() : "";
  const enabled = Boolean(source.enabled && apiKey);
  return {
    enabled,
    model: model || "gpt-4o-mini",
    apiKey
  };
}

function resolveImportArray(data, key) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data[key])) return data[key];
  const storageKey = STORAGE_KEYS[key];
  const byStorageKey = data[storageKey];
  if (Array.isArray(byStorageKey)) return byStorageKey;
  if (typeof byStorageKey === "string") {
    return safeParse(byStorageKey, []);
  }
  return [];
}

function buildImportPayload(raw) {
  const source = raw && typeof raw === "object" && raw.data && typeof raw.data === "object" ? raw.data : raw;
  const brews = asArray(resolveImportArray(source, "brews"));
  const cafes = asArray(resolveImportArray(source, "cafes"));
  const beans = normalizeBeans(resolveImportArray(source, "beans"));
  const grinders = asArray(resolveImportArray(source, "grinders"));
  const machines = asArray(resolveImportArray(source, "machines"));
  const knowledgeEntries = normalizeKnowledgeEntries(resolveImportArray(source, "knowledgeEntries"));
  const selectedKnowledgeScopes = normalizeSelectedKnowledgeScopes(resolveImportArray(source, "selectedKnowledgeScopes"));
  const aiSettings = normalizeAiSettings(source && typeof source === "object" ? source.aiSettings : {});
  const importedAny = brews.length > 0 || cafes.length > 0 || beans.length > 0 || grinders.length > 0 || machines.length > 0 || knowledgeEntries.length > 0;
  return { brews, cafes, beans, grinders, machines, knowledgeEntries, selectedKnowledgeScopes, aiSettings, importedAny };
}

function readStorageSnapshot() {
  return {
    [STORAGE_KEYS.brews]: localStorage.getItem(STORAGE_KEYS.brews),
    [STORAGE_KEYS.cafes]: localStorage.getItem(STORAGE_KEYS.cafes),
    [STORAGE_KEYS.beans]: localStorage.getItem(STORAGE_KEYS.beans),
    [STORAGE_KEYS.grinders]: localStorage.getItem(STORAGE_KEYS.grinders),
    [STORAGE_KEYS.machines]: localStorage.getItem(STORAGE_KEYS.machines),
    [STORAGE_KEYS.knowledgeEntries]: localStorage.getItem(STORAGE_KEYS.knowledgeEntries),
    [STORAGE_KEYS.selectedKnowledgeScopes]: localStorage.getItem(STORAGE_KEYS.selectedKnowledgeScopes),
    [STORAGE_KEYS.aiSettings]: localStorage.getItem(STORAGE_KEYS.aiSettings),
    [META_KEY]: localStorage.getItem(META_KEY)
  };
}

function restoreStorageSnapshot(snapshot) {
  Object.keys(snapshot).forEach(key => {
    const value = snapshot[key];
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  });
}

function stripMedia(payload) {
  return {
    ...payload,
    beans: payload.beans.map(bean => ({ ...bean, photoDataUrl: "" })),
    cafes: payload.cafes.map(cafe => ({ ...cafe, photo: null })),
    grinders: payload.grinders.map(grinder => ({ ...grinder, photoDataUrl: "" })),
    machines: payload.machines.map(machine => ({ ...machine, photoDataUrl: "" }))
  };
}

function persistPayload(payload) {
  localStorage.setItem(STORAGE_KEYS.brews, JSON.stringify(payload.brews));
  localStorage.setItem(STORAGE_KEYS.cafes, JSON.stringify(payload.cafes));
  localStorage.setItem(STORAGE_KEYS.beans, JSON.stringify(payload.beans));
  localStorage.setItem(STORAGE_KEYS.grinders, JSON.stringify(payload.grinders));
  localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(payload.machines));
  localStorage.setItem(STORAGE_KEYS.knowledgeEntries, JSON.stringify(normalizeKnowledgeEntries(payload.knowledgeEntries)));
  localStorage.setItem(STORAGE_KEYS.selectedKnowledgeScopes, JSON.stringify(normalizeSelectedKnowledgeScopes(payload.selectedKnowledgeScopes)));
  localStorage.setItem(STORAGE_KEYS.aiSettings, JSON.stringify(normalizeAiSettings(payload.aiSettings)));
  saveMeta({ schemaVersion: CURRENT_SCHEMA_VERSION });
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
    if ((meta.schemaVersion || 1) < 2) {
      migrateBeansV2();
    }
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
    machines: loadMachines(),
    knowledgeEntries: loadKnowledgeEntries(),
    selectedKnowledgeScopes: loadSelectedKnowledgeScopes(),
    aiSettings: loadAiSettings()
  };
}

export function importAll(data) {
  const payload = buildImportPayload(data);
  if (!payload.importedAny) {
    throw new Error("No compatible data found in import file");
  }
  const snapshot = readStorageSnapshot();
  try {
    persistPayload(payload);
    return { mediaStripped: false };
  } catch {
    try {
      persistPayload(stripMedia(payload));
      return { mediaStripped: true };
    } catch (error) {
      restoreStorageSnapshot(snapshot);
      throw error;
    }
  }
}

export function resetAll() {
  localStorage.removeItem(STORAGE_KEYS.brews);
  localStorage.removeItem(STORAGE_KEYS.cafes);
  localStorage.removeItem(STORAGE_KEYS.beans);
  localStorage.removeItem(STORAGE_KEYS.grinders);
  localStorage.removeItem(STORAGE_KEYS.machines);
  localStorage.removeItem(STORAGE_KEYS.knowledgeEntries);
  localStorage.removeItem(STORAGE_KEYS.selectedKnowledgeScopes);
  localStorage.removeItem(STORAGE_KEYS.aiSettings);
}

export function loadKnowledgeEntries() {
  return normalizeKnowledgeEntries(safeParse(localStorage.getItem(STORAGE_KEYS.knowledgeEntries), []));
}

export function saveKnowledgeEntries(entries) {
  localStorage.setItem(STORAGE_KEYS.knowledgeEntries, JSON.stringify(normalizeKnowledgeEntries(entries)));
}

export function loadSelectedKnowledgeScopes() {
  return normalizeSelectedKnowledgeScopes(safeParse(localStorage.getItem(STORAGE_KEYS.selectedKnowledgeScopes), []));
}

export function saveSelectedKnowledgeScopes(scopeIds) {
  localStorage.setItem(STORAGE_KEYS.selectedKnowledgeScopes, JSON.stringify(normalizeSelectedKnowledgeScopes(scopeIds)));
}

export function loadAiSettings() {
  return normalizeAiSettings(safeParse(localStorage.getItem(STORAGE_KEYS.aiSettings), {}));
}

export function saveAiSettings(value) {
  localStorage.setItem(STORAGE_KEYS.aiSettings, JSON.stringify(normalizeAiSettings(value)));
}
