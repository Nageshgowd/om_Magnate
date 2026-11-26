import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { IDLE_MINUTES } from './config';

const LAST_ACTIVE_KEY = 'om-magnet.lastActive';

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** only sent to admins, on the Users page */
  stats?: { downloads: number; prints: number; events: number };
}

/** Turns an HTTP failure into a message a person can read. */
export function errorText(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (typeof e.error?.error === 'string') return e.error.error;
    if (e.status === 0) return 'Cannot reach the server. Check that the API is running.';
  }
  return 'Something went wrong. Please try again.';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  private idleTimer?: ReturnType<typeof setInterval>;

  /** Runs once before the app starts, so guards know who is signed in. */
  async init(): Promise<void> {
    try {
      this.user.set((await firstValueFrom(this.http.get<{ user: User }>('/api/auth/me'))).user);
    } catch {
      this.user.set(null);
      return;
    }
    if (this.idleExpired()) {
      await this.logout('idle'); // came back after being away longer than the limit
      return;
    }
    this.watchIdle();
  }

  async login(username: string, password: string): Promise<void> {
    const r = await firstValueFrom(this.http.post<{ user: User }>('/api/auth/login', { username, password }));
    this.user.set(r.user);
    this.touch();
    this.watchIdle();
  }

  async logout(reason?: 'idle' | 'expired'): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {})).catch(() => undefined);
    // full reload so no data from this user stays in memory
    window.location.assign(reason ? `/login?reason=${reason}` : '/login');
  }

  // ---- inactivity sign-out (the timestamp is shared by all open tabs)
  private lastActive(): number | null {
    try {
      const v = Number(localStorage.getItem(LAST_ACTIVE_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  private touch(): void {
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    } catch {
      /* storage blocked */
    }
  }

  private idleExpired(): boolean {
    const last = this.lastActive();
    return last !== null && Date.now() - last > IDLE_MINUTES * 60_000;
  }

  private watchIdle(): void {
    if (this.idleTimer) return;
    this.touch();
    let lastTouch = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch > 5000) {
        lastTouch = now;
        this.touch();
      }
    };
    for (const ev of ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    // an interval (not one long timeout) so it still fires correctly after the laptop sleeps
    this.idleTimer = setInterval(() => {
      if (this.idleExpired()) {
        clearInterval(this.idleTimer);
        void this.logout('idle');
      }
    }, 30_000);
  }
}

export const authGuard: CanActivateFn = (_route, state) =>
  inject(Auth).user()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: state.url === '/' ? {} : { next: state.url } });

export const adminGuard: CanActivateFn = () => (inject(Auth).isAdmin() ? true : inject(Router).createUrlTree(['/']));

export const guestGuard: CanActivateFn = () => (inject(Auth).user() ? inject(Router).createUrlTree(['/']) : true);

/** If the session ends while the app is open (expired, disabled by an admin), go back to the login page. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  return next(req).pipe(
    catchError((e: unknown) => {
      const url = req.url;
      if (
        e instanceof HttpErrorResponse &&
        e.status === 401 &&
        auth.user() &&
        !url.endsWith('/auth/login') &&
        !url.endsWith('/auth/me')
      ) {
        auth.user.set(null);
        window.location.assign('/login?reason=expired');
      }
      return throwError(() => e);
    })
  );
};
