import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { doc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js";
import { getDownloadURL, getStorage, ref, uploadString } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import {
  loadBeans,
  loadBrews,
  loadGrinders,
  loadMachines,
  loadSyncSettings,
  saveBeans,
  saveBrews,
  saveGrinders,
  saveMachines,
  saveSyncSettings
} from "./storage.js";

let syncQueue = Promise.resolve();
let firebaseServices = null;
let firebaseSignature = "";

function isRemoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function getConfig() {
  return loadSyncSettings();
}

function toFirebaseConfig(config) {
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId
  };
}

function getConfigSignature(config) {
  return JSON.stringify(toFirebaseConfig(config));
}

function isConfigured(config) {
  return Boolean(
    config &&
      config.enabled &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId
  );
}

function getFirebaseServices(config) {
  const nextSignature = getConfigSignature(config);
  if (firebaseServices && firebaseSignature === nextSignature) {
    return firebaseServices;
  }
  const appName = `clog-sync-${config.projectId}`;
  const existingApp = getApps().find(app => app.name === appName);
  const app = existingApp || initializeApp(toFirebaseConfig(config), appName);
  firebaseServices = {
    app,
    db: getFirestore(app),
    storage: getStorage(app)
  };
  firebaseSignature = nextSignature;
  return firebaseServices;
}

function getStatusMeta(state, detail = "") {
  if (state === "syncing") {
    return {
      label: "Syncing",
      title: detail || "Backing up to Firebase",
      detail
    };
  }
  if (state === "synced") {
    return {
      label: "Backed up",
      title: detail ? `Backed up · ${detail}` : "Backed up to Firebase",
      detail
    };
  }
  if (state === "error") {
    return {
      label: "Sync failed",
      title: detail ? `Sync failed · ${detail}` : "Firebase backup failed",
      detail
    };
  }
  return {
    label: "Local only",
    title: detail || "Saved only in this browser. Add Firebase config to enable cloud backup.",
    detail
  };
}

function emitSyncStatus(state, detail = "") {
  const payload = { state, ...getStatusMeta(state, detail) };
  document.dispatchEvent(new CustomEvent("sync-status-changed", { detail: payload }));
}

function describeCloudFailure(rawMessage = "") {
  const message = String(rawMessage || "").trim();
  if (!message) return "Unknown Firebase backup error";
  if (/duplicate-app|already exists/i.test(message)) {
    return "Firebase tried to initialize twice. Refresh once and try syncing again.";
  }
  if (/storage\/unauthorized|permission/i.test(message)) {
    return "Firebase Storage blocked the upload. Check your Storage rules.";
  }
  if (/firestore|permission-denied|missing or insufficient permissions/i.test(message)) {
    return "Firestore blocked the backup. Check your Firestore rules.";
  }
  if (/requested entity was not found|not found/i.test(message)) {
    return "Firestore or Storage is not enabled yet in this Firebase project.";
  }
  if (/bucket/i.test(message)) {
    return "Firebase Storage bucket is not ready. Check the storageBucket value and Storage setup.";
  }
  if (/timed out after/i.test(message)) {
    return `${message} Most likely cause: Firestore rules deny writes or anonymous auth is off.`;
  }
  return message;
}

function saveSyncError(config, rawMessage) {
  const nextConfig = { ...config, lastError: describeCloudFailure(rawMessage) };
  saveSyncSettings(nextConfig);
  emitSyncStatus("error", nextConfig.lastError);
  return nextConfig.lastError;
}

function completeSync(config) {
  const syncedAt = new Date().toISOString();
  saveSyncSettings({ ...config, lastSyncedAt: syncedAt, lastError: "" });
  emitSyncStatus("synced", new Date(syncedAt).toLocaleString());
  return syncedAt;
}

