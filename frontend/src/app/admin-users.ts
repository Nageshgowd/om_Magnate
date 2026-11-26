import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Activity, EventStat } from './activity';
import { Auth, User, errorText } from './auth';

type Role = 'admin' | 'user';

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe],
  template: `
    <h1>Users</h1>
    <p class="muted sub">Create accounts, edit their details, and see how much each person has downloaded and printed.</p>

    <form class="card" (submit)="create($event)">
      <h3>Create a user</h3>
      <div class="grid">
        <div>
          <label for="fn">Full name</label>
          <input id="fn" type="text" maxlength="60" placeholder="e.g. Priya Sharma" [value]="name()" (input)="name.set(fn.value)" #fn />
        </div>
        <div>
          <label for="un">Username or email</label>
          <input id="un" type="text" maxlength="64" placeholder="e.g. priya or priya@example.com" autocapitalize="none" spellcheck="false" [value]="username()" (input)="username.set(un.value)" #un />
        </div>
        <div>
          <label for="pw">Temporary password</label>
          <div class="pwrow">
            <input id="pw" type="text" autocomplete="off" placeholder="8+ characters" [value]="password()" (input)="password.set(pw.value)" #pw />
            <button type="button" class="btn btn-soft" (click)="generate()">Generate</button>
          </div>
        </div>
        <div>
          <label for="rl">Role</label>
          <select id="rl" #rl (change)="role.set($any(rl.value))">
            <option value="user" [selected]="role() === 'user'">User</option>
            <option value="admin" [selected]="role() === 'admin'">Administrator</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary create" type="submit" [disabled]="busy() || !name().trim() || !username().trim() || password().length < 8">
        Create user
      </button>
      @if (created(); as c) {
        <p class="note ok" role="status">
          {{ c.reset ? 'Password updated for' : 'Created' }} <b>{{ c.username }}</b>. Share these details with them — the password is not shown again:
          <code>{{ c.username }} / {{ c.password }}</code>
        </p>
      }
    </form>

    @if (error()) {
      <p class="note err" role="alert">{{ error() }}</p>
    }

    <div class="listhead">
      <h3>All users <span class="count">{{ users().length }}</span></h3>
      <input type="text" class="search" placeholder="Search by name or username" aria-label="Search users" [value]="search()" (input)="search.set(sq.value)" #sq />
    </div>

    <section class="list">
      @for (u of filtered(); track u.id) {
        <article class="card row" [class.off]="!u.active">
          <div class="who">
            <h3>{{ u.name }}</h3>
            <p class="muted small">
              {{ u.username }} · created {{ u.createdAt | date: 'dd MMM yyyy' }} ·
              {{ u.lastLoginAt ? 'last sign-in ' + (u.lastLoginAt | date: 'dd MMM yyyy, HH:mm') : 'never signed in' }}
            </p>
            <p>
              <span class="tag" [class.admin]="u.role === 'admin'">{{ u.role === 'admin' ? 'Administrator' : 'User' }}</span>
              <span class="tag" [class.bad]="!u.active">{{ u.active ? 'Active' : 'Disabled' }}</span>
              @if (u.id === me()?.id) {
                <span class="tag">You</span>
              }
            </p>
            <p class="usage">
              <b>{{ u.stats?.downloads ?? 0 }}</b> downloaded · <b>{{ u.stats?.prints ?? 0 }}</b> printed ·
              <b>{{ u.stats?.events ?? 0 }}</b> event{{ u.stats?.events === 1 ? '' : 's' }} used
              @if (u.stats?.events) {
                <button type="button" class="link" (click)="toggleActivity(u)">
                  {{ openId() === u.id ? 'Hide details' : 'Show by event' }}
                </button>
              }
            </p>
            @if (openId() === u.id) {
              <table class="act">
                <thead><tr><th>Event</th><th>Downloaded</th><th>Printed</th><th>Last used</th></tr></thead>
                <tbody>
                  @for (e of openEvents(); track e.eventId) {
                    <tr>
                      <td>{{ e.eventName }}</td>
                      <td>{{ e.downloads }}</td>
                      <td>{{ e.prints }}</td>
                      <td>{{ e.lastActivityAt | date: 'dd MMM yyyy, HH:mm' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }

            @if (editingId() === u.id) {
              <form class="panel" (submit)="saveEdit($event, u)">
                <h4>Edit user</h4>
                <div class="grid">
                  <div>
                    <label for="en-{{ u.id }}">Full name</label>
                    <input id="en-{{ u.id }}" type="text" maxlength="60" [value]="editName()" (input)="editName.set(en.value)" #en />
                  </div>
                  <div>
                    <label for="eu-{{ u.id }}">Username or email</label>
                    <input id="eu-{{ u.id }}" type="text" maxlength="64" autocapitalize="none" spellcheck="false" [value]="editUsername()" (input)="editUsername.set(eu.value)" #eu />
                  </div>
                  <div>
                    <label for="er-{{ u.id }}">Role</label>
                    <select id="er-{{ u.id }}" [disabled]="u.id === me()?.id" #er (change)="editRole.set($any(er.value))">
                      <option value="user" [selected]="editRole() === 'user'">User</option>
                      <option value="admin" [selected]="editRole() === 'admin'">Administrator</option>
                    </select>
                  </div>
                  <div>
                    <label for="es-{{ u.id }}">Status</label>
                    <select id="es-{{ u.id }}" [disabled]="u.id === me()?.id" #es (change)="editActive.set(es.value === 'active')">
                      <option value="active" [selected]="editActive()">Active</option>
                      <option value="disabled" [selected]="!editActive()">Disabled (cannot sign in)</option>
                    </select>
                  </div>
                </div>
                @if (u.id === me()?.id) {
                  <p class="muted small">You cannot change your own role or disable yourself.</p>
                }
                <div class="panelacts">
                  <button type="submit" class="btn btn-primary" [disabled]="busy() || !editName().trim() || !editUsername().trim()">Save changes</button>
                  <button type="button" class="btn btn-soft" (click)="editingId.set(null)">Cancel</button>
                </div>
              </form>
            }

            @if (resetting() === u.id) {
              <div class="pwrow reset">
                <input type="text" autocomplete="off" placeholder="New password (8+ characters)" [value]="newPassword()" (input)="newPassword.set(rp.value)" #rp />
                <button type="button" class="btn btn-primary" (click)="resetPassword(u)" [disabled]="newPassword().length < 8 || busy()">Save</button>
                <button type="button" class="btn btn-soft" (click)="resetting.set(null)">Cancel</button>
              </div>
            }
          </div>
          <div class="acts">
            <button type="button" class="btn btn-soft" (click)="startEdit(u)">Edit</button>
            <button type="button" class="btn btn-soft" (click)="resetting.set(u.id); editingId.set(null); newPassword.set('')">Reset password</button>
            @if (u.id !== me()?.id) {
              <button type="button" class="btn danger" (click)="remove(u)">Delete</button>
            }
          </div>
        </article>
      } @empty {
        @if (!loading()) {
          <p class="muted">{{ search() ? 'No users match your search.' : 'No users yet.' }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1040px;
        margin: 0 auto;
      }
      h1 {
        font-size: 2rem;
      }
      .sub {
        margin: 6px 0 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 16px;
      }
      @media (max-width: 640px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
      .pwrow {
        display: flex;
        gap: 8px;
      }
      .pwrow input {
        flex: 1;
        min-width: 0;
      }
      .create {
        margin-top: 18px;
      }
      .note {
        margin: 16px 0 0;
        padding: 10px 14px;
        border-radius: 12px;
        font-weight: 500;
      }
      .note.ok {
        background: #e6f6ec;
        color: #17653a;
      }
      .note.err {
        background: #fdecea;
        color: #a3271b;
        font-weight: 600;
      }
      code {
        display: inline-block;
        background: #fff;
        border-radius: 8px;
        padding: 2px 8px;
        user-select: all;
      }
      .listhead {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 26px 0 12px;
      }
      .count {
        display: inline-block;
        background: var(--brand-soft);
        color: var(--brand-dark);
        font-size: 0.85rem;
        padding: 2px 10px;
        border-radius: 999px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .search {
        max-width: 300px;
      }
      .list {
        display: grid;
        gap: 12px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 20px;
        justify-content: space-between;
      }
      .row.off {
        opacity: 0.8;
      }
      .who {
        flex: 1;
        min-width: 260px;
      }
      .small {
        font-size: 0.88rem;
        margin: 2px 0 8px;
      }
      .tag {
        display: inline-block;
        font-size: 0.78rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        background: #eef1f7;
        color: var(--muted);
        margin-right: 6px;
      }
      .tag.admin {
        background: var(--brand-soft);
        color: var(--brand-dark);
      }
      .tag.bad {
        background: #fdecea;
        color: #a3271b;
      }
      .acts {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: flex-start;
      }
      .acts .btn {
        padding: 8px 14px;
        font-size: 0.88rem;
      }
      .danger {
        background: #fdecea;
        color: #a3271b;
      }
      .reset {
        margin-top: 12px;
      }
      .panel {
        margin-top: 14px;
        padding: 4px 16px 16px;
        background: #f6f8fc;
        border: 1px solid var(--line);
        border-radius: 14px;
      }
      .panel h4 {
        margin: 14px 0 0;
      }
      .panelacts {
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }
      .usage {
        color: var(--muted);
        font-size: 0.9rem;
        margin-top: 8px;
      }
      .usage b {
        color: var(--ink);
      }
      .link {
        font: inherit;
        font-weight: 600;
        color: var(--brand-dark);
        background: none;
        border: 0;
        cursor: pointer;
        padding: 0 0 0 8px;
      }
      .act {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 0.9rem;
      }
      .act th,
      .act td {
        text-align: left;
        padding: 6px 6px;
        border-bottom: 1px solid var(--line);
      }
      .act th {
        color: var(--muted);
        font-size: 0.8rem;
      }
    `
  ]
})
export class AdminUsers {
  private http = inject(HttpClient);
  private activity = inject(Activity);
  readonly me = inject(Auth).user;

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly created = signal<{ username: string; password: string; reset: boolean } | null>(null);
  readonly search = signal('');

