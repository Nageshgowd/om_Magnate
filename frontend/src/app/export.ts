import { MagnetEvent, Paper } from './models';
import { findPaper } from './layout';
import { renderSheet } from './renderer';

export type Format = 'jpeg' | 'png' | 'pdf';

const MAX_PIXELS = 40_000_000; // keeps canvas memory sane (A4 @ 600 DPI = ~35M)

export function outputPixels(ev: MagnetEvent, dpi: number): { w: number; h: number } {
  const p = findPaper(ev.setup?.paperId ?? 'a4');
  const k = dpi / 25.4;
  return { w: Math.round(p.w * k), h: Math.round(p.h * k) };
}

/** 600 DPI when asked and the sheet is small enough, otherwise 300 DPI. */
export function pickDpi(ev: MagnetEvent, high: boolean): { dpi: number; reduced: boolean } {
  if (!high) return { dpi: 300, reduced: false };
  const { w, h } = outputPixels(ev, 600);
  return w * h > MAX_PIXELS ? { dpi: 300, reduced: true } : { dpi: 600, reduced: false };
}

export async function exportSheet(
  ev: MagnetEvent,
  getImg: (id: string) => HTMLImageElement | undefined,
  format: Format,
  dpi: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderSheet(canvas, ev, getImg, { pxPerMm: dpi / 25.4 });
  const p = findPaper(ev.setup?.paperId ?? 'a4');

  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({
      unit: 'mm',
      format: [p.w, p.h],
      orientation: p.w > p.h ? 'landscape' : 'portrait',
      compress: true
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, p.w, p.h);
    return pdf.output('blob');
  }

  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create image'))), type, 0.92)
  );
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function printBlob(blob: Blob, p: Paper): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc =
      `<!doctype html><html><head><style>@page{size:${p.w}mm ${p.h}mm;margin:0}` +
      `html,body{margin:0;padding:0}img{display:block;width:${p.w}mm;height:${p.h}mm}</style></head>` +
      `<body><img src="${url}"></body></html>`;
    frame.onload = () => {
      const img = frame.contentDocument?.querySelector('img');
      const go = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
        resolve();
      };
      if (img && !img.complete) img.onload = go;
      else go();
    };
    document.body.appendChild(frame);
  });
}
