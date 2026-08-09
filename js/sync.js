import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { doc, getFirestore, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDownloadURL, getStorage, ref, uploadString } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { loadBeans, loadBrews, loadMachines, loadSyncSettings, saveBeans, saveMachines, saveSyncSettings } from "./storage.js";

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

export function syncAllDataToCloud() {
  return enqueueSync(async () => {
    const config = getConfig();
    if (!isConfigured(config)) {
      emitSyncStatus("idle");
      return { skipped: true };
    }
    emitSyncStatus("syncing", "Backing up brews, beans, and machines to Firebase");
    try {
      const services = getFirebaseServices(config);
      const brewResult = await syncBrewsInternal(services, loadBrews());
      const beanResult = await syncBeansInternal(services, loadBeans());
      const machineResult = await syncMachinesInternal(services, loadMachines());
      if (beanResult.beans && beanResult.beans.length) {
        saveBeans(beanResult.beans);
      }
      if (machineResult.machines && machineResult.machines.length) {
        saveMachines(machineResult.machines);
      }
      return {
        skipped: brewResult.skipped && beanResult.skipped && machineResult.skipped,
        syncedAt: completeSync(config)
      };
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
