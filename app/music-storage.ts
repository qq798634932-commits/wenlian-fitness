export type StoredAudioTrack = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  addedAt: string;
};

const DATABASE_NAME = "wenlian-audio-v1";
const STORE_NAME = "tracks";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地音频数据库"));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地音频保存失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地音频保存已取消"));
  });
}

export async function listStoredAudioTracks() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const tracks = await new Promise<StoredAudioTrack[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredAudioTrack[]);
      request.onerror = () => reject(request.error ?? new Error("本地音频读取失败"));
    });
    return tracks.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  } finally {
    database.close();
  }
}

export async function saveAudioFiles(files: File[]) {
  const tracks: StoredAudioTrack[] = files.map((file, index) => ({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`,
    name: file.name.replace(/\.[^.]+$/, "") || file.name,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    blob: file,
    addedAt: new Date().toISOString(),
  }));
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    tracks.forEach((track) => store.put(track));
    await waitForTransaction(transaction);
    return tracks;
  } finally {
    database.close();
  }
}

export async function removeStoredAudioTrack(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
