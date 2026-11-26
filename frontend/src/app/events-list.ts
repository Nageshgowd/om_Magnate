import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventStore } from './event-store';
import { computeLayout, findPaper, findTemplate, specText } from './layout';
import { MagnetEvent } from './models';

type Sort = 'new' | 'old' | 'used' | 'name';

@Component({
  selector: 'app-events-list',
  imports: [RouterLink, DatePipe],
  template: `
    <h1>My Events</h1>
    <p class="muted sub">See how many sheets were downloaded and printed for every event.</p>
    <a class="btn btn-primary" routerLink="/events/new">+ New Event</a>

    <div class="tools">
      <input
        type="text"
        placeholder="Search events..."
        aria-label="Search events"
        [value]="query()"
        (input)="query.set(q.value)"
        #q
      />
      <select aria-label="Sort events" (change)="sort.set($any(s.value))" #s>
        <option value="new" [selected]="sort() === 'new'">Newest first</option>
        <option value="old" [selected]="sort() === 'old'">Oldest first</option>
        <option value="used" [selected]="sort() === 'used'">Recently used</option>
        <option value="name" [selected]="sort() === 'name'">Name A–Z</option>
      </select>
    </div>

    @for (e of list(); track e.id) {
      <article class="card item">
        <a class="open" [routerLink]="['/events', e.id]">
          <h3>{{ e.name }}</h3>
          <p class="muted small">
            Created {{ e.createdAt | date: 'dd MMM yyyy' }} · last used {{ e.lastUsed | date: 'dd MMM yyyy' }}
          </p>
          <span class="spec">{{ spec(e) }}</span>
          <p class="stats">
            <span><b>{{ e.downloads }}</b> downloaded</span>
            <span><b>{{ e.prints }}</b> printed</span>
          </p>
        </a>
        <button class="del" type="button" (click)="remove(e)" [attr.aria-label]="'Delete ' + e.name">🗑</button>
      </article>
    } @empty {
      <div class="card empty">
        @if (store.events().length === 0) {
          <h3>No events yet</h3>
          <p class="muted">Create your first event to start building a magnet sheet.</p>
        } @else {
          <p class="muted">No events match “{{ query() }}”.</p>
        }
      </div>
    }
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
        margin: 6px 0 16px;
      }
      .tools {
        display: grid;
        grid-template-columns: 1fr 180px;
        gap: 12px;
        margin: 20px 0;
      }
      .item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }
      .open {
        flex: 1;
        text-decoration: none;
        color: inherit;
        display: block;
      }
      .small {
        font-size: 0.9rem;
        margin: 4px 0 10px;
      }
      .spec {
        display: inline-block;
        background: var(--brand-soft);
        color: var(--brand-dark);
        font-weight: 600;
        font-size: 0.88rem;
        padding: 6px 12px;
        border-radius: 999px;
      }
      .stats {
        display: flex;
        gap: 20px;
        margin-top: 12px;
        color: var(--muted);
      }
      .stats b {
        color: var(--ink);
        font-size: 1.1rem;
      }
      .del {
        border: 0;
        background: none;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
      }
      .del:hover {
        background: #fde8e6;
      }
      .empty {
        text-align: center;
        padding: 40px 20px;
      }
    `
  ]
})
export class EventsList {
  readonly store = inject(EventStore);
  readonly query = signal('');
  readonly sort = signal<Sort>('new');

  readonly list = computed(() => {
    const q = this.query().trim().toLowerCase();
    const l = this.store.events().filter((e) => e.name.toLowerCase().includes(q));
    const by: Record<Sort, (a: MagnetEvent, b: MagnetEvent) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      old: (a, b) => a.createdAt - b.createdAt,
      used: (a, b) => b.lastUsed - a.lastUsed,
      name: (a, b) => a.name.localeCompare(b.name)
    };
    return [...l].sort(by[this.sort()]);
  });

  spec(e: MagnetEvent): string {
    if (!e.setup) return 'Setup not finished';
    const t = findTemplate(e.setup.templateId);
    return specText(t, computeLayout(t, findPaper(e.setup.paperId)));
  }

  async remove(e: MagnetEvent) {
    if (confirm(`Delete “${e.name}” and its photos? This cannot be undone.`)) {
      await this.store.remove(e.id);
    }
  }
}