function mapBrewToCloudRecord(brew) {
  return {
    id: String(brew.id || ""),
    brewDate: brew.date || null,
    method: brew.method || null,
    doseGrams: typeof brew.doseGrams === "number" ? brew.doseGrams : null,
    yieldGrams: typeof brew.yieldGrams === "number" ? brew.yieldGrams : null,
    extractionTime: typeof brew.extractionTime === "number" ? brew.extractionTime : null,
    notes: brew.notes || "",
    score: typeof brew.score === "number" ? brew.score : null,
    payload: brew,
    updatedAt: new Date().toISOString()
  };
}

function mapBeanToCloudRecord(bean) {
  const photoUrl = bean.photoUrl || (isRemoteUrl(bean.photoDataUrl) ? bean.photoDataUrl : "");
  return {
    id: String(bean.id || ""),
    name: bean.name || "",
    beanType: bean.beanType || "",
    roastType: bean.roastType || "",
    openDate: bean.openDate || "",
    notes: bean.notes || "",
    photoUrl: photoUrl || "",
    photoStoragePath: bean.photoStoragePath || "",
    payload: {
      ...bean,
      photoDataUrl: photoUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: bean.photoStoragePath || ""
    },
    updatedAt: new Date().toISOString()
  };
}

function mapMachineToCloudRecord(machine) {
  const photoUrl = machine.photoUrl || (isRemoteUrl(machine.photoDataUrl) ? machine.photoDataUrl : "");
  return {
    id: String(machine.id || ""),
    name: machine.name || "",
    notes: machine.notes || "",
    photoUrl: photoUrl || "",
    photoStoragePath: machine.photoStoragePath || "",
    payload: {
      ...machine,
      photoDataUrl: photoUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: machine.photoStoragePath || ""
    },
    updatedAt: new Date().toISOString()
  };
}

function mapGrinderToCloudRecord(grinder) {
  const photoUrl = grinder.photoUrl || (isRemoteUrl(grinder.photoDataUrl) ? grinder.photoDataUrl : "");
  return {
    id: String(grinder.id || ""),
    name: grinder.name || "",
    notes: grinder.notes || "",
    photoUrl: photoUrl || "",
    photoStoragePath: grinder.photoStoragePath || "",
    payload: {
      ...grinder,
      photoDataUrl: photoUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: grinder.photoStoragePath || ""
    },
    updatedAt: new Date().toISOString()
  };
}

async function saveRecord(services, collectionName, id, payload) {
  await setDoc(doc(services.db, collectionName, String(id || "")), payload, { merge: true });
}

async function uploadMediaDataUrl(services, objectPath, dataUrl) {
  const storageRef = ref(services.storage, objectPath);
  await uploadString(storageRef, dataUrl, "data_url");
  return getDownloadURL(storageRef);
}

async function uploadBeanPhotoInternal(services, beanId, dataUrl) {
  const objectPath = `beans/${beanId}.jpg`;
  const photoUrl = await uploadMediaDataUrl(services, objectPath, dataUrl);
  return {
    photoDataUrl: photoUrl,
    photoUrl,
    photoStoragePath: objectPath
  };
}

async function uploadMachinePhotoInternal(services, machineId, dataUrl) {
  const objectPath = `machines/${machineId}.jpg`;
  const photoUrl = await uploadMediaDataUrl(services, objectPath, dataUrl);
  return {
    photoDataUrl: photoUrl,
    photoUrl,
    photoStoragePath: objectPath
  };
}

async function uploadGrinderPhotoInternal(services, grinderId, dataUrl) {
  const objectPath = `grinders/${grinderId}.jpg`;
  const photoUrl = await uploadMediaDataUrl(services, objectPath, dataUrl);
  return {
    photoDataUrl: photoUrl,
    photoUrl,
    photoStoragePath: objectPath
  };
}

