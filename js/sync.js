import { loadBrews, loadSyncSettings, saveSyncSettings } from "./storage.js";

let syncQueue = Promise.resolve();

function mapBrewToCloudRecord(brew) {
  return {
    id: String(brew.id || ""),
    brew_date: brew.date || null,
    method: brew.method || null,
    dose_grams: typeof brew.doseGrams === "number" ? brew.doseGrams : null,
    yield_grams: typeof brew.yieldGrams === "number" ? brew.yieldGrams : null,
    extraction_time: typeof brew.extractionTime === "number" ? brew.extractionTime : null,
    notes: brew.notes || "",
    score: typeof brew.score === "number" ? brew.score : null,
    payload: brew,
    updated_at: new Date().toISOString()
  };
}

function getStatusMeta(state, detail = "") {
  if (state === "syncing") {
    return {
      label: "Syncing",
      title: "Pushing brews to cloud backup",
      detail
    };
  }
  if (state === "synced") {
    return {
      label: "Backed up",
      title: detail ? `Backed up · ${detail}` : "Backed up",
      detail
    };
  }
  if (state === "error") {
    return {
      label: "Sync failed",
      title: detail ? `Sync failed · ${detail}` : "Sync failed",
      detail
    };
  }
  return {
    label: "Local only",
    title: detail || "Saved only in this browser. Add a Supabase project URL and anon key to enable backup.",
    detail
  };
}

function emitSyncStatus(state, detail = "") {
  const payload = { state, ...getStatusMeta(state, detail) };
  document.dispatchEvent(new CustomEvent("sync-status-changed", { detail: payload }));
}

function getConfig() {
  return loadSyncSettings();
}

function isConfigured(config) {
  return Boolean(config && config.enabled && config.supabaseUrl && config.anonKey);
}

async function upsertBrews(records) {
  const config = getConfig();
  if (!isConfigured(config)) {
    emitSyncStatus("idle");
    return { skipped: true };
  }
  if (!records.length) {
    emitSyncStatus(config.lastSyncedAt ? "synced" : "idle", config.lastSyncedAt ? `Last sync ${new Date(config.lastSyncedAt).toLocaleString()}` : "");
    return { skipped: true };
  }

  emitSyncStatus("syncing");
  const response = await fetch(`${config.supabaseUrl}/rest/v1/brew_logs?on_conflict=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(records)
  });

  if (!response.ok) {
    const message = await response.text();
    const nextConfig = { ...config, lastError: message || `HTTP ${response.status}` };
    saveSyncSettings(nextConfig);
    emitSyncStatus("error", nextConfig.lastError);
    throw new Error(nextConfig.lastError);
  }

  const syncedAt = new Date().toISOString();
  saveSyncSettings({ ...config, lastSyncedAt: syncedAt, lastError: "" });
  emitSyncStatus("synced", new Date(syncedAt).toLocaleString());
  return { skipped: false, syncedAt };
}

function enqueueSync(task) {
  syncQueue = syncQueue.catch(() => {}).then(task);
  return syncQueue;
}

export function initSyncStatus() {
  const config = getConfig();
  if (!isConfigured(config)) {
    emitSyncStatus("idle");
    return;
  }
  if (config.lastError) {
    emitSyncStatus("error", config.lastError);
    return;
  }
  emitSyncStatus(config.lastSyncedAt ? "synced" : "idle", config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : "");
}

export function bindSyncStatusUi() {
  const nodes = Array.from(document.querySelectorAll("[data-sync-status]"));
  if (!nodes.length) return;

  const apply = detail => {
    nodes.forEach(node => {
      node.setAttribute("data-state", detail.state || "idle");
      node.setAttribute("title", detail.title || "");
      node.setAttribute("aria-label", detail.title || detail.label || "Sync status");
      const textNode = node.querySelector("[data-sync-label]");
      if (textNode) textNode.textContent = detail.label || "Local only";
    });
  };

  document.addEventListener("sync-status-changed", event => {
    apply((event && event.detail) || getStatusMeta("idle"));
  });

  apply(getStatusMeta("idle"));
}

export function saveCloudSyncSettings(settings) {
  const current = getConfig();
  const nextConfig = {
    ...current,
    ...settings,
    enabled: Boolean(settings && settings.enabled)
  };
  saveSyncSettings(nextConfig);
  initSyncStatus();
  return loadSyncSettings();
}

export function syncAllBrewsToCloud() {
  return enqueueSync(async () => {
    const brews = loadBrews();
    return upsertBrews(brews.map(mapBrewToCloudRecord));
  });
}

export function syncBrewToCloud(brew) {
  return enqueueSync(async () => upsertBrews([mapBrewToCloudRecord(brew)]));
}
