/**
 * 三十五：本地上传插图暂存（IndexedDB，降级内存 Map）。
 * key = u_<uuid>（不含 upload: 前缀）；前缀由 formatUploadAssetRef 加。
 */
import {
  defaultResizeImage,
  MAX_IMG_BYTES,
  type ResizeImageFn,
} from "@/components/DocUtil/DocBlockInjector";

const DB_NAME = "bifang-doc-uploads";
const STORE = "assets";
const DB_VER = 1;
/** 原始文件上限；超此拒收（防 IndexedDB 爆仓） */
export const MAX_UPLOAD_RAW_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif"]);

export type UploadAssetMeta = {
  key: string;
  name: string;
  mime: string;
  bytes: number;
  w: number;
  h: number;
  createdAt: number;
};

type StoredAsset = UploadAssetMeta & {data: ArrayBuffer};

export type UploadStorage = {
  get(key: string): Promise<StoredAsset | undefined>;
  set(key: string, value: StoredAsset): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};

const memory = new Map<string, StoredAsset>();
let storageOverride: UploadStorage | null = null;
let usingMemoryFallback = false;
const previewUrlCache = new Map<string, string>();

/** 测试注入；传 null 恢复默认 */
export function setUploadStorageForTest(s: UploadStorage | null): void {
  storageOverride = s;
}

export function isUploadMemoryFallback(): boolean {
  return usingMemoryFallback;
}

function newKey(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `u_${id}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, {keyPath: "key"});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb open failed"));
  });
}

const idbStorage: UploadStorage = {
  async get(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as StoredAsset | undefined);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async delete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async keys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () =>
        resolve((req.result || []).map((k) => String(k)));
      req.onerror = () => reject(req.error);
    });
  },
};

const memoryStorage: UploadStorage = {
  async get(key) {
    return memory.get(key);
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async delete(key) {
    memory.delete(key);
    const url = previewUrlCache.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrlCache.delete(key);
    }
  },
  async keys() {
    return [...memory.keys()];
  },
};

async function getStorage(): Promise<UploadStorage> {
  if (storageOverride) return storageOverride;
  try {
    await openDb();
    usingMemoryFallback = false;
    return idbStorage;
  } catch {
    usingMemoryFallback = true;
    return memoryStorage;
  }
}

export type SaveUploadOpts = {
  resizeImage?: ResizeImageFn;
  /** 测试用：跳过 File 读，直接给字节 */
  bytes?: ArrayBuffer;
  mime?: string;
  name?: string;
};

/**
 * 校验 mime → 读字节 → 超限用 defaultResizeImage 压到 ≤1.5MB → 存。
 * webp/avif 等拒绝（mimeToExt 会写错扩展名）。
 */
export async function saveUploadAsset(
  file: File | null,
  opts: SaveUploadOpts = {},
): Promise<UploadAssetMeta | null> {
  const mime = String(opts.mime || file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return null;
  }
  let buf: ArrayBuffer;
  if (opts.bytes) {
    buf = opts.bytes;
  } else if (file) {
    if (file.size > MAX_UPLOAD_RAW_BYTES) return null;
    buf = await file.arrayBuffer();
  } else {
    return null;
  }
  if (buf.byteLength > MAX_UPLOAD_RAW_BYTES) return null;

  let bytes = new Uint8Array(buf);
  let outMime = mime;
  let w = 0;
  let h = 0;
  const resizeFn = opts.resizeImage ?? defaultResizeImage;
  if (bytes.byteLength > MAX_IMG_BYTES) {
    const rs = await resizeFn(bytes, outMime, 1200, 0.85);
    if (!rs || rs.bytes.byteLength > MAX_IMG_BYTES) return null;
    bytes = rs.bytes;
    outMime = rs.mime;
    w = rs.w;
    h = rs.h;
  }
  // 再压一次仍超（极端）→ 拒
  if (bytes.byteLength > MAX_IMG_BYTES) return null;

  const key = newKey();
  const meta: UploadAssetMeta = {
    key,
    name: String(opts.name || file?.name || key).slice(0, 200),
    mime: outMime,
    bytes: bytes.byteLength,
    w,
    h,
    createdAt: Date.now(),
  };
  const stored: StoredAsset = {
    ...meta,
    data: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
  };
  const storage = await getStorage();
  await storage.set(key, stored);
  return meta;
}

export async function readUploadAsset(
  key: string,
): Promise<{bytes: ArrayBuffer; mime: string} | null> {
  const k = String(key || "").trim();
  if (!k) return null;
  try {
    const storage = await getStorage();
    const row = await storage.get(k);
    if (!row?.data) return null;
    return {bytes: row.data, mime: row.mime || "image/png"};
  } catch {
    return null;
  }
}

export async function listUploadAssets(): Promise<UploadAssetMeta[]> {
  try {
    const storage = await getStorage();
    const keys = await storage.keys();
    const out: UploadAssetMeta[] = [];
    for (const k of keys) {
      const row = await storage.get(k);
      if (!row) continue;
      out.push({
        key: row.key,
        name: row.name,
        mime: row.mime,
        bytes: row.bytes,
        w: row.w,
        h: row.h,
        createdAt: row.createdAt,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  } catch {
    return [];
  }
}

export async function deleteUploadAsset(key: string): Promise<void> {
  const k = String(key || "").trim();
  if (!k) return;
  const url = previewUrlCache.get(k);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrlCache.delete(k);
  }
  try {
    const storage = await getStorage();
    await storage.delete(k);
  } catch {
    /* ignore */
  }
}

export async function uploadAssetPreviewUrl(
  key: string,
): Promise<string | null> {
  const k = String(key || "").trim();
  if (!k) return null;
  const cached = previewUrlCache.get(k);
  if (cached) return cached;
  const got = await readUploadAsset(k);
  if (!got) return null;
  const blob = new Blob([got.bytes], {type: got.mime || "image/png"});
  const url = URL.createObjectURL(blob);
  previewUrlCache.set(k, url);
  return url;
}

export async function purgeUploadAssets(
  olderThanDays = 7,
): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86400_000;
  let n = 0;
  try {
    const storage = await getStorage();
    for (const k of await storage.keys()) {
      const row = await storage.get(k);
      if (row && row.createdAt < cutoff) {
        await storage.delete(k);
        const url = previewUrlCache.get(k);
        if (url) {
          URL.revokeObjectURL(url);
          previewUrlCache.delete(k);
        }
        n += 1;
      }
    }
  } catch {
    /* ignore */
  }
  return n;
}