async function prepareBeanForCloud(services, bean) {
  if (!bean || !bean.id) return bean;
  if (!isImageDataUrl(bean.photoDataUrl)) {
    const photoUrl = bean.photoUrl || (isRemoteUrl(bean.photoDataUrl) ? bean.photoDataUrl : "");
    return {
      ...bean,
      photoDataUrl: photoUrl || bean.photoDataUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: bean.photoStoragePath || ""
    };
  }
  return {
    ...bean,
    ...(await uploadBeanPhotoInternal(services, bean.id, bean.photoDataUrl))
  };
}

async function prepareMachineForCloud(services, machine) {
  if (!machine || !machine.id) return machine;
  if (!isImageDataUrl(machine.photoDataUrl)) {
    const photoUrl = machine.photoUrl || (isRemoteUrl(machine.photoDataUrl) ? machine.photoDataUrl : "");
    return {
      ...machine,
      photoDataUrl: photoUrl || machine.photoDataUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: machine.photoStoragePath || ""
    };
  }
  return {
    ...machine,
    ...(await uploadMachinePhotoInternal(services, machine.id, machine.photoDataUrl))
  };
}

async function prepareGrinderForCloud(services, grinder) {
  if (!grinder || !grinder.id) return grinder;
  if (!isImageDataUrl(grinder.photoDataUrl)) {
    const photoUrl = grinder.photoUrl || (isRemoteUrl(grinder.photoDataUrl) ? grinder.photoDataUrl : "");
    return {
      ...grinder,
      photoDataUrl: photoUrl || grinder.photoDataUrl || "",
      photoUrl: photoUrl || "",
      photoStoragePath: grinder.photoStoragePath || ""
    };
  }
  return {
    ...grinder,
    ...(await uploadGrinderPhotoInternal(services, grinder.id, grinder.photoDataUrl))
  };
}

async function syncBrewsInternal(services, brews) {
  if (!brews.length) return { skipped: true, brews };
  for (const brew of brews) {
    await saveRecord(services, "brews", brew.id, mapBrewToCloudRecord(brew));
  }
  return { skipped: false, brews };
}

async function syncBeansInternal(services, beans) {
  if (!beans.length) return { skipped: true, beans };
  const preparedBeans = [];
  for (const bean of beans) {
    const preparedBean = await prepareBeanForCloud(services, bean);
    await saveRecord(services, "beans", preparedBean.id, mapBeanToCloudRecord(preparedBean));
    preparedBeans.push(preparedBean);
  }
  return { skipped: false, beans: preparedBeans };
}

async function syncMachinesInternal(services, machines) {
  if (!machines.length) return { skipped: true, machines };
  const preparedMachines = [];
  for (const machine of machines) {
    const preparedMachine = await prepareMachineForCloud(services, machine);
    await saveRecord(services, "machines", preparedMachine.id, mapMachineToCloudRecord(preparedMachine));
    preparedMachines.push(preparedMachine);
  }
  return { skipped: false, machines: preparedMachines };
}

async function syncGrindersInternal(services, grinders) {
  if (!grinders.length) return { skipped: true, grinders };
  const preparedGrinders = [];
  for (const grinder of grinders) {
    const preparedGrinder = await prepareGrinderForCloud(services, grinder);
    await saveRecord(services, "grinders", preparedGrinder.id, mapGrinderToCloudRecord(preparedGrinder));
    preparedGrinders.push(preparedGrinder);
  }
  return { skipped: false, grinders: preparedGrinders };
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
    enabled: Boolean(
      settings &&
        settings.apiKey &&
        settings.authDomain &&
        settings.projectId &&
        settings.storageBucket &&
        settings.messagingSenderId &&
        settings.appId
    )
  };
  saveSyncSettings(nextConfig);
  initSyncStatus();
  return loadSyncSettings();
}

