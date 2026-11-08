import type { DesignAsset } from "@/core/model/types";
import { getDesignAssetTotalBytes, MAX_DESIGN_ASSETS_TOTAL_BYTES, normalizeDesignAssets } from "@/core/design/assets";

const DB_NAME = "chartforge-design-library";
const DB_VERSION = 1;
const STORE_NAME = "assets";
const STORE_KEY = "workspace-design-assets";
const FALLBACK_KEY = "chartforge.design-assets.v1";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开本地素材数据库。"));
      request.onblocked = () => reject(new Error("本地素材数据库正被另一个标签页占用，请关闭其它 ChartForge 标签后重试。"));
    });
  }
  return dbPromise;
}

export async function loadDesignAssets(): Promise<DesignAsset[] | null> {
  try {
    const db = await openDatabase();
    if (db) {
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STORE_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("读取素材失败。"));
      });
      if (record !== undefined) return normalizeDesignAssets(record);
    }
  } catch {
    // A previous/broken IDB can still be recovered from the small legacy fallback below.
  }
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(FALLBACK_KEY);
      if (raw !== null) return normalizeDesignAssets(JSON.parse(raw));
    }
  } catch {
    // Invalid fallback data is ignored; workspace normalization will keep the remaining model usable.
  }
  return null;
}

export async function saveDesignAssets(assets: readonly DesignAsset[]): Promise<void> {
  const total = getDesignAssetTotalBytes(assets);
  if (total > MAX_DESIGN_ASSETS_TOTAL_BYTES || assets.some((asset) => asset.bytes > 2 * 1024 * 1024)) {
    throw new Error("工作区素材配额超限，未保存任何变更。");
  }
  const snapshot = assets.map((asset) => ({ ...asset }));
  try {
    const db = await openDatabase();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(snapshot, STORE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("保存素材到本地数据库失败。"));
        transaction.onabort = () => reject(transaction.error ?? new Error("保存素材已取消。"));
      });
      return;
    }
  } catch (cause) {
    throw new Error(cause instanceof Error ? `素材保存失败：${cause.message}` : "素材保存失败：本地数据库不可用。");
  }
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
  } catch {
    throw new Error("当前浏览器不支持 IndexedDB，且本地存储空间不足；素材未保存。请使用支持 IndexedDB 的浏览器或减少素材大小。");
  }
}
