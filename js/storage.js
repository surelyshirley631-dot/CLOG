const STORAGE_KEYS = {
  brews: "clog_brews",
  cafes: "clog_cafes",
  beans: "clog_beans",
  grinders: "clog_grinders",
  machines: "clog_machines",
  knowledgeEntries: "clog_knowledge_entries",
  selectedKnowledgeScopes: "clog_selected_knowledge_scopes",
  aiSettings: "clog_ai_settings",
  syncSettings: "clog_sync_settings"
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
    photoDataUrl: bean && (bean.photoDataUrl || bean.photo) ? String(bean.photoDataUrl || bean.photo) : "",
    photoUrl:
      bean && (bean.photoUrl || (typeof bean.photoDataUrl === "string" && /^https?:\/\//i.test(bean.photoDataUrl) ? bean.photoDataUrl : ""))
        ? String(bean.photoUrl || bean.photoDataUrl)
        : "",
    photoStoragePath: bean && bean.photoStoragePath ? String(bean.photoStoragePath) : ""
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
  const model = source.model ? String(source.model).trim() : "gemini-2.0-flash";
  const apiKey = source.apiKey ? String(source.apiKey).trim() : "";
  const enabled = Boolean(source.enabled && apiKey);
  return {
    enabled,
    model: model || "gemini-2.0-flash",
    apiKey
  };
}

function normalizeSyncSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const apiKey = source.apiKey ? String(source.apiKey).trim() : "";
  const projectId = source.projectId ? String(source.projectId).trim() : "";
  const authDomain = source.authDomain ? String(source.authDomain).trim() : projectId ? `${projectId}.firebaseapp.com` : "";
  const storageBucket = source.storageBucket ? String(source.storageBucket).trim() : projectId ? `${projectId}.firebasestorage.app` : "";
  const messagingSenderId = source.messagingSenderId ? String(source.messagingSenderId).trim() : "";
  const appId = source.appId ? String(source.appId).trim() : "";
  return {
    enabled: Boolean(source.enabled && apiKey && authDomain && projectId && storageBucket && messagingSenderId && appId),
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    lastSyncedAt: source.lastSyncedAt ? String(source.lastSyncedAt) : "",
    lastError: source.lastError ? String(source.lastError) : ""
  };
}

function normalizeCafes(cafes) {
  return asArray(cafes).map(cafe => {
    const source = cafe && typeof cafe === "object" ? cafe : {};
    const photo = typeof source.photo === "string" ? source.photo : typeof source.photoDataUrl === "string" ? source.photoDataUrl : null;
    return {
      ...source,
      id: source.id ? String(source.id) : `cafe_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      photo: photo || null
    };
  });
}

function normalizeGrinders(grinders) {
  return asArray(grinders).map(grinder => {
    const source = grinder && typeof grinder === "object" ? grinder : {};
    return {
      ...source,
      id: source.id ? String(source.id) : `grinder_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: source.name ? String(source.name) : "",
      photoDataUrl: source.photoDataUrl ? String(source.photoDataUrl) : ""
    };
  });
}

function normalizeMachines(machines) {
  return asArray(machines).map(machine => {
    const source = machine && typeof machine === "object" ? machine : {};
    return {
      ...source,
      id: source.id ? String(source.id) : `machine_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: source.name ? String(source.name) : "",
      photoDataUrl: source.photoDataUrl ? String(source.photoDataUrl) : "",
      photoUrl:
        source.photoUrl || (typeof source.photoDataUrl === "string" && /^https?:\/\//i.test(source.photoDataUrl) ? source.photoDataUrl : "")
          ? String(source.photoUrl || source.photoDataUrl)
          : "",
      photoStoragePath: source.photoStoragePath ? String(source.photoStoragePath) : ""
    };
  });
}

function asKey(value) {
  return String(value || "").trim().toLowerCase();
}

function mergeItemWithMedia(existing, incoming, mediaFields = []) {
  const merged = { ...existing, ...incoming };
  mediaFields.forEach(field => {
    const incomingValue = incoming ? incoming[field] : undefined;
    const existingValue = existing ? existing[field] : undefined;
    if ((incomingValue === "" || incomingValue === null || incomingValue === undefined) && existingValue !== undefined) {
      merged[field] = existingValue;
    }
  });
  return merged;
}

function mergeByKey(existingItems, incomingItems, keyOf, mediaFields = []) {
  const result = [];
  const indexMap = new Map();
  asArray(existingItems).forEach(item => {
    const key = keyOf(item);
    if (!key) return;
    indexMap.set(key, result.length);
    result.push(item);
  });
  asArray(incomingItems).forEach(item => {
    const key = keyOf(item);
    if (!key) {
      result.push(item);
      return;
    }
    if (!indexMap.has(key)) {
      indexMap.set(key, result.length);
      result.push(item);
      return;
    }
    const idx = indexMap.get(key);
    result[idx] = mergeItemWithMedia(result[idx], item, mediaFields);
  });
  return result;
}

function mergeImportPayload(payload) {
  const current = exportAll();
  const currentBrews = asArray(current.brews);
  const currentCafes = normalizeCafes(current.cafes);
  const currentBeans = normalizeBeans(current.beans);
  const currentGrinders = normalizeGrinders(current.grinders);
  const currentMachines = normalizeMachines(current.machines);
  const currentKnowledge = normalizeKnowledgeEntries(current.knowledgeEntries);

  const brews = mergeByKey(
    currentBrews,
    payload.brews,
    brew => (brew && brew.id ? `id:${brew.id}` : `sig:${asKey(brew && brew.date)}|${asKey(brew && brew.method)}|${asKey(brew && brew.beanId)}|${asKey(brew && brew.notes).slice(0, 80)}`)
  );
  const cafes = mergeByKey(
    currentCafes,
    payload.cafes,
    cafe => (cafe && cafe.id ? `id:${cafe.id}` : `sig:${asKey(cafe && cafe.name)}|${asKey(cafe && cafe.location)}`),
    ["photo"]
  );
  const beans = mergeByKey(
    currentBeans,
    payload.beans,
    bean => (bean && bean.id ? `id:${bean.id}` : `sig:${asKey(bean && bean.name)}|${asKey(bean && bean.openDate)}`),
    ["photoDataUrl"]
  );
  const grinders = mergeByKey(
    currentGrinders,
    payload.grinders,
    grinder => (grinder && grinder.id ? `id:${grinder.id}` : `sig:${asKey(grinder && grinder.name)}`),
    ["photoDataUrl"]
  );
  const machines = mergeByKey(
    currentMachines,
    payload.machines,
    machine => (machine && machine.id ? `id:${machine.id}` : `sig:${asKey(machine && machine.name)}`),
    ["photoDataUrl"]
  );
  const knowledgeEntries = mergeByKey(
    currentKnowledge,
    payload.knowledgeEntries,
    entry =>
      entry && entry.id
        ? `id:${entry.id}`
        : `sig:${asKey(entry && entry.scopeId)}|${asKey(entry && entry.title)}|${asKey(entry && entry.content).slice(0, 100)}`
  );
  const selectedKnowledgeScopes = Array.from(
    new Set([...normalizeSelectedKnowledgeScopes(current.selectedKnowledgeScopes), ...normalizeSelectedKnowledgeScopes(payload.selectedKnowledgeScopes)])
  );
  const aiSettings = normalizeAiSettings({
    enabled: payload.aiSettings && payload.aiSettings.apiKey ? payload.aiSettings.enabled : current.aiSettings && current.aiSettings.enabled,
    model: (payload.aiSettings && payload.aiSettings.model) || (current.aiSettings && current.aiSettings.model) || "gemini-2.0-flash",
    apiKey: (payload.aiSettings && payload.aiSettings.apiKey) || (current.aiSettings && current.aiSettings.apiKey) || ""
  });
  const syncSettings = normalizeSyncSettings({
    enabled:
      payload.syncSettings &&
      payload.syncSettings.apiKey &&
      payload.syncSettings.projectId &&
      payload.syncSettings.appId
        ? payload.syncSettings.enabled
        : current.syncSettings && current.syncSettings.enabled,
    apiKey: (payload.syncSettings && payload.syncSettings.apiKey) || (current.syncSettings && current.syncSettings.apiKey) || "",
    authDomain: (payload.syncSettings && payload.syncSettings.authDomain) || (current.syncSettings && current.syncSettings.authDomain) || "",
    projectId: (payload.syncSettings && payload.syncSettings.projectId) || (current.syncSettings && current.syncSettings.projectId) || "",
    storageBucket: (payload.syncSettings && payload.syncSettings.storageBucket) || (current.syncSettings && current.syncSettings.storageBucket) || "",
    messagingSenderId:
      (payload.syncSettings && payload.syncSettings.messagingSenderId) || (current.syncSettings && current.syncSettings.messagingSenderId) || "",
    appId: (payload.syncSettings && payload.syncSettings.appId) || (current.syncSettings && current.syncSettings.appId) || "",
    lastSyncedAt: (payload.syncSettings && payload.syncSettings.lastSyncedAt) || (current.syncSettings && current.syncSettings.lastSyncedAt) || "",
    lastError: (payload.syncSettings && payload.syncSettings.lastError) || (current.syncSettings && current.syncSettings.lastError) || ""
  });
  return {
    brews,
    cafes,
    beans,
    grinders,
    machines,
    knowledgeEntries,
    selectedKnowledgeScopes,
    aiSettings,
    syncSettings,
    importedAny: brews.length > 0 || cafes.length > 0 || beans.length > 0 || grinders.length > 0 || machines.length > 0 || knowledgeEntries.length > 0
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
  const cafes = normalizeCafes(resolveImportArray(source, "cafes"));
  const beans = normalizeBeans(resolveImportArray(source, "beans"));
  const grinders = normalizeGrinders(resolveImportArray(source, "grinders"));
  const machines = normalizeMachines(resolveImportArray(source, "machines"));
  const knowledgeEntries = normalizeKnowledgeEntries(resolveImportArray(source, "knowledgeEntries"));
  const selectedKnowledgeScopes = normalizeSelectedKnowledgeScopes(resolveImportArray(source, "selectedKnowledgeScopes"));
  const aiSettings = normalizeAiSettings(source && typeof source === "object" ? source.aiSettings : {});
  const syncSettings = normalizeSyncSettings(source && typeof source === "object" ? source.syncSettings : {});
  const importedAny = brews.length > 0 || cafes.length > 0 || beans.length > 0 || grinders.length > 0 || machines.length > 0 || knowledgeEntries.length > 0;
  return { brews, cafes, beans, grinders, machines, knowledgeEntries, selectedKnowledgeScopes, aiSettings, syncSettings, importedAny };
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
    [STORAGE_KEYS.syncSettings]: localStorage.getItem(STORAGE_KEYS.syncSettings),
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
  localStorage.setItem(STORAGE_KEYS.syncSettings, JSON.stringify(normalizeSyncSettings(payload.syncSettings)));
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
  return normalizeBeans(safeParse(localStorage.getItem(STORAGE_KEYS.beans), []));
}

export function saveBeans(beans) {
  localStorage.setItem(STORAGE_KEYS.beans, JSON.stringify(normalizeBeans(beans)));
}

export function loadGrinders() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.grinders), []);
}

export function saveGrinders(grinders) {
  localStorage.setItem(STORAGE_KEYS.grinders, JSON.stringify(grinders));
}

export function loadMachines() {
  return normalizeMachines(safeParse(localStorage.getItem(STORAGE_KEYS.machines), []));
}

export function saveMachines(machines) {
  localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(normalizeMachines(machines)));
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
    aiSettings: loadAiSettings(),
    syncSettings: loadSyncSettings()
  };
}

export function importAll(data, options = {}) {
  const mode = options && options.mode === "replace" ? "replace" : "merge";
  const payload = buildImportPayload(data);
  if (!payload.importedAny) {
    throw new Error("No compatible data found in import file");
  }
  const finalPayload = mode === "merge" ? mergeImportPayload(payload) : payload;
  const snapshot = readStorageSnapshot();
  try {
    persistPayload(finalPayload);
    return { mediaStripped: false, mode };
  } catch (error) {
    restoreStorageSnapshot(snapshot);
    throw error;
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
  localStorage.removeItem(STORAGE_KEYS.syncSettings);
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

export function loadSyncSettings() {
  return normalizeSyncSettings(safeParse(localStorage.getItem(STORAGE_KEYS.syncSettings), {}));
}

export function saveSyncSettings(value) {
  localStorage.setItem(STORAGE_KEYS.syncSettings, JSON.stringify(normalizeSyncSettings(value)));
}
