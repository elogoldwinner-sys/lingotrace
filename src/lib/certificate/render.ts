import { customBoldFontUrl, customRegularFontUrl } from "./customFonts";
import type { OverlayImage } from "./pdfOverlay";

export interface CertificateBadge {
  icon: string;
  name: string;
}

/** Everything that changes from one certificate to the next. The artwork never changes. */
export interface CertificateRenderData {
  studentName: string;
  reason: string;
  /** The student's total points on the platform. */
  points: number;
  /** Position in the class since the start of the school year (1 = top), or null when unknown. */
  rank: number | null;
  classSize: number | null;
  badges: CertificateBadge[];
}

/** Resource names + object numbers of the template's placeholder images (see scripts used to prepare template.pdf). */
export const SLOT_IMAGES = {
  name: { objNum: 13, resName: "LtName" },
  reason: { objNum: 14, resName: "LtReason" },
  stats: { objNum: 15, resName: "LtStats" },
  badges: { objNum: 12, resName: "LtBadges" },
} as const;

/** Top edge of the template page's coordinate system; the template's layout numbers below are measured downward from it. */
const PAGE_TOP = 850.07996;
/** Text is rasterised at 600 dpi — indistinguishable from vector text on paper, and it handles Arabic shaping/RTL names too. */
const SCALE = 600 / 72;

// Colours sampled from the template's own text.
const NAVY = "#0D3F7B";
const BODY_BLUE = "#3C6CB8";
const TEAL = "#338D8D";
const GOLD = "#F4C430";
const CHIP_FILL = "#FFF7DA";

// Where the template's original "Student Name Here" / "Reason…" text sat (points, measured from the top of the page).
const NAME_LAYOUT = { cx: 295.6, baseline: 419.0, size: 40.33, minSize: 17, maxW: 436 };
const REASON_LAYOUT = { cx: 289.5, midBaseline: 485.4, size: 18.18, minSize: 12.5, pitch: 1.331, maxW: 348, maxLines: 3 };
const CHIPS_LAYOUT = { cx: 291, cy: 533, chipH: 20, maxW: 336 };
const BADGES_LAYOUT = { cx: 290, cy: 683, maxW: 336 };

const GOOGLE_FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Baloo+Bhaijaan+2:wght@500;700&display=swap";
const FALLBACKS = `"Patrick Hand", "Baloo Bhaijaan 2", "Comic Sans MS", "Segoe UI", sans-serif`;
const BODY_STACK = `${customRegularFontUrl ? '"CertCakeRegular", ' : ""}${FALLBACKS}`;
const BOLD_STACK = `${customBoldFontUrl ? '"CertCakeBold", ' : ""}${FALLBACKS}`;
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

// ------------------------------------------------------------------ fonts

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

let baseFontsReady: Promise<void> | null = null;

function loadBaseFonts(): Promise<void> {
  if (baseFontsReady) return baseFontsReady;
  baseFontsReady = (async () => {
    const jobs: Promise<unknown>[] = [];
    if (!document.querySelector('link[data-certificate-fonts]')) {
      jobs.push(
        new Promise<void>((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = GOOGLE_FONTS_CSS;
          link.setAttribute("data-certificate-fonts", "1");
          link.onload = () => resolve();
          link.onerror = () => resolve(); // offline: fall back to system fonts
          document.head.appendChild(link);
        })
      );
    }
    const custom: [string | null, string, string][] = [
      [customRegularFontUrl, "CertCakeRegular", "400"],
      [customBoldFontUrl, "CertCakeBold", "700"],
    ];
    for (const [url, family, weight] of custom) {
      if (!url) continue;
      const face = new FontFace(family, `url(${url})`, { weight });
      jobs.push(face.load().then((f) => document.fonts.add(f)));
    }
    await withTimeout(Promise.allSettled(jobs), 6000);
  })();
  return baseFontsReady;
}

/** Makes sure every face needed to draw `text` is actually loaded (Google serves Latin/Arabic as separate subsets). */
async function loadFontsFor(text: string): Promise<void> {
  await loadBaseFonts();
  const specs = [
    `700 40px ${BOLD_STACK}`,
    `400 18px ${BODY_STACK}`,
    `700 12px ${BODY_STACK}`,
    `700 40px "Baloo Bhaijaan 2"`,
    `500 18px "Baloo Bhaijaan 2"`,
  ];
  await withTimeout(
    Promise.allSettled(specs.map((s) => document.fonts.load(s, text))),
    6000
  );
}

// ------------------------------------------------------------------ canvas helpers

type Layer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; wPt: number; hPt: number };

