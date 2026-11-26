export type Shape = 'round' | 'square' | 'rect';
export type FrameId = 'plain' | 'gold-ring' | 'gold-stars' | 'navy-ring' | 'silver-dots';
export type LabelStyle = 'none' | 'ribbon' | 'banner';
export type FontId = 'serif' | 'sans' | 'script';

export interface Template {
  id: string;
  shape: Shape;
  name: string;
  photoW: number;
  photoH: number;
  cutW: number;
  cutH: number;
}

export interface Paper {
  id: string;
  name: string;
  w: number;
  h: number;
}

export interface Slot {
  photo: string | null;
  zoom: number; // 1 - 3
  panX: number; // -1 - 1
  panY: number; // -1 - 1
  rot: number; // 0, 90, 180, 270
  tilt?: number; // fine tilt in degrees, -45 - 45
  name?: string;
}

export interface Design {
  frame: FrameId;
  labelStyle: LabelStyle;
  ribbonColor: string;
  textColor: string;
  font: FontId;
  bold: boolean;
  italic: boolean;
  globalName: string;
  /** write globalName on every photo (older events: on when a global name was set) */
  nameAll?: boolean;
}

export interface MagnetEvent {
  id: string;
  name: string;
  createdAt: number;
  lastUsed: number;
  setup: { templateId: string; paperId: string } | null;
  slots: Slot[];
  design: Design;
  downloads: number;
  prints: number;
}

export const SHAPES: { id: Shape; label: string }[] = [
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'rect', label: 'Rectangle' }
];

export const TEMPLATES: Template[] = [
  { id: 'round-38', shape: 'round', name: '38 mm round', photoW: 38.1, photoH: 38.1, cutW: 44.1, cutH: 44.1 },
  { id: 'round-58', shape: 'round', name: '58 mm round', photoW: 60.3, photoH: 60.3, cutW: 68.3, cutH: 68.3 },
  { id: 'round-75', shape: 'round', name: '75 mm round', photoW: 77, photoH: 77, cutW: 85, cutH: 85 },
  { id: 'square-50', shape: 'square', name: '50 mm square', photoW: 50, photoH: 50, cutW: 58, cutH: 58 },
  { id: 'square-75', shape: 'square', name: '75 mm square', photoW: 75, photoH: 75, cutW: 83, cutH: 83 },
  { id: 'rect-50x70', shape: 'rect', name: '50 × 70 mm', photoW: 50, photoH: 70, cutW: 58, cutH: 78 },
  { id: 'rect-65x90', shape: 'rect', name: '65 × 90 mm', photoW: 65, photoH: 90, cutW: 73, cutH: 98 }
];

export const PAPERS: Paper[] = [
  { id: 'a4', name: 'A4', w: 210, h: 297 },
  { id: 'a3', name: 'A3', w: 297, h: 420 },
  { id: '4x6', name: '4×6 in', w: 101.6, h: 152.4 }
];

export const FRAMES: { id: FrameId; label: string; swatch: string }[] = [
  { id: 'plain', label: 'Plain white', swatch: '#ffffff' },
  { id: 'gold-ring', label: 'Gold ring', swatch: '#c9a227' },
  { id: 'gold-stars', label: 'Gold stars', swatch: '#fff6cf' },
  { id: 'navy-ring', label: 'Navy ring', swatch: '#1e3a6e' },
  { id: 'silver-dots', label: 'Silver dots', swatch: '#c9cfdb' }
];

export const LABEL_STYLES: { id: LabelStyle; label: string }[] = [
  { id: 'none', label: 'No label' },
  { id: 'ribbon', label: 'Classic ribbon' },
  { id: 'banner', label: 'Bottom banner' }
];

export const COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'pink', label: 'Pink', hex: '#e0356a' },
  { id: 'navy', label: 'Navy', hex: '#1e3a6e' },
  { id: 'red', label: 'Red', hex: '#c62d3b' },
  { id: 'green', label: 'Green', hex: '#1f7a4d' },
  { id: 'gold', label: 'Gold', hex: '#c9a227' },
  { id: 'black', label: 'Black', hex: '#111827' },
  { id: 'white', label: 'White', hex: '#ffffff' }
];

export const FONTS: { id: FontId; label: string; css: string }[] = [
  { id: 'serif', label: 'Classic serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'sans', label: 'Modern sans', css: 'Inter, "Segoe UI", Arial, sans-serif' },
  { id: 'script', label: 'Script', css: '"Brush Script MT", "Segoe Script", cursive' }
];

export function emptySlot(): Slot {
  return { photo: null, zoom: 1, panX: 0, panY: 0, rot: 0 };
}

export function defaultDesign(): Design {
  return {
    frame: 'plain',
    labelStyle: 'ribbon',
    ribbonColor: 'pink',
    textColor: 'white',
    font: 'serif',
    bold: true,
    italic: true,
    globalName: '',
    nameAll: false
  };
}

export function createEvent(name: string): MagnetEvent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    lastUsed: now,
    setup: null,
    slots: [],
    design: defaultDesign(),
    downloads: 0,
    prints: 0
  };
}

export function colorHex(id: string): string {
  return COLORS.find((c) => c.id === id)?.hex ?? '#1e3a6e';
}
