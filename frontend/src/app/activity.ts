import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface EventStat {
  eventId: string;
  eventName: string;
  downloads: number;
  prints: number;
  lastActivityAt: string;
}

/** Download and print counts are stored on the server per user and per event. */
@Injectable({ providedIn: 'root' })
export class Activity {
  private http = inject(HttpClient);

  /** Resolves true when the server saved the count. */
  record(event: { id: string; name: string }, type: 'download' | 'print'): Promise<boolean> {
    return firstValueFrom(this.http.post('/api/activity', { eventId: event.id, eventName: event.name, type }))
      .then(() => true)
      .catch(() => false);
  }

  mine() {
    return firstValueFrom(
      this.http.get<{ events: EventStat[]; totals: { downloads: number; prints: number } }>('/api/activity/me')
    );
  }

  forUser(userId: string) {
    return firstValueFrom(this.http.get<{ events: EventStat[] }>(`/api/admin/users/${userId}/activity`));
  }
}
