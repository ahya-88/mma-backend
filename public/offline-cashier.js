/**
 * Modul Kasir Offline & Sinkronisasi Aman
 * - IndexedDB Antrean Transaksi Offline
 * - Enkripsi AES-256-GCM Cache Santri Lokal
 * - Batas Nominal Offline: Rp 50.000 / tx, Akumulasi Rp 100.000 / santri
 * - Indikator UI Mode Offline Kontras Tinggi
 */

const DB_NAME = "MMA_Kasir_Offline_DB";
const DB_VERSION = 1;
const STORE_SANTRI = "santriCache";
const STORE_QUEUE = "offlineQueue";

const MAX_OFFLINE_SINGLE_TX = 50000;
const MAX_OFFLINE_ACCUMULATED_SANTRI = 100000;

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (+c / 4)).toString(16)
  );
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB tidak didukung pada browser ini."));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SANTRI)) {
        db.createObjectStore(STORE_SANTRI, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: "idempotencyKey" });
        queueStore.createIndex("santriId", "santriId", { unique: false });
        queueStore.createIndex("statusSync", "statusSync", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getEncryptionKey(passphrase = "mma-kasir-local-key-2026") {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("mma-kasir-salt-offline"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(dataObj, passphrase) {
  const key = await getEncryptionKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encodedData = enc.encode(JSON.stringify(dataObj));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encrypted)),
  };
}

