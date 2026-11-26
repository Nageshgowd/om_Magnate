import { Component, ElementRef, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { MagnetEvent } from './models';
import { PhotoStore } from './photo-store';
import { findPaper, findTemplate, slotAt } from './layout';
import { photoMetrics, renderSheet } from './renderer';

const PX_PER_MM = 7;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Gesture =
  | { kind: 'pinch'; index: number; startDist: number; startZoom: number }
  | {
      kind: 'drag';
      index: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
      maxX: number;
      maxY: number;
      moved: boolean;
    };

/**
 * The sheet. Tap a slot to select it. On the selected photo: two fingers pinch to zoom,
 * one finger drags it (when zoomed in), and Ctrl + mouse wheel (or a trackpad pinch) zooms.
 */
@Component({
  selector: 'app-sheet-preview',
  template: `<canvas
    #c
    [style.touch-action]="draggable() ? 'none' : 'pan-y'"
    (pointerdown)="down($event)"
    (pointermove)="move($event)"
    (pointerup)="up($event)"
    (pointercancel)="cancel($event)"
    (wheel)="wheel($event)"
    aria-label="Sheet preview. Pinch with two fingers to zoom the selected photo."
  ></canvas>`,
  styles: [
    `
      :host {
        display: block;
        max-width: 820px;
        margin: 0 auto;
      }
      canvas {
        display: block;
        width: 100%;
        height: auto;
        background: #fff;
        border-radius: 4px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
      }
    `
  ]
})
export class SheetPreview {
  readonly ev = input.required<MagnetEvent>();
  readonly selected = input<number | null>(null);
  readonly pick = output<number>();
  /** a tap on an empty slot: the parent opens the photo picker for it */
  readonly addPhoto = output<number>();
  readonly zoomChange = output<{ index: number; zoom: number }>();
  readonly panChange = output<{ index: number; panX: number; panY: number }>();

  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private photos = inject(PhotoStore);
  private token = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;

  /** One finger moves the photo only when there is room to move (zoomed in or out). */
  readonly draggable = computed(() => {
    const i = this.selected();
    const s = i === null ? null : this.ev().slots[i];
    return !!s?.photo && s.zoom !== 1;
  });

  constructor() {
    effect(() => {
      const ev = this.ev();
      const selected = this.selected();
      const mine = ++this.token;
      this.photos.preload(ev.slots.map((s) => s.photo)).then(() => {
        if (mine !== this.token) return; // a newer render superseded this one
        renderSheet(this.canvas().nativeElement, ev, (id) => this.photos.getImage(id), {
          pxPerMm: PX_PER_MM,
          selected,
          placeholders: true
        });
      });
    });
  }

  // ---- geometry
  private paperPoint(e: { clientX: number; clientY: number }) {
    const el = this.canvas().nativeElement;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * el.width, y: ((e.clientY - r.top) / r.height) * el.height };
  }

  private slotAtEvent(e: { clientX: number; clientY: number }): number {
    const setup = this.ev().setup;
    if (!setup) return -1;
    const p = this.paperPoint(e);
    return slotAt(findTemplate(setup.templateId), findPaper(setup.paperId), p.x / PX_PER_MM, p.y / PX_PER_MM);
  }

  private readyPhoto(index: number) {
    const slot = this.ev().slots[index];
    const setup = this.ev().setup;
    const img = slot?.photo ? this.photos.getImage(slot.photo) : undefined;
    if (!slot || !setup || !img) return null;
    const t = findTemplate(setup.templateId);
    return { slot, img, t };
  }

  private distance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ---- pointer gestures
  down(e: PointerEvent) {
    const el = this.canvas().nativeElement;
    el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      // second finger: start pinching the selected photo (or the one under the first finger)
      const index = this.selected() ?? this.slotAtEvent(e);
      const ph = index >= 0 ? this.readyPhoto(index) : null;
      this.gesture = ph
        ? { kind: 'pinch', index, startDist: Math.max(1, this.distance()), startZoom: ph.slot.zoom }
        : null;
      return;
    }

    const index = this.slotAtEvent(e);
    if (index < 0) {
      this.gesture = null;
      return;
    }
    const ph = index === this.selected() ? this.readyPhoto(index) : null;
    let maxX = 0;
    let maxY = 0;
    if (ph) {
      const m = photoMetrics(ph.img, ph.slot, ph.t.photoW * PX_PER_MM, ph.t.photoH * PX_PER_MM);
      maxX = m.maxX;
      maxY = m.maxY;
    }
    this.gesture = {
      kind: 'drag',
      index,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: ph?.slot.panX ?? 0,
      startPanY: ph?.slot.panY ?? 0,
      maxX,
      maxY,
      moved: false
    };
  }

  move(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;

    if (g.kind === 'pinch' && this.pointers.size === 2) {
      const zoom = clamp((g.startZoom * this.distance()) / g.startDist, MIN_ZOOM, MAX_ZOOM);
      this.zoomChange.emit({ index: g.index, zoom });
      return;
    }

    if (g.kind === 'drag' && this.pointers.size === 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < 6) return; // still a tap
      g.moved = true;
      if (g.index !== this.selected() || (g.maxX === 0 && g.maxY === 0)) return;
      // screen px -> canvas px, then to the -1..1 pan range (the photo follows the finger)
      const el = this.canvas().nativeElement;
      const k = el.width / el.getBoundingClientRect().width;
      this.panChange.emit({
        index: g.index,
        panX: g.maxX ? clamp(g.startPanX + (dx * k) / g.maxX, -1, 1) : 0,
        panY: g.maxY ? clamp(g.startPanY + (dy * k) / g.maxY, -1, 1) : 0
      });
    }
  }

  up(e: PointerEvent) {
    const g = this.gesture;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (g?.kind === 'drag' && !g.moved) {
        // a tap selects the slot, and on an empty slot it also asks for a photo
        this.pick.emit(g.index);
        if (!this.ev().slots[g.index]?.photo) this.addPhoto.emit(g.index);
      }
      this.gesture = null;
    } else if (g?.kind === 'pinch') {
      this.gesture = null; // one finger left: end the pinch without moving the photo
    }
  }

  cancel(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.gesture = null;
  }

  /** Ctrl + wheel, which is also what a trackpad pinch sends. */
  wheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling still scrolls the page
    const index = this.selected();
    const ph = index === null ? null : this.readyPhoto(index);
    if (index === null || !ph) return;
    e.preventDefault();
    const zoom = clamp(ph.slot.zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM);
    this.zoomChange.emit({ index, zoom });
  }
}
