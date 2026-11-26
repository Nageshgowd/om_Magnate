import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EventStore } from './event-store';

@Component({
  selector: 'app-new-event',
  imports: [RouterLink],
  template: `
    <a class="back muted" routerLink="/">← My Events</a>
    <form class="card" (submit)="create($event)">
      <h2>New Event</h2>
      <p class="muted">Give your event a name. You will set up the product, paper and photos inside it.</p>
      <div class="row">
        <label for="name">Event name <span class="req">*</span></label>
        <span class="muted count">{{ name().length }}/32</span>
      </div>
      <input
        id="name"
        type="text"
        maxlength="32"
        placeholder="e.g. Priya's Birthday"
        autofocus
        [value]="name()"
        (input)="name.set(box.value)"
        #box
      />
      <button class="btn btn-primary go" type="submit" [disabled]="!name().trim()">Create Event →</button>
    </form>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 560px;
        margin: 0 auto;
      }
      .back {
        display: inline-block;
        margin: 4px 0 14px;
        text-decoration: none;
        font-weight: 600;
      }
      h2 {
        font-size: 1.8rem;
        margin-bottom: 8px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .req {
        color: var(--brand);
      }
      .go {
        width: 100%;
        margin-top: 20px;
      }
    `
  ]
})
export class NewEvent {
  private store = inject(EventStore);
  private router = inject(Router);
  readonly name = signal('');

  create(e: Event) {
    e.preventDefault();
    const name = this.name().trim();
    if (!name) return;
    const ev = this.store.add(name);
    this.router.navigate(['/events', ev.id]);
  }
}
