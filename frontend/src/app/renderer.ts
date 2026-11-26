import { Design, FONTS, FrameId, MagnetEvent, Shape, Slot, Template, colorHex } from './models';
import { Cell, computeLayout, findPaper, findTemplate } from './layout';

export interface RenderOptions {
  pxPerMm: number;
  selected?: number | null;
  placeholders?: boolean;
}

type ImgLookup = (id: string) => HTMLImageElement | undefined;

export function renderSheet(
  canvas: HTMLCanvasElement,
  ev: MagnetEvent,
  getImg: ImgLookup,
  opts: RenderOptions
): void {
  if (!ev.setup) return;
  const t = findTemplate(ev.setup.templateId);
  const p = findPaper(ev.setup.paperId);
  const k = opts.pxPerMm;
  canvas.width = Math.round(p.w * k);
  canvas.height = Math.round(p.h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  computeLayout(t, p).cells.forEach((cell, i) =>
    drawCell(ctx, ev.design, t, cell, ev.slots[i], i, k, getImg, opts)
  );
}

function tracePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, shape: Shape) {
  ctx.beginPath();
  if (shape === 'round') {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.05);
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  d: Design,
  t: Template,
  cell: Cell,
  slot: Slot | undefined,
  index: number,
  k: number,
  getImg: ImgLookup,
  opts: RenderOptions
) {
  const cx = (cell.x + t.cutW / 2) * k;
  const cy = (cell.y + t.cutH / 2) * k;
  const cw = t.cutW * k;
  const ch = t.cutH * k;
  const pw = t.photoW * k;
  const ph = t.photoH * k;

  // frame background (the ring between photo and cut line)
  ctx.save();
  tracePath(ctx, cx, cy, cw, ch, t.shape);
  ctx.fillStyle = frameFill(ctx, d.frame, cx, cy, cw, ch);
  ctx.fill();
  ctx.restore();

  // photo
  ctx.save();
  tracePath(ctx, cx, cy, pw, ph, t.shape);
  ctx.clip();
  const img = slot?.photo ? getImg(slot.photo) : undefined;
  if (img && slot) {
    drawPhoto(ctx, img, slot, cx, cy, pw, ph);
  } else if (opts.placeholders) {
    ctx.fillStyle = '#eceffd';
    ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
  }
  ctx.restore();

  if (!img && opts.placeholders) {
    drawPlaceholder(ctx, t, cx, cy, pw, ph, k, index, opts.selected === index);
  }

  drawFrameDecor(ctx, d.frame, cx, cy, cw, ch, pw, ph, t.shape, k);

  const nameAll = d.nameAll ?? !!d.globalName;
  const text = (nameAll ? d.globalName : (slot?.name ?? '')).trim();
  if (img && text && d.labelStyle !== 'none') {
    drawLabel(ctx, d, text, t.shape, cx, cy, pw, ph);
  }

  // cut outline (a little stronger on screen than on the printed sheet)
  ctx.save();
  tracePath(ctx, cx, cy, cw, ch, t.shape);
  ctx.lineWidth = Math.max(1, (opts.placeholders ? 0.25 : 0.15) * k);
  ctx.strokeStyle = opts.placeholders ? '#8e98ad' : '#c4cad6';
  ctx.stroke();
  ctx.restore();

  // selected slot: solid ring at the photo edge (screen only)
  if (opts.selected === index) {
    ctx.save();
    const inset = img ? 0 : 1.2 * k;
    tracePath(ctx, cx, cy, pw - inset * 2, ph - inset * 2, t.shape);
    ctx.lineWidth = Math.max(2, 0.7 * k);
    ctx.strokeStyle = '#4f5ff0';
    ctx.stroke();
    ctx.restore();
  }
}

/** Empty slot on screen: dashed guide, a "+" and the slot number. */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  t: Template,
  cx: number,
  cy: number,
  pw: number,
  ph: number,
  k: number,
  index: number,
  selected: boolean
) {
  const unit = Math.min(pw, ph);
  ctx.save();
  if (!selected) {
    tracePath(ctx, cx, cy, pw - 2.4 * k, ph - 2.4 * k, t.shape);
    ctx.setLineDash([0.9 * k, 0.9 * k]);
    ctx.lineWidth = Math.max(1, 0.3 * k);
    ctx.strokeStyle = '#aab3f7';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const arm = unit * 0.07;
  const py = cy - unit * 0.1;
  ctx.strokeStyle = '#4a5be0';
  ctx.lineWidth = unit * 0.026;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - arm, py);
  ctx.lineTo(cx + arm, py);
  ctx.moveTo(cx, py - arm);
  ctx.lineTo(cx, py + arm);
  ctx.stroke();
  ctx.fillStyle = '#6672a3';
  ctx.font = `600 ${unit * 0.115}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Slot ${String(index + 1).padStart(2, '0')}`, cx, cy + unit * 0.12);
  ctx.restore();
}

/**
 * How a photo is scaled into its frame, and how far it may be moved before an edge shows (canvas px).
 * `rot` is the 90-degree turn and `angle` adds the fine tilt. The photo is scaled up just enough that
 * the tilted picture still covers the whole frame, and the movement range shrinks to match.
 */
