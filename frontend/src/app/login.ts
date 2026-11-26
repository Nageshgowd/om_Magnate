import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, errorText } from './auth';
import { SUPPORT_EMAIL } from './config';

@Component({
  selector: 'app-login',
  template: `
    <form class="card box" (submit)="submit($event)">
      <h1>Sign in</h1>
      <p class="muted">Welcome back. Sign in with the account your admin gave you.</p>

      @if (notice(); as n) {
        <p class="notice" role="status">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#8a4b12" />
            <path d="M12 6.5V12l3.5 2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
          </svg>
          <span>{{ n }}</span>
        </p>
      }

      <label for="u">Email or username</label>
      <div class="field">
        <svg class="lead" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="m4 8 8 5.5L20 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <input id="u" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" autofocus
               [value]="username()" (input)="username.set(u.value)" #u />
      </div>

      <label for="p">Password</label>
      <div class="field">
        <svg class="lead" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        </svg>
        <input id="p" [type]="show() ? 'text' : 'password'" autocomplete="current-password"
               [value]="password()" (input)="password.set(p.value)" #p />
        <button type="button" class="eye" (click)="show.set(!show())"
                [attr.aria-label]="show() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="show()">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8" />
            @if (show()) {
              <path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            }
          </svg>
        </button>
      </div>

      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }

      <button class="btn btn-primary go" type="submit" [disabled]="busy() || !username().trim() || !password()">
        @if (busy()) {
          <span class="spin" aria-hidden="true"></span> Signing in…
        } @else {
          Sign in
        }
      </button>

      <p class="support">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <rect x="3" y="13" width="4" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <rect x="17" y="13" width="4" height="6" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M19 19c0 1.5-2 2.5-5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>
          Forgot your password or need an account? Write to
          <a [href]="'mailto:' + support + '?subject=Om-Magnet%20account%20help'">{{ support }}</a>
        </span>
      </p>
    </form>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 440px;
        margin: 40px auto 0;
      }
      h1 {
        font-size: 2rem;
        margin-bottom: 6px;
      }
      .notice {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        background: #fff8e1;
        border: 1px solid #f7e3a1;
        color: #7a3f10;
        padding: 14px 16px;
        border-radius: 14px;
        margin-top: 18px;
        line-height: 1.4;
      }
      .notice svg {
        flex: none;
        margin-top: 1px;
      }
      .field {
        position: relative;
      }
      .field .lead {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: #7a86a3;
        pointer-events: none;
      }
      .field input {
        padding-left: 46px;
        padding-right: 46px;
      }
      .eye {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        border: 0;
        background: none;
        color: #7a86a3;
        cursor: pointer;
        padding: 8px;
        border-radius: 10px;
        display: grid;
        place-items: center;
      }
      .eye:hover {
        background: #eef1f7;
        color: var(--ink);
      }
      .err {
        background: #fdecea;
        color: #a3271b;
        font-weight: 600;
        padding: 10px 14px;
        border-radius: 12px;
        margin-top: 16px;
      }
      .go {
        width: 100%;
        margin-top: 20px;
        padding: 15px 18px;
      }
      .spin {
        width: 18px;
        height: 18px;
        border: 2.5px solid rgba(255, 255, 255, 0.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .support {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        background: #f1f4fa;
        color: var(--muted);
        border-radius: 14px;
        padding: 14px 16px;
        margin-top: 18px;
        line-height: 1.45;
      }
      .support svg {
        flex: none;
        margin-top: 1px;
        color: var(--brand);
      }
      .support a {
        color: var(--brand-dark);
        font-weight: 600;
        word-break: break-all;
      }
    `
  ]
})
export class Login {
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly support = SUPPORT_EMAIL;
  readonly username = signal('');
  readonly password = signal('');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly notice = signal(
    ({
      idle: 'You were signed out because you were not active for a while. Please sign in again.',
      expired: 'Your session ended. Please sign in again.'
    } as Record<string, string>)[this.route.snapshot.queryParamMap.get('reason') ?? ''] ?? ''
  );

  async submit(e: Event) {
    e.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username().trim(), this.password());
      const next = this.route.snapshot.queryParamMap.get('next') ?? '/';
      // only follow in-app paths
      await this.router.navigateByUrl(next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      this.error.set(errorText(err));
      this.password.set('');
    } finally {
      this.busy.set(false);
    }
  }
}