function newLayer(wPt: number, hPt: number): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(wPt * SCALE);
  canvas.height = Math.ceil(hPt * SCALE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't draw the certificate (canvas unavailable).");
  ctx.scale(canvas.width / wPt, canvas.height / hPt);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx, wPt, hPt };
}

function toOverlay(slot: { objNum: number; resName: string }, layer: Layer, xPt: number, topPt: number): OverlayImage {
  const { canvas, ctx, wPt, hPt } = layer;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = canvas.width * canvas.height;
  const rgb = new Uint8Array(px * 3);
  const alpha = new Uint8Array(px);
  for (let i = 0, j = 0, k = 0; i < px; i++, j += 4, k += 3) {
    rgb[k] = data[j];
    rgb[k + 1] = data[j + 1];
    rgb[k + 2] = data[j + 2];
    alpha[i] = data[j + 3];
  }
  return {
    objNum: slot.objNum,
    resName: slot.resName,
    x: xPt,
    y: PAGE_TOP - (topPt + hPt),
    w: wPt,
    h: hPt,
    widthPx: canvas.width,
    heightPx: canvas.height,
    rgb,
    alpha,
  };
}

function setDirection(ctx: CanvasRenderingContext2D, text: string) {
  ctx.direction = RTL_RE.test(text) ? "rtl" : "ltr";
}

function measure(ctx: CanvasRenderingContext2D, text: string): number {
  setDirection(ctx, text);
  return ctx.measureText(text).width;
}

