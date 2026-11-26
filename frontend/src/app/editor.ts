import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Activity } from './activity';
import { EventStore } from './event-store';
import { Format, exportSheet, outputPixels, pickDpi, printBlob, saveBlob } from './export';
import { computeLayout, dims, findPaper, findTemplate, mmText, specText, templateLabel } from './layout';
import {
  COLORS,
  Design,
  FONTS,
  FRAMES,
  LABEL_STYLES,
  MagnetEvent,
  PAPERS,
  SHAPES,
  Shape,
  Slot,
  TEMPLATES,
  emptySlot
} from './models';
import { Icon } from './icon';
import { PhotoStore } from './photo-store';
import { SheetPreview } from './sheet-preview';

@Component({
  selector: 'app-editor',
  imports: [RouterLink, SheetPreview, Icon],
  templateUrl: './editor.html',
  styleUrl: './editor.css'
})
export class Editor {
  readonly id = input.required<string>();

  private store = inject(EventStore);
  private photos = inject(PhotoStore);
  private activity = inject(Activity);

  readonly shapes = SHAPES;
  readonly papers = PAPERS;
  readonly frames = FRAMES;
  readonly labelStyles = LABEL_STYLES;
  readonly colors = COLORS;
  readonly fonts = FONTS;
  readonly templateLabel = templateLabel;

