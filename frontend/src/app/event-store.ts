import { Injectable, effect, inject, signal } from '@angular/core';
import { Auth } from './auth';
import { MagnetEvent, createEvent } from './models';
import { PhotoStore } from './photo-store';

const PREFIX = 'om-magnet.events.v1';

function read(key: string): MagnetEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const photoIds = (events: MagnetEvent[]) =>
  events.flatMap((e) => e.slots.map((s) => s.photo)).filter((p): p is string => !!p);

/** Photo ids used by anyone who has signed in on this browser, so one user's cleanup never deletes another's photos. */
function allUsedPhotoIds(): Set<string> {
  const used = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) photoIds(read(k)).forEach((id) => used.add(id));
  }
  return used;
}

/** Events are kept per signed-in user, so people sharing a browser do not see each other's work. */
@Injectable({ providedIn: 'root' })
export class EventStore {
  private photos = inject(PhotoStore);
  private key = `${PREFIX}.${inject(Auth).user()?.id ?? 'anonymous'}`;
  readonly events = signal<MagnetEvent[]>(read(this.key));

  constructor() {
    effect(() => {
      const data = JSON.stringify(this.events());
      try {
        localStorage.setItem(this.key, data);
      } catch {
        /* storage full or blocked */
      }
    });
    // drop photos that no event references any more
    this.photos
      .keys()
      .then((keys) => {
        const used = allUsedPhotoIds();
        return this.photos.remove(keys.filter((k) => !used.has(k)));
      })
      .catch(() => undefined);
  }

  add(name: string): MagnetEvent {
    const e = createEvent(name);
    this.events.update((l) => [e, ...l]);
    return e;
  }

  update(id: string, fn: (e: MagnetEvent) => MagnetEvent): void {
    this.events.update((l) => l.map((e) => (e.id === id ? { ...fn(e), lastUsed: Date.now() } : e)));
  }

  async remove(id: string): Promise<void> {
    const gone = this.events().find((e) => e.id === id);
    this.events.update((l) => l.filter((e) => e.id !== id));
    if (gone) {
      const still = allUsedPhotoIds();
      this.events().forEach((e) => photoIds([e]).forEach((p) => still.add(p)));
      await this.photos.remove(photoIds([gone]).filter((p) => !still.has(p)));
    }
  }
}
