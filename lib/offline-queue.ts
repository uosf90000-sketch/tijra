"use client";

export type OfflineOperationType = "SALE" | "COUNT";

export type OfflineOperation = {
  id: string;
  type: OfflineOperationType;
  url: string;
  body: Record<string, unknown>;
  createdAt: string;
  dedupeKey?: string;
  attempts: number;
  lastError?: string | null;
};

const DB_NAME = "tijra-offline";
const DB_VERSION = 1;
const STORE_NAME = "operations";
const CHANGE_EVENT = "tijra:offline-queue-change";
let flushPromise: Promise<FlushResult> | null = null;

export type FlushResult = { synced: number; pending: number; failed: number };

function browserReady() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function notifyQueueChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!browserReady()) return reject(new Error("INDEXED_DB_UNAVAILABLE"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("dedupeKey", "dedupeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXED_DB_OPEN_FAILED"));
  });
}

async function readAll(): Promise<OfflineOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error || new Error("OFFLINE_QUEUE_READ_FAILED"));
    tx.oncomplete = () => db.close();
  });
}

async function put(operation: OfflineOperation) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(operation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("OFFLINE_QUEUE_WRITE_FAILED"));
  });
  db.close();
}

async function remove(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("OFFLINE_QUEUE_DELETE_FAILED"));
  });
  db.close();
}

export function makeOfflineOperationId(prefix: "sale" | "count") {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function queueOfflineOperation(input: Omit<OfflineOperation, "attempts" | "lastError">) {
  let operation: OfflineOperation = { ...input, attempts: 0, lastError: null };

  if (input.dedupeKey) {
    const existing = (await readAll()).find((item) => item.dedupeKey === input.dedupeKey);
    if (existing) {
      const expectedPreviousQuantity = existing.body.expectedPreviousQuantity;
      const clientOperationId = existing.body.clientOperationId;
      operation = {
        ...operation,
        id: existing.id,
        createdAt: existing.createdAt,
        body: {
          ...operation.body,
          ...(expectedPreviousQuantity == null ? {} : { expectedPreviousQuantity }),
          ...(clientOperationId == null ? {} : { clientOperationId }),
        },
      };
    }
  }

  await put(operation);
  notifyQueueChange();
  return operation;
}

export async function listOfflineOperations(type?: OfflineOperationType) {
  const all = await readAll();
  return type ? all.filter((item) => item.type === type) : all;
}

export async function pendingOfflineCount(type?: OfflineOperationType) {
  return (await listOfflineOperations(type)).length;
}

export async function pendingSaleQuantities() {
  const totals = new Map<string, number>();
  for (const operation of await listOfflineOperations("SALE")) {
    const items = Array.isArray(operation.body.items) ? operation.body.items as Array<{ productId?: string; quantity?: number }> : [];
    for (const item of items) {
      if (!item.productId || !Number.isFinite(Number(item.quantity))) continue;
      totals.set(item.productId, (totals.get(item.productId) || 0) + Number(item.quantity));
    }
  }
  return totals;
}

async function markFailed(operation: OfflineOperation, error: string) {
  await put({ ...operation, attempts: operation.attempts + 1, lastError: error });
}

async function doFlush(): Promise<FlushResult> {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    const pending = browserReady() ? (await readAll()).length : 0;
    return { synced: 0, pending, failed: 0 };
  }

  const operations = await readAll();
  let synced = 0;
  let failed = 0;

  for (const operation of operations) {
    try {
      const response = await fetch(operation.url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-tijra-offline-operation": operation.id,
        },
        body: JSON.stringify(operation.body),
      });

      if (response.ok) {
        await remove(operation.id);
        synced += 1;
        notifyQueueChange();
        continue;
      }

      const result = await response.json().catch(() => ({}));
      const error = String(result.error || `HTTP_${response.status}`);
      await markFailed(operation, error);
      failed += 1;

      if (response.status === 401 || response.status === 403 || response.status >= 500) break;
    } catch {
      await markFailed(operation, "NETWORK_ERROR");
      failed += 1;
      break;
    }
  }

  const pending = (await readAll()).length;
  notifyQueueChange();
  return { synced, pending, failed };
}

export function flushOfflineOperations() {
  if (!flushPromise) flushPromise = doFlush().finally(() => { flushPromise = null; });
  return flushPromise;
}

export const offlineQueueChangeEvent = CHANGE_EVENT;