  readonly tab = signal<'photos' | 'setup'>('setup');
  readonly selected = signal(0);
  readonly clipboard = signal<Slot | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);
  readonly format = signal<Format>('pdf');
  readonly hiRes = signal(true);

  // setup form draft
  readonly draftShape = signal<Shape>('round');
  readonly draftTemplate = signal('round-58');
  readonly draftPaper = signal('a4');

  readonly ev = computed(() => this.store.events().find((e) => e.id === this.id()));
  readonly template = computed(() => {
    const s = this.ev()?.setup;
    return s ? findTemplate(s.templateId) : null;
  });
  readonly paper = computed(() => {
    const s = this.ev()?.setup;
    return s ? findPaper(s.paperId) : null;
  });
  readonly layout = computed(() => {
    const t = this.template();
    const p = this.paper();
    return t && p ? computeLayout(t, p) : null;
  });
  readonly subtitle = computed(() => {
    const t = this.template();
    const l = this.layout();
    return t && l ? specText(t, l) : 'Setup not finished';
  });
  readonly slot = computed(() => this.ev()?.slots[this.selected()] ?? null);
  readonly filled = computed(() => this.ev()?.slots.filter((s) => s.photo).length ?? 0);

  private replaceInputEl = viewChild<ElementRef<HTMLInputElement>>('replaceInput');

  /** "Portrait grid (210 x 297 mm)" above the sheet. */
  readonly gridTitle = computed(() => {
    const p = this.paper();
    return p ? `${p.w < p.h ? 'Portrait' : 'Landscape'} grid (${mmText(p.w)} × ${mmText(p.h)} mm)` : '';
  });

  readonly draftTemplates = computed(() => TEMPLATES.filter((t) => t.shape === this.draftShape()));
  readonly draftTpl = computed(() => findTemplate(this.draftTemplate()));
  readonly draftPaperObj = computed(() => findPaper(this.draftPaper()));
  readonly draftLayout = computed(() => computeLayout(this.draftTpl(), this.draftPaperObj()));

  readonly out = computed(() => {
    const e = this.ev();
    if (!e?.setup) return null;
    const r = pickDpi(e, this.hiRes());
    return { ...r, ...outputPixels(e, r.dpi) };
  });

  private inited = false;

  constructor() {
    effect(() => {
      const e = this.ev();
      if (!e || this.inited) return;
      this.inited = true;
      untracked(() => {
        if (e.setup) {
          const t = findTemplate(e.setup.templateId);
          this.draftShape.set(t.shape);
          this.draftTemplate.set(t.id);
          this.draftPaper.set(e.setup.paperId);
          this.tab.set('photos');
        } else {
          this.tab.set('setup');
        }
      });
    });
  }

  // ---- helpers
  readonly dims = dims;
  readonly mm = mmText;
  pct = (n: number) => Math.round(n * 100);
  pad = (n: number) => String(n).padStart(2, '0');

  private update(fn: (e: MagnetEvent) => MagnetEvent) {
    this.store.update(this.id(), fn);
  }

  private patchSlot(i: number, patch: Partial<Slot>) {
    this.update((e) => ({ ...e, slots: e.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }

  patchDesign(patch: Partial<Design>) {
    this.update((e) => ({ ...e, design: { ...e.design, ...patch } }));
  }

  // ---- setup
  onShape(shape: string) {
    this.draftShape.set(shape as Shape);
    const first = TEMPLATES.find((t) => t.shape === shape);
    if (first) this.draftTemplate.set(first.id);
  }

  saveSetup() {
    const n = this.draftLayout().count;
    if (!n) return;
    this.update((e) => ({
      ...e,
      setup: { templateId: this.draftTemplate(), paperId: this.draftPaper() },
      slots: Array.from({ length: n }, (_, i) => e.slots[i] ?? emptySlot())
    }));
    this.selected.set(0);
    this.tab.set('photos');
  }

  // ---- photos
  async addFiles(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const e = this.ev();
    if (!e || !files.length) return;
    this.busy.set(true);
    this.message.set('Adding photos…');
    let added = 0;
    let skipped = 0;
    try {
      const slots = [...e.slots];
      for (const f of files) {
        const at = slots.findIndex((s) => !s.photo);
        if (at < 0) {
          skipped += files.length - added - skipped;
          break;
        }
        try {
          slots[at] = { ...emptySlot(), photo: await this.photos.add(f) };
          added++;
        } catch {
          skipped++;
        }
      }
      this.update((cur) => ({ ...cur, slots }));
      this.message.set(
        `Added ${added} photo${added === 1 ? '' : 's'}` + (skipped ? ` · ${skipped} skipped (sheet full or not an image)` : '')
      );
    } finally {
      this.busy.set(false);
    }
  }

  async replaceFile(input: HTMLInputElement) {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.busy.set(true);
    try {
      const photo = await this.photos.add(f);
      this.patchSlot(this.selected(), { ...emptySlot(), photo, name: this.slot()?.name });
      this.message.set('Photo replaced');
    } catch {
      this.message.set('That file is not a usable image');
    } finally {
      this.busy.set(false);
    }
  }

  removePhoto() {
    this.patchSlot(this.selected(), { ...emptySlot(), name: this.slot()?.name });
  }

  copy() {
    const s = this.slot();
    if (s?.photo) {
      this.clipboard.set({ ...s });
      this.message.set(`Copied slot #${this.pad(this.selected() + 1)}`);
    }
  }

  paste() {
    const c = this.clipboard();
    if (c) this.patchSlot(this.selected(), { ...c, name: this.slot()?.name });
  }

  copyToAll() {
    const src = this.slot();
    if (!src?.photo) return;
    this.update((e) => ({ ...e, slots: e.slots.map((s) => ({ ...src, name: s.name })) }));
    this.message.set('Photo copied to every slot');
  }

  reset() {
    if (!confirm('Remove all photos and adjustments from this sheet?')) return;
    this.update((e) => ({ ...e, slots: e.slots.map(() => emptySlot()) }));
    this.selected.set(0);
  }

  // ---- transform
  setZoom(v: number) {
    this.patchSlot(this.selected(), { zoom: Math.min(3, Math.max(0.25, v / 100)) });
  }

  nudgeZoom(d: number) {
    const s = this.slot();
    if (s) this.setZoom(this.pct(s.zoom) + d);
  }

  /** Two-finger pinch (or Ctrl + wheel) on the sheet. */
  onPinch(e: { index: number; zoom: number }) {
    if (this.selected() !== e.index) this.selected.set(e.index);
    this.patchSlot(e.index, { zoom: e.zoom });
  }

  /** One-finger drag of the selected photo on the sheet. */
  onDrag(e: { index: number; panX: number; panY: number }) {
    this.patchSlot(e.index, { panX: e.panX, panY: e.panY });
  }

  tiltOf = (s: Slot) => Math.round((s.tilt ?? 0) * 10) / 10;

  setTilt(v: number) {
    this.patchSlot(this.selected(), { tilt: Math.min(45, Math.max(-45, v)) });
  }

  /** Tapping an empty slot on the sheet: select it and open the photo picker. */
  addAt(index: number) {
    this.selected.set(index);
    this.replaceInputEl()?.nativeElement.click();
  }

  fullscreen(el: HTMLElement) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  /** 'Same name on all photos' is on (older events count as on when a global name was set). */
  nameAllOn(e: MagnetEvent): boolean {
    return e.design.nameAll ?? !!e.design.globalName;
  }

  /** What the name box shows: the shared name, or this slot's own name. */
  nameValue(e: MagnetEvent): string {
    return this.nameAllOn(e) ? e.design.globalName : (this.slot()?.name ?? '');
  }

  setName(e: MagnetEvent, text: string) {
    if (this.nameAllOn(e)) this.patchDesign({ globalName: text });
    else this.setSlotName(text);
  }

  toggleNameAll(e: MagnetEvent, on: boolean) {
    // switching on starts from the name already typed for this photo
    this.patchDesign({ nameAll: on, ...(on ? { globalName: this.slot()?.name || e.design.globalName } : {}) });
  }

  setPan(axis: 'panX' | 'panY', v: number) {
    this.patchSlot(this.selected(), { [axis]: Math.min(1, Math.max(-1, v / 100)) });
  }

  rotate(d: number) {
    const s = this.slot();
    if (s) this.patchSlot(this.selected(), { rot: (s.rot + d + 360) % 360 });
  }

  setSlotName(text: string) {
    this.patchSlot(this.selected(), { name: text ? text : undefined });
  }

  // ---- output
  private async prepare(e: MagnetEvent) {
    await this.photos.preload(e.slots.map((s) => s.photo));
    return (id: string) => this.photos.getImage(id);
  }

  async download() {
    const e = this.ev();
    const out = this.out();
    if (!e?.setup || !out || this.busy()) return;
    this.busy.set(true);
    this.message.set('Preparing file…');
    try {
      const get = await this.prepare(e);
      const fmt = this.format();
      const blob = await exportSheet(e, get, fmt, out.dpi);
      const safe = e.name.replace(/[^\w\- ]+/g, '').trim() || 'sheet';
      saveBlob(blob, `${safe}-${this.paper()?.id}.${fmt === 'jpeg' ? 'jpg' : fmt}`);
      this.update((x) => ({ ...x, downloads: x.downloads + 1 }));
      const saved = await this.activity.record({ id: e.id, name: e.name }, 'download');
      this.message.set(
        `Downloaded ${fmt.toUpperCase()} · ${out.dpi} DPI` + (saved ? '' : ' · count not saved on the server')
      );
    } catch (err) {
      this.message.set('Could not create the file: ' + (err instanceof Error ? err.message : 'unknown error'));
    } finally {
      this.busy.set(false);
    }
  }

  async print() {
    const e = this.ev();
    const p = this.paper();
    if (!e?.setup || !p || this.busy()) return;
    this.busy.set(true);
    this.message.set('Preparing print…');
    try {
      const get = await this.prepare(e);
      await printBlob(await exportSheet(e, get, 'jpeg', 300), p);
      this.update((x) => ({ ...x, prints: x.prints + 1 }));
      const saved = await this.activity.record({ id: e.id, name: e.name }, 'print');
      this.message.set('Sent to printer dialog' + (saved ? '' : ' · count not saved on the server'));
    } catch (err) {
      this.message.set('Could not print: ' + (err instanceof Error ? err.message : 'unknown error'));
    } finally {
      this.busy.set(false);
    }
  }
}
