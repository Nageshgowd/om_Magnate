import { Injectable } from '@angular/core';

async function downscale(file: Blob, max = 2400): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode photo'))), 'image/jpeg', 0.9)
  );
}

/** Photos live in IndexedDB (too big for localStorage); events only keep the ids. */
@Injectable({ providedIn: 'root' })
export class PhotoStore {
  private _db?: Promise<IDBDatabase>;
  private imgs = new Map<string, HTMLImageElement>();

  private db(): Promise<IDBDatabase> {
    return (this._db ??= new Promise<IDBDatabase>((resolve, reject) => {
      // if the browser never answers, fail with a message instead of leaving the UI stuck
      const timer = setTimeout(() => {
        this._db = undefined;
        reject(new Error('Browser storage is not responding. Reload the page and try again.'));
      }, 8000);
      const r = indexedDB.open('om-magnet', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => {
        clearTimeout(timer);
        resolve(r.result);
      };
      r.onerror = () => {
        clearTimeout(timer);
        this._db = undefined;
        reject(r.error);
      };
    }));
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise<T>((res, rej) => {
      const tx = db.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => res(req.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  async add(file: Blob): Promise<string> {
    const blob = await downscale(file);
    const id = crypto.randomUUID();
    await this.run('readwrite', (s) => s.put(blob, id));
    await this.image(id);
    return id;
  }

  async image(id: string): Promise<HTMLImageElement | null> {
    const hit = this.imgs.get(id);
    if (hit) return hit;
    const blob = await this.run<Blob | undefined>('readonly', (s) => s.get(id));
    if (!blob) return null;
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    this.imgs.set(id, img);
    return img;
  }

  getImage(id: string): HTMLImageElement | undefined {
    return this.imgs.get(id);
  }

  async preload(ids: (string | null)[]): Promise<void> {
    await Promise.all(
      [...new Set(ids)].filter((i): i is string => !!i).map((i) => this.image(i).catch(() => null))
    );
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.imgs.delete(id);
      await this.run('readwrite', (s) => s.delete(id)).catch(() => undefined);
    }
  }

  async keys(): Promise<string[]> {
    const k = await this.run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return k.map(String);
  }
}
