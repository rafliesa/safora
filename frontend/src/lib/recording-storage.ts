import type { Recording } from './workforce';

const KEY = 'raise-recording-library-v2';
const LEGACY_KEY = 'healy-recording-library-v2';
// Keep the existing video database so the rename does not orphan saved files.
const DB_NAME = 'healy-video-library';

export function readLocalRecordings(): Recording[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) || window.localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is Recording => item && typeof item.id === 'string' && typeof item.camera_id === 'string' && Array.isArray(item.labels)) : [];
  } catch { return []; }
}

export function writeLocalRecordings(recordings: Recording[]): void {
  const metadata = recordings.map(({ playback_url: _url, ...recording }) => recording);
  window.localStorage.setItem(KEY, JSON.stringify(metadata));
}

async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('Local video storage is unavailable in this browser. Use a browser that supports IndexedDB.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('videos')) request.result.createObjectStore('videos'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local video storage could not be opened.'));
  });
}

export async function storeVideo(id: string, file: File): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('videos', 'readwrite');
      transaction.objectStore('videos').put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('The video could not be saved. Check available browser storage.'));
      transaction.onabort = () => reject(new Error('Video storage was cancelled.'));
    });
  } finally { db.close(); }
}

export async function readVideo(id: string): Promise<Blob | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('videos', 'readonly').objectStore('videos').get(id);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(new Error('The local recording could not be read.'));
    });
  } finally { db.close(); }
}
