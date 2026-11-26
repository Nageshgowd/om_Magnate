import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Activity, EventStat } from './activity';
import { Auth, errorText } from './auth';

@Component({
  selector: 'app-account',
  template: `
    @if (auth.user(); as u) {
      <section class="card">
        <h2>My account</h2>
        <p class="muted">{{ u.name }} · {{ u.username }} · {{ u.role === 'admin' ? 'Administrator' : 'User' }}</p>
      </section>

      <section class="card">
        <h3>My activity</h3>
        <p class="muted">
          <b>{{ totals().downloads }}</b> downloaded · <b>{{ totals().prints }}</b> printed
        </p>
        @if (events().length) {
          <table>
            <thead><tr><th>Event</th><th>Downloaded</th><th>Printed</th></tr></thead>
            <tbody>
              @for (e of events(); track e.eventId) {
                <tr><td>{{ e.eventName }}</td><td>{{ e.downloads }}</td><td>{{ e.prints }}</td></tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="muted hint">Nothing yet. Downloads and prints you make are counted here.</p>
        }
      </section>

      <form class="card" (submit)="save($event)">
        <h3>Change password</h3>
        <label for="cur">Current password</label>
        <input id="cur" type="password" autocomplete="current-password" [value]="current()" (input)="current.set(c.value)" #c />
        <label for="new">New password (8+ characters)</label>
        <input id="new" type="password" autocomplete="new-password" [value]="next()" (input)="next.set(n.value)" #n />
        <label for="rep">Repeat new password</label>
        <input id="rep" type="password" autocomplete="new-password" [value]="repeat()" (input)="repeat.set(r.value)" #r />

        @if (error()) {
          <p class="note err" role="alert">{{ error() }}</p>
        }
        @if (done()) {
          <p class="note ok" role="status">Password changed. Other devices were signed out.</p>
        }
        <button class="btn btn-primary go" type="submit" [disabled]="busy() || !current() || next().length < 8">
          Update password
        </button>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: grid;
        gap: 16px;
        max-width: 520px;
        margin: 0 auto;
      }
      h2 {
        font-size: 1.6rem;
        margin-bottom: 4px;
      }
      .note {
        margin-top: 16px;
        padding: 10px 14px;
        border-radius: 12px;
        font-weight: 600;
      }
      .err {
        background: #fdecea;
        color: #a3271b;
      }
      .ok {
        background: #e6f6ec;
        color: #17653a;
      }
      .go {
        margin-top: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th,
      td {
        text-align: left;
        padding: 8px 6px;
        border-bottom: 1px solid var(--line);
      }
      th {
        color: var(--muted);
        font-size: 0.82rem;
      }
      .hint {
        margin-top: 8px;
      }
    `
  ]
})
export class Account {
  readonly auth = inject(Auth);
  private http = inject(HttpClient);
  private activity = inject(Activity);

  readonly events = signal<EventStat[]>([]);
  readonly totals = signal({ downloads: 0, prints: 0 });

  constructor() {
    this.activity
      .mine()
      .then((r) => {
        this.events.set(r.events);
        this.totals.set(r.totals);
      })
      .catch(() => undefined);
  }

  readonly current = signal('');
  readonly next = signal('');
  readonly repeat = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);

  async save(e: Event) {
    e.preventDefault();
    this.error.set('');
    this.done.set(false);
    if (this.next() !== this.repeat()) {
      this.error.set('The new passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post('/api/auth/change-password', { currentPassword: this.current(), newPassword: this.next() })
      );
      this.current.set('');
      this.next.set('');
      this.repeat.set('');
      this.done.set(true);
    } catch (err) {
      this.error.set(errorText(err));
    } finally {
      this.busy.set(false);
    }
  }
}