/** Splits a over-long single word into pieces that each fit `maxW`. */
function breakLongWord(ctx: CanvasRenderingContext2D, word: string, maxW: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const ch of Array.from(word)) {
    if (current && measure(ctx, current + ch) > maxW) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const pieces = measure(ctx, word) > maxW ? breakLongWord(ctx, word, maxW) : [word];
    for (const piece of pieces) {
      const test = line ? `${line} ${piece}` : piece;
      if (!line || measure(ctx, test) <= maxW) {
        line = test;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

// ------------------------------------------------------------------ the four overlays

function renderName(name: string): OverlayImage | null {
  if (!name) return null;
  const boxW = 460;
  const boxH = 58;
  const topOffset = 44; // baseline sits this far below the box top at full size
  const layer = newLayer(boxW, boxH);
  const { ctx } = layer;

  let size = NAME_LAYOUT.size;
  ctx.font = `700 ${size}px ${BOLD_STACK}`;
  const width = measure(ctx, name);
  if (width > NAME_LAYOUT.maxW) {
    size = Math.max(NAME_LAYOUT.minSize, (size * NAME_LAYOUT.maxW) / width);
    ctx.font = `700 ${size}px ${BOLD_STACK}`;
  }
  let text = name;
  while (text.length > 1 && measure(ctx, text) > NAME_LAYOUT.maxW) text = text.slice(0, -1);
  if (text !== name) text = `${text.trimEnd()}…`;

  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  setDirection(ctx, text);
  ctx.fillText(text, boxW / 2, topOffset - (NAME_LAYOUT.size - size) * 0.2);

  return toOverlay(SLOT_IMAGES.name, layer, NAME_LAYOUT.cx - boxW / 2, NAME_LAYOUT.baseline - topOffset);
}

function renderReason(reason: string): OverlayImage | null {
  if (!reason) return null;
  const boxW = 384;
  const boxH = 100;
  const layer = newLayer(boxW, boxH);
  const { ctx } = layer;

  let size = REASON_LAYOUT.size;
  let lines: string[] = [];
  for (; size >= REASON_LAYOUT.minSize; size -= 0.5) {
    ctx.font = `400 ${size}px ${BODY_STACK}`;
    lines = wrapLines(ctx, reason, REASON_LAYOUT.maxW);
    if (lines.length <= REASON_LAYOUT.maxLines) break;
  }
  size = Math.max(size, REASON_LAYOUT.minSize);
  ctx.font = `400 ${size}px ${BODY_STACK}`;
  if (lines.length > REASON_LAYOUT.maxLines) {
    lines = lines.slice(0, REASON_LAYOUT.maxLines);
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(ctx, `${last}…`) > REASON_LAYOUT.maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }

  ctx.fillStyle = BODY_BLUE;
  ctx.textAlign = "center";
  const pitch = size * REASON_LAYOUT.pitch;
  lines.forEach((line, i) => {
    setDirection(ctx, line);
    ctx.fillText(line, boxW / 2, boxH / 2 + (i - (lines.length - 1) / 2) * pitch);
  });

  return toOverlay(SLOT_IMAGES.reason, layer, REASON_LAYOUT.cx - boxW / 2, REASON_LAYOUT.midBaseline - boxH / 2);
}

function renderStats(points: number, rank: number | null, classSize: number | null): OverlayImage {
  const boxW = 346;
  const boxH = 26;
  const layer = newLayer(boxW, boxH);
  const { ctx } = layer;

  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏅";
  const items = [`⭐ ${points} Points`];
  if (rank && classSize) items.push(`${medal} Class Rank ${rank} of ${classSize}`);

  const padX = 9;
  const gap = 7;
  let size = 12.5;
  let widths: number[] = [];
  for (; size >= 9.5; size -= 0.5) {
    ctx.font = `700 ${size}px ${BODY_STACK}`;
    widths = items.map((t) => measure(ctx, t) + padX * 2);
    if (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1) <= CHIPS_LAYOUT.maxW) break;
  }
  ctx.font = `700 ${size}px ${BODY_STACK}`;
  widths = items.map((t) => measure(ctx, t) + padX * 2);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);

  const top = (boxH - CHIPS_LAYOUT.chipH) / 2;
  let x = (boxW - total) / 2;
  ctx.textAlign = "left";
  items.forEach((text, i) => {
    roundedRect(ctx, x, top, widths[i], CHIPS_LAYOUT.chipH, CHIPS_LAYOUT.chipH / 2);
    ctx.fillStyle = CHIP_FILL;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    ctx.fillStyle = NAVY;
    setDirection(ctx, text);
    ctx.fillText(text, x + padX, boxH / 2 + size * 0.33);
    x += widths[i] + gap;
  });

  return toOverlay(SLOT_IMAGES.stats, layer, CHIPS_LAYOUT.cx - boxW / 2, CHIPS_LAYOUT.cy - boxH / 2);
}

function renderBadges(badges: CertificateBadge[]): OverlayImage | null {
  if (badges.length === 0) return null;
  const boxW = 350;
  const boxH = 22;
  const layer = newLayer(boxW, boxH);
  const { ctx } = layer;
  const maxW = BADGES_LAYOUT.maxW;

  const labelSize = 10;
  ctx.font = `700 ${labelSize}px ${BODY_STACK}`;
  const label = "Badges:";
  const labelW = measure(ctx, label);

  // First try icon + name for every badge; if that is too wide, icons only; if still too wide, "+N more".
  let size = 9.5;
  let gap = 11;
  let items = badges.map((b) => `${b.icon} ${b.name}`);
  const widthOf = (list: string[]) => labelW + 7 + list.reduce((n, t) => n + measure(ctx, t), 0) + gap * (list.length - 1);
  ctx.font = `700 ${size}px ${BODY_STACK}`;
  if (widthOf(items) > maxW) {
    size = 14;
    gap = 7;
    items = badges.map((b) => b.icon);
    ctx.font = `700 ${size}px ${BODY_STACK}`;
    while (items.length > 1 && widthOf(items) > maxW) {
      items = [...items.slice(0, -2), `+${badges.length - (items.length - 2)}`];
    }
  }
  const total = widthOf(items);

  let x = (boxW - total) / 2;
  const baseline = boxH / 2 + size * 0.33;
  ctx.textAlign = "left";
  ctx.font = `700 ${labelSize}px ${BODY_STACK}`;
  ctx.fillStyle = TEAL;
  ctx.fillText(label, x, boxH / 2 + labelSize * 0.33);
  x += labelW + 7;
  ctx.font = `700 ${size}px ${BODY_STACK}`;
  ctx.fillStyle = NAVY;
  for (const item of items) {
    ctx.fillText(item, x, baseline);
    x += measure(ctx, item) + gap;
  }

  return toOverlay(SLOT_IMAGES.badges, layer, BADGES_LAYOUT.cx - boxW / 2, BADGES_LAYOUT.cy - boxH / 2);
}

/** Draws every dynamic part of one certificate and returns it as image layers ready to be placed on the template. */
export async function renderCertificateOverlays(data: CertificateRenderData): Promise<OverlayImage[]> {
  const name = data.studentName.replace(/\s+/g, " ").trim();
  const reason = data.reason.replace(/\s+/g, " ").trim();
  await loadFontsFor(`${name} ${reason} ${data.badges.map((b) => b.name).join(" ")} 0123456789`);

  const overlays = [
    renderName(name),
    renderReason(reason),
    renderStats(data.points, data.rank, data.classSize),
    renderBadges(data.badges),
  ];
  return overlays.filter((o): o is OverlayImage => o !== null);
}
