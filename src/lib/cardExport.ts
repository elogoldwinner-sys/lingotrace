import { buildZip } from "./certificate/zip";
import { loadLogoImage } from "./logoImage";

export interface CardArt {
  number: number;
  url: string;
}

/** A card to export: the artwork plus the student name line(s) to write on it (none = a blank number card). */
export interface CardItem {
  art: CardArt;
  lines?: string[];
  /** File name inside the ZIP (class cards). */
  filename?: string;
}

/** Output is drawn at 2× the artwork's size so the school logo stays crisp when printed. */
const OUT_SCALE = 2;
/** School logo badge (bottom-right corner): centre and diameter as fractions of card width/height/width. */
const BADGE = { cx: 0.775, cy: 0.838, d: 0.28 };
/** The logo fills this share of the badge's inner (white) circle. */
const BADGE_LOGO_FILL = 0.74;
const GOLD = { light: "#F6D66B", mid: "#D4A62A", dark: "#A87A12" };

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src}`));
    img.src = src;
  });
}

/**
 * Where the student's name goes: the clear strip between the big number and
 * the LingBite cookie (fractions of card width/height). One name uses the
 * whole strip; Arabic + English share it as two smaller lines.
 */
const NAME_BOX = { x: 0.12, w: 0.76, y: 0.621, h: 0.060 };
/** A soft white plate behind the name keeps it readable over the card's decorative stars. */
const PLATE = { x: 0.07, w: 0.86, y: 0.619, h: 0.064 };
/** Dark tone of each card's own colour, so the name matches the card. */
const NAME_COLORS: Record<number, string> = { 1: "#14307A", 2: "#14532D", 3: "#8B1A1A", 4: "#4C1D95" };
const NAME_FONT = '"Nunito", "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif';
const ARABIC = /[\u0600-\u06FF]/;

/** Draws 1–2 centred lines, shrinking each until it fits the strip. */
function drawName(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, number: number, lines: string[]) {
  const clean = lines.map((l) => l.trim()).filter(Boolean).slice(0, 2);
  if (clean.length === 0) return;
  const boxW = canvas.width * NAME_BOX.w;
  const boxH = canvas.height * NAME_BOX.h;
  const lineH = boxH / clean.length;
  // Arabic letters sit taller, so they get a touch less size than the line height.
  const maxSize = clean.length === 1 ? canvas.height * 0.04 : canvas.height * 0.024;

  const color = NAME_COLORS[number] || "#1E2A4A";
  const px = canvas.width * PLATE.x;
  const py = canvas.height * PLATE.y;
  const pw = canvas.width * PLATE.w;
  const ph = canvas.height * PLATE.h;
  const r = ph / 2;
  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.arcTo(px + pw, py, px + pw, py + ph, r);
  ctx.arcTo(px + pw, py + ph, px, py + ph, r);
  ctx.arcTo(px, py + ph, px, py, r);
  ctx.arcTo(px, py, px + pw, py, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.lineWidth = Math.max(2, canvas.width * 0.004);
  ctx.strokeStyle = `${color}55`;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  clean.forEach((text, i) => {
    ctx.direction = ARABIC.test(text) ? "rtl" : "ltr";
    let size = maxSize;
    ctx.font = `800 ${size}px ${NAME_FONT}`;
    while (ctx.measureText(text).width > boxW && size > canvas.height * 0.016) {
      size -= 1;
      ctx.font = `800 ${size}px ${NAME_FONT}`;
    }
    ctx.fillText(text, canvas.width * (NAME_BOX.x + NAME_BOX.w / 2), canvas.height * NAME_BOX.y + lineH * (i + 0.5));
  });
}

/** The school logo inside a golden ring with a white disc behind it. */
function drawLogoBadge(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, logo: HTMLImageElement) {
  const cx = canvas.width * BADGE.cx;
  const cy = canvas.height * BADGE.cy;
  const R = (canvas.width * BADGE.d) / 2;
  const ring = R * 0.09;

  ctx.save();
  // soft shadow so the badge lifts off the card
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = R * 0.12;
  ctx.shadowOffsetY = R * 0.04;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = GOLD.mid;
  ctx.fill();
  ctx.restore();

  // golden ring (gradient) …
  const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  grad.addColorStop(0, GOLD.light);
  grad.addColorStop(0.5, GOLD.mid);
  grad.addColorStop(1, GOLD.dark);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // … white disc inside the ring
  const inner = R - ring;
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.015);
  ctx.strokeStyle = GOLD.dark;
  ctx.stroke();

  // logo, contained in the white disc
  const box = inner * 2 * BADGE_LOGO_FILL;
  const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
  const w = logo.naturalWidth * ratio;
  const h = logo.naturalHeight * ratio;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, inner - ctx.lineWidth, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** One card as a PNG canvas: transparent outside the rounded card, school logo in a gold-ringed badge. */
async function renderCard(art: CardArt, logo: HTMLImageElement | null, lines?: string[]): Promise<HTMLCanvasElement> {
  const card = await loadImage(art.url);
  const canvas = document.createElement("canvas");
  canvas.width = card.naturalWidth * OUT_SCALE;
  canvas.height = card.naturalHeight * OUT_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(card, 0, 0, canvas.width, canvas.height);
  if (logo) drawLogoBadge(ctx, canvas, logo);
  if (lines && lines.length > 0) drawName(ctx, canvas, art.number, lines);
  return canvas;
}

/** Makes sure the card font is ready before drawing on a canvas (canvas text doesn't wait for web fonts). */
async function ensureFonts() {
  try {
    await document.fonts.load(`800 40px "Nunito"`);
  } catch {
    // Falls back to a system font — the names still print.
  }
}

function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error("PNG failed"))), "image/png")
  );
}

function save(bytes: Uint8Array, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Every card in `items` as its own PNG in one ZIP — used for the whole-class download (name written on each card). */
export async function downloadCardItemsZip(items: CardItem[], logoUrl: string | undefined, zipName: string) {
  const logo = await loadLogoImage(logoUrl);
  await ensureFonts();
  const entries = [];
  for (const item of items) {
    entries.push({
      name: item.filename || `Card ${item.art.number}.png`,
      data: await canvasToBytes(await renderCard(item.art, logo, item.lines)),
    });
  }
  save(buildZip(entries), "application/zip", `${zipName}.zip`);
  return { logoApplied: !!logo || !logoUrl };
}

/** Result tells the caller whether the school logo could be added (so the UI can say so if not). */
export async function downloadCardsZip(cards: CardArt[], logoUrl: string | undefined, zipName: string) {
  const logo = await loadLogoImage(logoUrl);
  const entries = [];
  for (const c of cards) {
    entries.push({ name: `Card ${c.number}.png`, data: await canvasToBytes(await renderCard(c, logo)) });
  }
  save(buildZip(entries), "application/zip", `${zipName}.zip`);
  return { logoApplied: !!logo || !logoUrl };
}

export async function downloadCardPng(card: CardArt, logoUrl: string | undefined) {
  const logo = await loadLogoImage(logoUrl);
  save(await canvasToBytes(await renderCard(card, logo)), "image/png", `Card ${card.number}.png`);
  return { logoApplied: !!logo || !logoUrl };
}

/** Opens the print dialog with the four blank cards on one A4 page (2 × 2), ready to cut out. */
export async function printCards(cards: CardArt[], logoUrl: string | undefined, title: string) {
  return printCardItems(cards.map((art) => ({ art })), logoUrl, title);
}

/** Same, for any list of cards (e.g. a whole class with names) — four to a page, as many pages as needed. */
export async function printCardItems(items: CardItem[], logoUrl: string | undefined, title: string) {
  const logo = await loadLogoImage(logoUrl);
  await ensureFonts();
  const imgs: string[] = [];
  for (const item of items) imgs.push((await renderCard(item.art, logo, item.lines)).toDataURL("image/png"));

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
@page{size:A4 portrait;margin:8mm}
html,body{margin:0;padding:0}
.sheet{display:grid;grid-template-columns:repeat(2,90mm);gap:6mm;justify-content:center}
.sheet img{width:90mm;height:auto;display:block;break-inside:avoid;page-break-inside:avoid}
</style></head><body><div class="sheet">${imgs.map((s) => `<img src="${s}">`).join("")}</div></body></html>`);
  doc.close();
  await new Promise((r) => setTimeout(r, 400));
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60_000);
  return { logoApplied: !!logo || !logoUrl };
}