export function photoMetrics(img: HTMLImageElement, s: Slot, pw: number, ph: number) {
  const rot = ((s.rot % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const iw = swap ? img.naturalHeight : img.naturalWidth;
  const ih = swap ? img.naturalWidth : img.naturalHeight;
  const tilt = Math.min(45, Math.max(-45, s.tilt ?? 0));
  const th = (tilt * Math.PI) / 180;
  const c = Math.abs(Math.cos(th));
  const sn = Math.abs(Math.sin(th));
  // the frame, seen from the tilted picture's own axes
  const bw = pw * c + ph * sn;
  const bh = pw * sn + ph * c;
  const scale = Math.max(bw / iw, bh / ih) * s.zoom; // "cover" fit, then zoom
  const W = iw * scale;
  const H = ih * scale;
  const covers = W >= bw - 0.01 && H >= bh - 0.01;
  if (!covers) {
    // zoomed out: the picture is smaller than the frame, so it may slide around inside it
    const wb = W * c + H * sn;
    const hb = W * sn + H * c;
    return { rot, angle: rot + tilt, scale, covers, maxX: Math.max(0, (pw - wb) / 2), maxY: Math.max(0, (ph - hb) / 2) };
  }
  const ax = Math.max(0, (iw * scale - bw) / 2); // spare picture on each side
  const ay = Math.max(0, (ih * scale - bh) / 2);
  // furthest the photo may move along the screen's x and y axes on its own...
  const mx = Math.min(c > 1e-9 ? ax / c : Infinity, sn > 1e-9 ? ay / sn : Infinity);
  const my = Math.min(sn > 1e-9 ? ax / sn : Infinity, c > 1e-9 ? ay / c : Infinity);
  // ...and scaled down so moving along both at once still stays covered
  const f = Math.min(
    1,
    ax / Math.max(1e-9, mx * c + my * sn),
    ay / Math.max(1e-9, mx * sn + my * c)
  );
  return { rot, angle: rot + tilt, scale, covers, maxX: mx * f, maxY: my * f };
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  s: Slot,
  cx: number,
  cy: number,
  pw: number,
  ph: number
) {
  const { angle, scale, covers, maxX, maxY } = photoMetrics(img, s, pw, ph);
  if (!covers) drawBlurBackdrop(ctx, img, s, cx, cy, pw, ph);
  ctx.save();
  ctx.translate(cx + s.panX * maxX, cy + s.panY * maxY);
  ctx.rotate((angle * Math.PI) / 180);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Zoomed out: fill the frame with a soft, blurred copy of the same photo behind the sharp one. */
function drawBlurBackdrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  s: Slot,
  cx: number,
  cy: number,
  pw: number,
  ph: number
) {
  const rot = ((s.rot % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const small = document.createElement('canvas'); // shrinking then stretching the photo is a cheap blur
  small.width = 28;
  small.height = Math.max(1, Math.round((28 * img.naturalHeight) / img.naturalWidth));
  small.getContext('2d')!.drawImage(img, 0, 0, small.width, small.height);
  const iw = swap ? img.naturalHeight : img.naturalWidth;
  const ih = swap ? img.naturalWidth : img.naturalHeight;
  const k = Math.max(pw / iw, ph / ih) * 1.15;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-pw, -ph, pw * 2, ph * 2);
  ctx.restore();
}

function frameFill(
  ctx: CanvasRenderingContext2D,
  frame: FrameId,
  cx: number,
  cy: number,
  cw: number,
  ch: number
): string | CanvasGradient {
  switch (frame) {
    case 'gold-ring': {
      const g = ctx.createLinearGradient(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2);
      g.addColorStop(0, '#f6e27a');
      g.addColorStop(0.5, '#c9a227');
      g.addColorStop(1, '#f6e27a');
      return g;
    }
    case 'gold-stars':
      return '#fffbea';
    case 'navy-ring':
      return '#1e3a6e';
    default:
      return '#ffffff';
  }
}

function perimeterPoints(cx: number, cy: number, w: number, h: number, shape: Shape, n: number) {
  const pts: { x: number; y: number }[] = [];
  if (shape === 'round') {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pts.push({ x: cx + (w / 2) * Math.cos(a), y: cy + (h / 2) * Math.sin(a) });
    }
    return pts;
  }
  const per = 2 * (w + h);
  const l = cx - w / 2;
  const tp = cy - h / 2;
  for (let i = 0; i < n; i++) {
    let s = (i * per) / n;
    if (s < w) pts.push({ x: l + s, y: tp });
    else if ((s -= w) < h) pts.push({ x: l + w, y: tp + s });
    else if ((s -= h) < w) pts.push({ x: l + w - s, y: tp + h });
    else pts.push({ x: l, y: tp + h - (s - w) });
  }
  return pts;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(x + rad * Math.cos(a), y + rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

function drawFrameDecor(
  ctx: CanvasRenderingContext2D,
  frame: FrameId,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  pw: number,
  ph: number,
  shape: Shape,
  k: number
) {
  const ringW = (cw - pw) / 2;
  const ringH = (ch - ph) / 2;
  const ring = Math.min(ringW, ringH);
  if (frame === 'plain' || ring <= 0) return;

  if (frame === 'gold-stars' || frame === 'silver-dots') {
    const w = cw - ringW;
    const h = ch - ringH;
    const perimeter = shape === 'round' ? Math.PI * (w + h) / 2 : 2 * (w + h);
    const n = Math.max(8, Math.round(perimeter / (ring * (frame === 'gold-stars' ? 1.7 : 1.3))));
    ctx.fillStyle = frame === 'gold-stars' ? '#c9a227' : '#aab2c2';
    for (const p of perimeterPoints(cx, cy, w, h, shape, n)) {
      if (frame === 'gold-stars') star(ctx, p.x, p.y, ring * 0.32);
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, ring * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // thin line where the photo meets the frame
  ctx.save();
  tracePath(ctx, cx, cy, pw, ph, shape);
  ctx.lineWidth = Math.max(1, 0.25 * k);
  ctx.strokeStyle = frame === 'navy-ring' ? '#ffffff' : frame === 'silver-dots' ? '#aab2c2' : '#a98414';
  ctx.stroke();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  d: Design,
  text: string,
  shape: Shape,
  cx: number,
  cy: number,
  pw: number,
  ph: number
) {
  const fill = colorHex(d.ribbonColor);
  const textColor = colorHex(d.textColor);
  const unit = Math.min(pw, ph);
  const bandH = unit * (d.labelStyle === 'ribbon' ? 0.15 : 0.17);
  let bandW: number;
  let textY: number;

  // everything stays inside the photo, like the printed sticker
  ctx.save();
  tracePath(ctx, cx, cy, pw, ph, shape);
  ctx.clip();

  if (d.labelStyle === 'ribbon') {
    // curved ribbon with folded, notched ends
    bandW = pw * 0.52;
    const by = cy + ph * 0.3; // middle of the band
    const sag = bandH * 0.5; // the middle of the ribbon dips below its ends
    const L = cx - bandW / 2;
    const R = cx + bandW / 2;
    const top0 = by - bandH / 2 - sag / 2; // y of the top edge at the ends
    const bot0 = top0 + bandH;
    const tw = bandH * 0.62; // how far the tails stick out
    const drop = bandH * 0.3; // the tails sit lower than the band
    const notch = tw * 0.42;
    const dark = shade(fill, -0.32);
    const darker = shade(fill, -0.5);

    // tails behind the band
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? L : R; // where the tail meets the band
      const x1 = x0 + side * tw; // outer end
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x0 - side * bandH * 0.1, top0 + drop);
      ctx.lineTo(x1, top0 + drop + bandH * 0.08);
      ctx.lineTo(x1 - side * notch, top0 + drop + bandH * 0.08 + bandH / 2);
      ctx.lineTo(x1, bot0 + drop + bandH * 0.08);
      ctx.lineTo(x0 - side * bandH * 0.1, bot0 + drop);
      ctx.closePath();
      ctx.fill();
      // the fold where the band turns back
      ctx.fillStyle = darker;
      ctx.beginPath();
      ctx.moveTo(x0, bot0);
      ctx.lineTo(x0 - side * bandH * 0.32, bot0);
      ctx.lineTo(x0, bot0 + drop * 0.9);
      ctx.closePath();
      ctx.fill();
    }

    // the band itself: two arcs, lighter at the top
    const g = ctx.createLinearGradient(0, top0, 0, bot0 + sag);
    g.addColorStop(0, shade(fill, 0.1));
    g.addColorStop(1, fill);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = unit * 0.025;
    ctx.shadowOffsetY = unit * 0.012;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L, top0);
    ctx.quadraticCurveTo(cx, top0 + sag * 2, R, top0);
    ctx.lineTo(R, bot0);
    ctx.quadraticCurveTo(cx, bot0 + sag * 2, L, bot0);
    ctx.closePath();
    ctx.fill();
    textY = by;
  } else {
    bandW = pw;
    const h = bandH * 1.25;
    const by = cy + ph / 2 - h / 2;
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = fill;
    ctx.fillRect(cx - pw / 2, by - h / 2, pw, h);
    ctx.globalAlpha = 1;
    textY = by;
  }
  ctx.restore();

  const family = FONTS.find((f) => f.id === d.font)?.css ?? FONTS[0].css;
  let size = bandH * 0.62;
  const style = `${d.italic ? 'italic ' : ''}${d.bold ? 'bold ' : ''}`;
  ctx.save();
  tracePath(ctx, cx, cy, pw, ph, shape);
  ctx.clip();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${style}${size}px ${family}`;
  while (ctx.measureText(text).width > bandW * 0.84 && size > 4) {
    size *= 0.93;
    ctx.font = `${style}${size}px ${family}`;
  }
  if (d.labelStyle === 'ribbon' && textColor === '#ffffff') {
    // a soft shadow keeps white text readable on any ribbon colour
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.05;
  }
  ctx.fillText(text, cx, textY + size * 0.04);
  ctx.restore();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