export function syncAllBrewsToCloud() {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true };
    }
    emitSyncStatus("syncing", "Backing up brews to Firebase");
    try {
      const services = getFirebaseServices(config);
      const result = await syncBrewsInternal(services, loadBrews());
      return { ...result, syncedAt: completeSync(config) };
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

export function syncBrewToCloud(brew) {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true };
    }
    emitSyncStatus("syncing", "Backing up brew to Firebase");
    try {
      const services = getFirebaseServices(config);
      const result = await syncBrewsInternal(services, [brew]);
      return { ...result, syncedAt: completeSync(config) };
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

function withSyncTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label || "Sync"} timed out after ${Math.round(timeoutMs / 1000)}s waiting for Firebase.`));
    }, timeoutMs);
    Promise.resolve(promise).then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function syncAllDataToCloud() {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true };
    }
    emitSyncStatus("syncing", "Backing up brews, beans, grinders, and machines to Firebase");
    try {
      const services = getFirebaseServices(config);
      const totalTimeoutMs = 35000;
      const inner = (async () => {
        const brewResult = await syncBrewsInternal(services, loadBrews());
        const beanResult = await syncBeansInternal(services, loadBeans());
        const grinderResult = await syncGrindersInternal(services, loadGrinders());
        const machineResult = await syncMachinesInternal(services, loadMachines());
        if (beanResult.beans && beanResult.beans.length) {
          saveBeans(beanResult.beans);
        }
        if (grinderResult.grinders && grinderResult.grinders.length) {
          saveGrinders(grinderResult.grinders);
        }
        if (machineResult.machines && machineResult.machines.length) {
          saveMachines(machineResult.machines);
        }
        return {
          skipped: brewResult.skipped && beanResult.skipped && grinderResult.skipped && machineResult.skipped,
          syncedAt: completeSync(config)
        };
      })();
      return await withSyncTimeout(inner, totalTimeoutMs, "Cloud sync");
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

export function syncBeanToCloud(bean) {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true, bean };
    }
    emitSyncStatus("syncing", "Backing up bean to Firebase");
    try {
      const services = getFirebaseServices(config);
      const result = await syncBeansInternal(services, [bean]);
      const syncedBean = result.beans && result.beans[0] ? result.beans[0] : bean;
      const nextBeans = loadBeans().map(item => (item.id === syncedBean.id ? { ...item, ...syncedBean } : item));
      saveBeans(nextBeans);
      return { skipped: false, bean: syncedBean, syncedAt: completeSync(config) };
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

export function syncMachineToCloud(machine) {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true, machine };
    }
    emitSyncStatus("syncing", "Backing up machine to Firebase");
    try {
      const services = getFirebaseServices(config);
      const result = await syncMachinesInternal(services, [machine]);
      const syncedMachine = result.machines && result.machines[0] ? result.machines[0] : machine;
      const nextMachines = loadMachines().map(item => (item.id === syncedMachine.id ? { ...item, ...syncedMachine } : item));
      saveMachines(nextMachines);
      return { skipped: false, machine: syncedMachine, syncedAt: completeSync(config) };
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

export async function uploadBeanPhotoToCloud(beanId, dataUrl) {
  const config = getConfig();
  if (!isConfigured(config) || !beanId || !isImageDataUrl(dataUrl)) {
    return { skipped: true, photoDataUrl: dataUrl || "", photoUrl: "", photoStoragePath: "" };
  }
  try {
    const services = getFirebaseServices(config);
    return { skipped: false, ...(await uploadBeanPhotoInternal(services, beanId, dataUrl)) };
  } catch (error) {
    const message = saveSyncError(config, error instanceof Error ? error.message : "");
    throw new Error(message);
  }
}

export async function uploadMachinePhotoToCloud(machineId, dataUrl) {
  const config = getConfig();
  if (!isConfigured(config) || !machineId || !isImageDataUrl(dataUrl)) {
    return { skipped: true, photoDataUrl: dataUrl || "", photoUrl: "", photoStoragePath: "" };
  }
  try {
    const services = getFirebaseServices(config);
    return { skipped: false, ...(await uploadMachinePhotoInternal(services, machineId, dataUrl)) };
  } catch (error) {
    const message = saveSyncError(config, error instanceof Error ? error.message : "");
    throw new Error(message);
  }
}

export function syncGrinderToCloud(grinder) {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true, grinder };
    }
    emitSyncStatus("syncing", "Backing up grinder to Firebase");
    try {
      const services = getFirebaseServices(config);
      const result = await syncGrindersInternal(services, [grinder]);
      const syncedGrinder = result.grinders && result.grinders[0] ? result.grinders[0] : grinder;
      const nextGrinders = loadGrinders().map(item => (item.id === syncedGrinder.id ? { ...item, ...syncedGrinder } : item));
      saveGrinders(nextGrinders);
      return { skipped: false, grinder: syncedGrinder, syncedAt: completeSync(config) };
    } catch (error) {
      const message = saveSyncError(config, error instanceof Error ? error.message : "");
      throw new Error(message);
    }
  });
}

export async function uploadGrinderPhotoToCloud(grinderId, dataUrl) {
  const config = getConfig();
  if (!isConfigured(config) || !grinderId || !isImageDataUrl(dataUrl)) {
    return { skipped: true, photoDataUrl: dataUrl || "", photoUrl: "", photoStoragePath: "" };
  }
  try {
    const services = getFirebaseServices(config);
    return { skipped: false, ...(await uploadGrinderPhotoInternal(services, grinderId, dataUrl)) };
  } catch (error) {
    const message = saveSyncError(config, error instanceof Error ? error.message : "");
    throw new Error(message);
  }
}

function patchById(items, nextItem) {
  if (!nextItem || !nextItem.id) return items;
  const cloned = Array.isArray(items) ? items.slice() : [];
  const index = cloned.findIndex(item => item && item.id === nextItem.id);
  if (index === -1) {
    cloned.unshift(nextItem);
  } else {
    cloned[index] = { ...(cloned[index] || {}), ...nextItem };
  }
  return cloned;
}

function saveLocallyWithPhotoFallback({ type, items, nextItem, cloudMedia, localSaveFn }) {
  const media = cloudMedia && typeof cloudMedia === "object"
    ? {
        photoDataUrl: cloudMedia.photoUrl || cloudMedia.photoDataUrl || "",
        photoUrl: cloudMedia.photoUrl || "",
        photoStoragePath: cloudMedia.photoStoragePath || ""
      }
    : { photoDataUrl: "", photoUrl: "", photoStoragePath: "" };
  const merged = {
    ...nextItem,
    photoDataUrl: media.photoDataUrl || nextItem.photoDataUrl || "",
    photoUrl: media.photoUrl || nextItem.photoUrl || "",
    photoStoragePath: media.photoStoragePath || nextItem.photoStoragePath || ""
  };
  const patched = patchById(items, merged);
  localSaveFn(patched);
  return patched;
}

export async function saveBeanCloudFirst(beanDraft, options = {}) {
  const { photoDataUrl = "", existingItems = null } = options;
  const config = getConfig();
  if (!beanDraft || !beanDraft.id) {
    throw new Error("Bean id is required to save cloud-first.");
  }
  const beans = Array.isArray(existingItems) ? existingItems : loadBeans();
  if (!isConfigured(config)) {
    const saved = saveLocallyWithPhotoFallback({
      type: "bean",
      items: beans,
      nextItem: beanDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveBeans
    });
    return { mode: "local-only", bean: saved.find(item => item.id === beanDraft.id) || beanDraft, items: saved };
  }
  try {
    const services = getFirebaseServices(config);
    let cloudMedia = null;
    if (photoDataUrl && isImageDataUrl(photoDataUrl)) {
      cloudMedia = await uploadBeanPhotoInternal(services, beanDraft.id, photoDataUrl);
    }
    const mergedBean = {
      ...beanDraft,
      photoDataUrl: cloudMedia ? cloudMedia.photoUrl : beanDraft.photoDataUrl || "",
      photoUrl: cloudMedia ? cloudMedia.photoUrl : beanDraft.photoUrl || "",
      photoStoragePath: cloudMedia ? cloudMedia.photoStoragePath : beanDraft.photoStoragePath || ""
    };
    const prepared = await prepareBeanForCloud(services, mergedBean);
    await saveRecord(services, "beans", prepared.id, mapBeanToCloudRecord(prepared));
    const savedItems = saveLocallyWithPhotoFallback({
      type: "bean",
      items: beans,
      nextItem: prepared,
      cloudMedia,
      localSaveFn: saveBeans
    });
    completeSync(config);
    return { mode: "cloud-first", bean: savedItems.find(item => item.id === prepared.id) || prepared, items: savedItems };
  } catch (cloudError) {
    const described = describeCloudFailure(cloudError instanceof Error ? cloudError.message : "");
    saveSyncError(config, described);
    if (photoDataUrl && !options.allowLocalPhotoDataUrl) {
      throw new Error(`Cloud save failed and local storage can no longer keep large photo payloads. ${described}`);
    }
    const savedItems = saveLocallyWithPhotoFallback({
      type: "bean",
      items: beans,
      nextItem: beanDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveBeans
    });
    return {
      mode: "local-fallback",
      bean: savedItems.find(item => item.id === beanDraft.id) || beanDraft,
      items: savedItems,
      error: described
    };
  }
}

export async function saveMachineCloudFirst(machineDraft, options = {}) {
  const { photoDataUrl = "", existingItems = null } = options;
  const config = getConfig();
  if (!machineDraft || !machineDraft.id) {
    throw new Error("Machine id is required to save cloud-first.");
  }
  const machines = Array.isArray(existingItems) ? existingItems : loadMachines();
  if (!isConfigured(config)) {
    const saved = saveLocallyWithPhotoFallback({
      type: "machine",
      items: machines,
      nextItem: machineDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveMachines
    });
    return { mode: "local-only", machine: saved.find(item => item.id === machineDraft.id) || machineDraft, items: saved };
  }
  try {
    const services = getFirebaseServices(config);
    let cloudMedia = null;
    if (photoDataUrl && isImageDataUrl(photoDataUrl)) {
      cloudMedia = await uploadMachinePhotoInternal(services, machineDraft.id, photoDataUrl);
    }
    const mergedMachine = {
      ...machineDraft,
      photoDataUrl: cloudMedia ? cloudMedia.photoUrl : machineDraft.photoDataUrl || "",
      photoUrl: cloudMedia ? cloudMedia.photoUrl : machineDraft.photoUrl || "",
      photoStoragePath: cloudMedia ? cloudMedia.photoStoragePath : machineDraft.photoStoragePath || ""
    };
    const prepared = await prepareMachineForCloud(services, mergedMachine);
    await saveRecord(services, "machines", prepared.id, mapMachineToCloudRecord(prepared));
    const savedItems = saveLocallyWithPhotoFallback({
      type: "machine",
      items: machines,
      nextItem: prepared,
      cloudMedia,
      localSaveFn: saveMachines
    });
    completeSync(config);
    return { mode: "cloud-first", machine: savedItems.find(item => item.id === prepared.id) || prepared, items: savedItems };
  } catch (cloudError) {
    const described = describeCloudFailure(cloudError instanceof Error ? cloudError.message : "");
    saveSyncError(config, described);
    if (photoDataUrl && !options.allowLocalPhotoDataUrl) {
      throw new Error(`Cloud save failed and local storage can no longer keep large photo payloads. ${described}`);
    }
    const savedItems = saveLocallyWithPhotoFallback({
      type: "machine",
      items: machines,
      nextItem: machineDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveMachines
    });
    return {
      mode: "local-fallback",
      machine: savedItems.find(item => item.id === machineDraft.id) || machineDraft,
      items: savedItems,
      error: described
    };
  }
}

export async function saveGrinderCloudFirst(grinderDraft, options = {}) {
  const { photoDataUrl = "", existingItems = null } = options;
  const config = getConfig();
  if (!grinderDraft || !grinderDraft.id) {
    throw new Error("Grinder id is required to save cloud-first.");
  }
  const grinders = Array.isArray(existingItems) ? existingItems : loadGrinders();
  if (!isConfigured(config)) {
    const saved = saveLocallyWithPhotoFallback({
      type: "grinder",
      items: grinders,
      nextItem: grinderDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveGrinders
    });
    return { mode: "local-only", grinder: saved.find(item => item.id === grinderDraft.id) || grinderDraft, items: saved };
  }
  try {
    const services = getFirebaseServices(config);
    let cloudMedia = null;
    if (photoDataUrl && isImageDataUrl(photoDataUrl)) {
      cloudMedia = await uploadGrinderPhotoInternal(services, grinderDraft.id, photoDataUrl);
    }
    const mergedGrinder = {
      ...grinderDraft,
      photoDataUrl: cloudMedia ? cloudMedia.photoUrl : grinderDraft.photoDataUrl || "",
      photoUrl: cloudMedia ? cloudMedia.photoUrl : grinderDraft.photoUrl || "",
      photoStoragePath: cloudMedia ? cloudMedia.photoStoragePath : grinderDraft.photoStoragePath || ""
    };
    const prepared = await prepareGrinderForCloud(services, mergedGrinder);
    await saveRecord(services, "grinders", prepared.id, mapGrinderToCloudRecord(prepared));
    const savedItems = saveLocallyWithPhotoFallback({
      type: "grinder",
      items: grinders,
      nextItem: prepared,
      cloudMedia,
      localSaveFn: saveGrinders
    });
    completeSync(config);
    return { mode: "cloud-first", grinder: savedItems.find(item => item.id === prepared.id) || prepared, items: savedItems };
  } catch (cloudError) {
    const described = describeCloudFailure(cloudError instanceof Error ? cloudError.message : "");
    saveSyncError(config, described);
    if (photoDataUrl && !options.allowLocalPhotoDataUrl) {
      throw new Error(`Cloud save failed and local storage can no longer keep large photo payloads. ${described}`);
    }
    const savedItems = saveLocallyWithPhotoFallback({
      type: "grinder",
      items: grinders,
      nextItem: grinderDraft,
      cloudMedia: photoDataUrl ? { photoDataUrl, photoUrl: "", photoStoragePath: "" } : null,
      localSaveFn: saveGrinders
    });
    return {
      mode: "local-fallback",
      grinder: savedItems.find(item => item.id === grinderDraft.id) || grinderDraft,
      items: savedItems,
      error: described
    };
  }
}

export async function saveBrewCloudFirst(brewDraft, options = {}) {
  const { existingItems = null } = options;
  const config = getConfig();
  if (!brewDraft || !brewDraft.id) {
    throw new Error("Brew id is required to save cloud-first.");
  }
  const brews = Array.isArray(existingItems) ? existingItems : loadBrews();
  if (!isConfigured(config)) {
    const patched = patchById(brews, brewDraft);
    saveBrews(patched);
    return { mode: "local-only", brew: patched.find(item => item.id === brewDraft.id) || brewDraft, items: patched };
  }
  try {
    const services = getFirebaseServices(config);
    await saveRecord(services, "brews", brewDraft.id, mapBrewToCloudRecord(brewDraft));
    const patched = patchById(brews, brewDraft);
    saveBrews(patched);
    completeSync(config);
    return { mode: "cloud-first", brew: patched.find(item => item.id === brewDraft.id) || brewDraft, items: patched };
  } catch (cloudError) {
    const described = describeCloudFailure(cloudError instanceof Error ? cloudError.message : "");
    saveSyncError(config, described);
    const patched = patchById(brews, brewDraft);
    saveBrews(patched);
    return {
      mode: "local-fallback",
      brew: patched.find(item => item.id === brewDraft.id) || brewDraft,
      items: patched,
      error: described
    };
  }
}