async function decryptData(encryptedObj, passphrase) {
  if (!encryptedObj || !encryptedObj.iv || !encryptedObj.ciphertext) return null;
  try {
    const key = await getEncryptionKey(passphrase);
    const iv = new Uint8Array(encryptedObj.iv);
    const ciphertext = new Uint8Array(encryptedObj.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (_) {
    return null;
  }
}

async function cacheSantriList(santriRows, passphrase) {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_SANTRI, "readwrite");
  const store = tx.objectStore(STORE_SANTRI);
  store.clear();

  for (const row of santriRows) {
    const encrypted = await encryptData(row, passphrase);
    store.put({ id: row.id, encrypted, cachedAt: new Date().toISOString() });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getCachedSantri(santriId, passphrase) {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_SANTRI, "readonly");
  const store = tx.objectStore(STORE_SANTRI);
  const req = store.get(santriId);

  return new Promise((resolve) => {
    req.onsuccess = async () => {
      if (!req.result || !req.result.encrypted) return resolve(null);
      const dec = await decryptData(req.result.encrypted, passphrase);
      resolve(dec);
    };
    req.onerror = () => resolve(null);
  });
}

async function purgeSantriCache() {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_SANTRI, "readwrite");
  tx.objectStore(STORE_SANTRI).clear();
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function getOfflineAccumulatedSantri(santriId) {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_QUEUE, "readonly");
  const store = tx.objectStore(STORE_QUEUE);
  const index = store.index("santriId");
  const req = index.getAll(santriId);

  return new Promise((resolve) => {
    req.onsuccess = () => {
      const items = req.result || [];
      const total = items
        .filter((i) => i.statusSync === "Menunggu")
        .reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
      resolve(total);
    };
    req.onerror = () => resolve(0);
  });
}

async function queueOfflineTransaction({ santriId, unit, jenis, kategori, jumlah, keterangan, pin, metode }) {
  jumlah = Number(jumlah);
  if (!jumlah || jumlah <= 0) throw new Error("Jumlah transaksi tidak valid.");
  if (jumlah > MAX_OFFLINE_SINGLE_TX) {
    throw new Error(`Transaksi melebihi batas nominal offline (Maks Rp ${MAX_OFFLINE_SINGLE_TX.toLocaleString("id-ID")}/tx). Hubungkan internet untuk melanjutkan.`);
  }

  const accumulated = await getOfflineAccumulatedSantri(santriId);
  if (accumulated + jumlah > MAX_OFFLINE_ACCUMULATED_SANTRI) {
    throw new Error(`Akumulasi transaksi offline santri ini mencapai batas aman (Maks Rp ${MAX_OFFLINE_ACCUMULATED_SANTRI.toLocaleString("id-ID")}). Hubungkan internet untuk sinkronisasi.`);
  }

  const idempotencyKey = generateUUID();
  const txItem = {
    idempotencyKey,
    santriId,
    unit: unit || "Kantin",
    jenis: jenis || "Tarik Tunai",
    kategori: kategori || "Jajan Harian",
    jumlah,
    keterangan: keterangan || "Transaksi Offline Kasir",
    waktuOffline: new Date().toISOString(),
    pin: pin || null,
    metode: metode || "qr",
    statusSync: "Menunggu",
    pesanError: null,
  };

  const db = await openIndexedDB();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  tx.objectStore(STORE_QUEUE).put(txItem);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(txItem);
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingOfflineQueue() {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_QUEUE, "readonly");
  const index = tx.objectStore(STORE_QUEUE).index("statusSync");
  const req = index.getAll("Menunggu");

  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function updateQueueItemStatus(idempotencyKey, statusSync, pesanError = null) {
  const db = await openIndexedDB();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  const store = tx.objectStore(STORE_QUEUE);
  const req = store.get(idempotencyKey);

  req.onsuccess = () => {
    if (req.result) {
      const updated = { ...req.result, statusSync, pesanError, syncedAt: new Date().toISOString() };
      store.put(updated);
    }
  };

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function syncOfflineQueueToServer(apiBaseUrl, sessionToken) {
  const pending = await getPendingOfflineQueue();
  if (!pending.length) return { total: 0, sukses: 0, gagal: 0 };

  let sukses = 0;
  let gagal = 0;

  try {
    const res = await fetch(`${apiBaseUrl}/transaksi/sync-offline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ items: pending }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data.hasilDetail)) {
      for (const item of data.hasilDetail) {
        if (item.status === "Sukses") {
          sukses++;
          await updateQueueItemStatus(item.idempotencyKey, "Sukses");
        } else {
          gagal++;
          await updateQueueItemStatus(item.idempotencyKey, "Ditolak", item.pesanError || "Ditolak server");
        }
      }
    }
  } catch (err) {
    // Retain pending status for next sync attempt when network fails
  }

  return { total: pending.length, sukses, gagal };
}

function initOfflineIndicatorUI(containerEl, onSyncComplete) {
  if (!containerEl) return;

  function updateStatus() {
    const isOnline = navigator.onLine;
    getPendingOfflineQueue().then((pending) => {
      const pendingCount = pending.length;
      containerEl.innerHTML = isOnline
        ? `<div style="padding: 8px 12px; background: #e6f4ea; color: #137333; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
             <span style="width: 8px; height: 8px; border-radius: 50%; background: #137333;"></span>
             TERHUBUNG - ONLINE ${pendingCount > 0 ? `(${pendingCount} Antrean Menunggu Sync)` : ""}
           </div>`
        : `<div style="padding: 8px 12px; background: #fef7e0; color: #b06000; border: 1px solid #f9ab00; border-radius: 6px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
             <span style="width: 8px; height: 8px; border-radius: 50%; background: #ea8600; animation: pulse 1.5s infinite;"></span>
             TIDAK TERHUBUNG - MODE OFFLINE (${pendingCount} Antrean Menunggu Sync)
           </div>`;
    });
  }

  window.addEventListener("online", () => {
    updateStatus();
    if (typeof onSyncComplete === "function") onSyncComplete();
  });
  window.addEventListener("offline", updateStatus);
  updateStatus();
}

if (typeof module !== "undefined") {
  module.exports = {
    openIndexedDB, cacheSantriList, getCachedSantri, purgeSantriCache,
    queueOfflineTransaction, getPendingOfflineQueue, syncOfflineQueueToServer,
    MAX_OFFLINE_SINGLE_TX, MAX_OFFLINE_ACCUMULATED_SANTRI,
  };
}
