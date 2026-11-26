import { PAPERS, Paper, TEMPLATES, Template } from './models';

export interface Cell {
  x: number; // mm, top-left of cut outline
  y: number;
}

export interface Layout {
  cols: number;
  rows: number;
  count: number;
  gapX: number;
  gapY: number;
  cells: Cell[];
}

export function findTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function findPaper(id: string): Paper {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

export function computeLayout(t: Template, p: Paper): Layout {
  const cols = Math.floor(p.w / t.cutW);
  const rows = Math.floor(p.h / t.cutH);
  const gapX = cols ? (p.w - cols * t.cutW) / (cols + 1) : 0;
  const gapY = rows ? (p.h - rows * t.cutH) / (rows + 1) : 0;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: gapX + c * (t.cutW + gapX), y: gapY + r * (t.cutH + gapY) });
    }
  }
  return { cols, rows, count: cells.length, gapX, gapY, cells };
}

export function slotAt(t: Template, p: Paper, mmX: number, mmY: number): number {
  return computeLayout(t, p).cells.findIndex(
    (c) => mmX >= c.x && mmX <= c.x + t.cutW && mmY >= c.y && mmY <= c.y + t.cutH
  );
}

const mm = (n: number) => String(Math.round(n * 100) / 100);
export const dims = (w: number, h: number) => (w === h ? `${mm(w)} mm` : `${mm(w)}×${mm(h)} mm`);

export function templateLabel(t: Template): string {
  return `${t.name} · inner ${dims(t.photoW, t.photoH)} · outer ${dims(t.cutW, t.cutH)}`;
}

export function specText(t: Template, l: Layout): string {
  return `${dims(t.photoW, t.photoH)} photo · ${dims(t.cutW, t.cutH)} cut · ${l.count} per sheet`;
}

export function mmText(n: number): string {
  return mm(n);
}