  // create form
  readonly name = signal('');
  readonly username = signal('');
  readonly password = signal('');
  readonly role = signal<Role>('user');

  // edit panel
  readonly editingId = signal<string | null>(null);
  readonly editName = signal('');
  readonly editUsername = signal('');
  readonly editRole = signal<Role>('user');
  readonly editActive = signal(true);

  // reset password
  readonly resetting = signal<string | null>(null);
  readonly newPassword = signal('');

  // per-event details
  readonly openId = signal<string | null>(null);
  readonly openEvents = signal<EventStat[]>([]);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q
      ? this.users().filter((u) => u.name.toLowerCase().includes(q) || u.username.includes(q))
      : this.users();
  });

  constructor() {
    this.load();
  }

  async load() {
    try {
      this.users.set((await firstValueFrom(this.http.get<{ users: User[] }>('/api/admin/users'))).users);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }

  generate() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    this.password.set(Array.from(bytes, (b) => chars[b % chars.length]).join(''));
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  create(e: Event) {
    e.preventDefault();
    return this.run(async () => {
      const body = {
        name: this.name().trim(),
        username: this.username().trim(),
        password: this.password(),
        role: this.role()
      };
      const r = await firstValueFrom(this.http.post<{ user: User }>('/api/admin/users', body));
      this.users.update((l) => [{ ...r.user, stats: { downloads: 0, prints: 0, events: 0 } }, ...l]);
      this.created.set({ username: r.user.username, password: body.password, reset: false });
      this.name.set('');
      this.username.set('');
      this.password.set('');
      this.role.set('user');
    });
  }

  private patch(u: User, body: Record<string, unknown>) {
    return this.run(async () => {
      const r = await firstValueFrom(this.http.patch<{ user: User }>(`/api/admin/users/${u.id}`, body));
      // the API does not resend the usage counts, so keep the ones we have
      this.users.update((l) => l.map((x) => (x.id === u.id ? { ...x, ...r.user, stats: x.stats } : x)));
    });
  }

  startEdit(u: User) {
    this.resetting.set(null);
    this.editingId.set(u.id);
    this.editName.set(u.name);
    this.editUsername.set(u.username);
    this.editRole.set(u.role);
    this.editActive.set(u.active);
  }

  async saveEdit(e: Event, u: User) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (this.editName().trim() !== u.name) body['name'] = this.editName().trim();
    const username = this.editUsername().trim().toLowerCase();
    if (username !== u.username) body['username'] = username;
    if (this.editRole() !== u.role) body['role'] = this.editRole();
    if (this.editActive() !== u.active) body['active'] = this.editActive();
    if (!Object.keys(body).length) {
      this.editingId.set(null);
      return;
    }
    await this.patch(u, body);
    if (!this.error()) this.editingId.set(null);
  }

  async resetPassword(u: User) {
    const password = this.newPassword();
    await this.patch(u, { password });
    if (!this.error()) {
      this.created.set({ username: u.username, password, reset: true });
      this.resetting.set(null);
      this.newPassword.set('');
    }
  }

  remove(u: User) {
    if (!confirm(`Delete ${u.name} (${u.username})? They will no longer be able to sign in, and their download/print counts are removed too.`)) return;
    return this.run(async () => {
      await firstValueFrom(this.http.delete(`/api/admin/users/${u.id}`));
      this.users.update((l) => l.filter((x) => x.id !== u.id));
      if (this.editingId() === u.id) this.editingId.set(null);
    });
  }

  async toggleActivity(u: User) {
    if (this.openId() === u.id) {
      this.openId.set(null);
      return;
    }
    this.openEvents.set([]);
    this.openId.set(u.id);
    try {
      this.openEvents.set((await this.activity.forUser(u.id)).events);
    } catch (e) {
      this.error.set(errorText(e));
    }
  }
}
