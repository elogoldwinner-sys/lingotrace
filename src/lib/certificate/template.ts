import { loadLogoImage } from "../logoImage";
import { jpegToPdf } from "./imagePdf";
import type { CertificateBadge } from "./render";
import type { TemplateCertificateInfo } from "../../types";

/**
 * Certificates on the SCHOOL'S OWN template.
 *
 * The school supplies the artwork (an A4 picture or PDF page, landscape or portrait). LingoTrace supplies the standard:
 * fixed zones — see LAYOUTS — where it prints the student's name, the reason, points / class rank, badges, the subject
 * teacher's and principal's signatures, the school stamp, the date and the LingoTrace logo. The school leaves those zones
 * free in its design (the downloadable guide, drawGuide(), shows exactly where). Signatures and stamp can be switched off
 * by the principal. Drawn on one canvas at 300 dpi and wrapped in a PDF (see imagePdf.ts); canvas text handles Arabic
 * shaping and right-to-left names.
 */

export type Orientation = "landscape" | "portrait";
export type LabelLang = "ar" | "en";

export interface TemplateRenderData {
  studentName: string;
  reason: string;
  points: number;
  rank: number | null;
  classSize: number | null;
  badges: CertificateBadge[];
  /** When it was issued (ms). */
  issuedAt: number;
  info: TemplateCertificateInfo;
}

/* ───────────────────────────── the standard ───────────────────────────── */

interface Layout {
  /** Page size in design units (≈ CSS px at 96 dpi: A4 = 1123 × 794). */
  w: number;
  h: number;
  /** Page size in PDF points. */
  pt: { w: number; h: number };
  name: { cx: number; base: number; maxW: number; size: number };
  reason: { cx: number; base: number; maxW: number; size: number; pitch: number; maxLines: number };
  chips: { cx: number; cy: number; h: number; maxW: number };
  badges: { cx: number; cy: number; maxW: number };
  teacher: { cx: number; line: number };
  principal: { cx: number; line: number };
  stamp: { cx: number; cy: number; size: number };
  date: { cx: number; y: number };
  brand: { cx: number; cy: number };
}

export const LAYOUTS: Record<Orientation, Layout> = {
  landscape: {
    w: 1123,
    h: 794,
    pt: { w: 841.89, h: 595.28 },
    name: { cx: 561.5, base: 318, maxW: 780, size: 46 },
    reason: { cx: 561.5, base: 385, maxW: 720, size: 21, pitch: 29, maxLines: 3 },
    chips: { cx: 561.5, cy: 492, h: 28, maxW: 700 },
    badges: { cx: 561.5, cy: 538, maxW: 700 },
    teacher: { cx: 215, line: 676 },
    principal: { cx: 908, line: 676 },
    stamp: { cx: 561.5, cy: 628, size: 108 },
    date: { cx: 561.5, y: 722 },
    brand: { cx: 561.5, cy: 756 },
  },
  portrait: {
    w: 794,
    h: 1123,
    pt: { w: 595.28, h: 841.89 },
    name: { cx: 397, base: 470, maxW: 600, size: 42 },
    reason: { cx: 397, base: 540, maxW: 560, size: 20, pitch: 28, maxLines: 3 },
    chips: { cx: 397, cy: 650, h: 28, maxW: 560 },
    badges: { cx: 397, cy: 698, maxW: 560 },
    teacher: { cx: 165, line: 992 },
    principal: { cx: 629, line: 992 },
    stamp: { cx: 397, cy: 932, size: 108 },
    date: { cx: 397, y: 1038 },
    brand: { cx: 397, cy: 1082 },
  },
};

/** 1123 × 3.125 ≈ 3509 px = A4 at 300 dpi. */
const PRINT_SCALE = 3.125;

const NAVY = "#0D3F7B";
const GOLD = "#C9A227";
const MUTED = "#5B6477";
export const DEFAULT_TEXT_COLOR = NAVY;

const AR = `"Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Segoe UI", "DejaVu Serif", serif`;
const EN = `"Playfair Display", Georgia, "Times New Roman", serif`;
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Playfair+Display:ital,wght@0,500;0,700;1,400&display=swap";

const LABELS = {
  ar: { points: "نقطة", rank: (r: number, n: number) => `الترتيب ${r} من ${n}`, badges: "الأوسمة:", teacher: "معلم المادة", principal: "مدير المدرسة" },
  en: { points: "Points", rank: (r: number, n: number) => `Class Rank ${r} of ${n}`, badges: "Badges:", teacher: "Subject Teacher", principal: "School Principal" },
} as const;

/* ───────────────────────────── image + font loading ───────────────────────────── */

/** Cloudinary: the template page as a white-backed JPEG, at most A4-at-300-dpi wide, and a clean CORS-safe URL for canvas drawing. */
export function templateImageUrl(uploadedUrl: string, isPdf: boolean): string {
  const marker = "/upload/";
  const at = uploadedUrl.indexOf(marker);
  if (at < 0) return uploadedUrl;
  const head = uploadedUrl.slice(0, at + marker.length);
  const tail = uploadedUrl.slice(at + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
  return `${head}${isPdf ? "pg_1," : ""}w_3508,c_limit,b_white,f_jpg,q_90/${tail}`;
}

/** Loads an image for drawing onto a canvas; rejects (so callers can tell the user) when it can't be loaded. */
export function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The template image could not be loaded."));
    img.src = url;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

let linkReady: Promise<void> | null = null;
function loadFontStylesheet(): Promise<void> {
  if (linkReady) return linkReady;
  linkReady = new Promise<void>((resolve) => {
    if (document.querySelector("link[data-template-cert-fonts]")) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_CSS;
    link.setAttribute("data-template-cert-fonts", "1");
    link.onload = () => resolve();
    link.onerror = () => resolve(); // offline: system serif fonts are used instead
    document.head.appendChild(link);
  });
  return linkReady;
}

async function loadFonts(sample: string): Promise<void> {
  await withTimeout(loadFontStylesheet(), 6000);
  const specs = ["700 40px Amiri", "400 20px Amiri", "700 40px 'Playfair Display'", "500 20px 'Playfair Display'"];
  await withTimeout(Promise.allSettled(specs.map((s) => document.fonts.load(s, sample))), 6000);
}

/* ───────────────────────────── drawing helpers ───────────────────────────── */

type Ctx = CanvasRenderingContext2D;
const isRtl = (s: string) => RTL_RE.test(s);

interface TextOpts {
  x: number;
  y: number;
  size: number;
  minSize?: number;
  weight?: number | string;
  italic?: boolean;
  family?: "ar" | "en";
  color: string;
  align?: CanvasTextAlign;
  maxW?: number;
}

function fontFor(o: TextOpts, size: number, text: string): string {
  const fam = (o.family ?? (isRtl(text) ? "ar" : "en")) === "ar" ? AR : EN;
  return `${o.italic ? "italic " : ""}${o.weight ?? 400} ${size}px ${fam}`;
}

/** Draws one line, shrinking it to `maxW` if needed. Returns the width drawn. */
function drawText(ctx: Ctx, text: string, o: TextOpts): number {
  if (!text) return 0;
  let size = o.size;
  ctx.direction = isRtl(text) ? "rtl" : "ltr";
  ctx.font = fontFor(o, size, text);
  let w = ctx.measureText(text).width;
  if (o.maxW && w > o.maxW) {
    size = Math.max(o.minSize ?? 10, (size * o.maxW) / w);
    ctx.font = fontFor(o, size, text);
    w = ctx.measureText(text).width;
  }
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, o.x, o.y);
  return w;
}

function wrap(ctx: Ctx, text: string, maxW: number, font: string): string[] {
  ctx.font = font;
  ctx.direction = isRtl(text) ? "rtl" : "ltr";
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(test).width <= maxW) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawImageFit(ctx: Ctx, img: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number, anchor: "center" | "bottom" = "center") {
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * ratio;
  const h = img.naturalHeight * ratio;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, cx - w / 2, anchor === "bottom" ? cy - h : cy - h / 2, w, h);
}

const pad = (n: number) => String(n).padStart(2, "0");
function dateText(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The lines of text that make up the chips / badge row, in the school's label language. */
function statItems(data: TemplateRenderData): string[] {
  const L = LABELS[data.info.labelLang];
  const items = [data.info.labelLang === "ar" ? `⭐ ${data.points} ${L.points}` : `⭐ ${data.points} ${L.points}`];
  if (data.rank && data.classSize) {
    const medal = data.rank === 1 ? "🥇" : data.rank === 2 ? "🥈" : data.rank === 3 ? "🥉" : "🏅";
    items.push(`${medal} ${L.rank(data.rank, data.classSize)}`);
  }
  return items;
}

function drawChips(ctx: Ctx, items: string[], z: Layout["chips"]) {
  const padX = 12;
  const gap = 8;
  let size = 14.5;
  let widths: number[] = [];
  const measure = (s: number) => {
    ctx.font = `700 ${s}px ${AR}`;
    return items.map((t) => {
      ctx.direction = isRtl(t) ? "rtl" : "ltr";
      return ctx.measureText(t).width + padX * 2;
    });
  };
  for (; size >= 10.5; size -= 0.5) {
    widths = measure(size);
    if (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1) <= z.maxW) break;
  }
  widths = measure(size);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = z.cx - total / 2;
  const top = z.cy - z.h / 2;
  items.forEach((text, i) => {
    roundedRect(ctx, x, top, widths[i], z.h, z.h / 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    drawText(ctx, text, { x: x + widths[i] / 2, y: z.cy + size * 0.34, size, weight: 700, color: NAVY });
    x += widths[i] + gap;
  });
}

function drawBadges(ctx: Ctx, badges: CertificateBadge[], lang: LabelLang, color: string, z: Layout["badges"]) {
  if (badges.length === 0) return;
  const label = LABELS[lang].badges;
  const labelSize = 13;
  const font = (s: number) => `700 ${s}px ${lang === "ar" ? AR : EN}`;
  const widthOf = (text: string, s: number) => {
    ctx.font = font(s);
    ctx.direction = isRtl(text) ? "rtl" : "ltr";
    return ctx.measureText(text).width;
  };
  // Try icon + name for every badge; if too wide, icons only; if still too wide, "+N".
  let size = 13;
  let gap = 14;
  let items = badges.map((b) => `${b.icon} ${b.name}`);
  const total = (list: string[], s: number, g: number) => widthOf(label, labelSize) + 8 + list.reduce((n, t) => n + widthOf(t, s), 0) + g * (list.length - 1);
  if (total(items, size, gap) > z.maxW) {
    size = 18;
    gap = 8;
    items = badges.map((b) => b.icon);
    while (items.length > 1 && total(items, size, gap) > z.maxW) items = [...items.slice(0, -2), `+${badges.length - (items.length - 2)}`];
  }
  const all = total(items, size, gap);
  const y = z.cy + 5;
  const parts = [{ text: label, s: labelSize, c: GOLD }, ...items.map((t) => ({ text: t, s: size, c: color }))];
  if (lang === "ar") {
    let x = z.cx + all / 2; // Arabic reads right → left: the label sits on the right
    parts.forEach((p, i) => {
      const w = widthOf(p.text, p.s);
      drawText(ctx, p.text, { x, y, size: p.s, weight: 700, color: p.c, align: "right", family: "ar" });
      x -= w + (i === 0 ? 8 : gap);
    });
  } else {
    let x = z.cx - all / 2;
    parts.forEach((p, i) => {
      const w = widthOf(p.text, p.s);
      drawText(ctx, p.text, { x, y, size: p.s, weight: 700, color: p.c, align: "left" });
      x += w + (i === 0 ? 8 : gap);
    });
  }
}

async function drawSignature(ctx: Ctx, cx: number, line: number, imgUrl: string | undefined, name: string, role: string, color: string) {
  const img = await loadLogoImage(imgUrl);
  if (img?.naturalWidth) drawImageFit(ctx, img, cx, line - 4, 200, 62, "bottom");
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 118, line);
  ctx.lineTo(cx + 118, line);
  ctx.stroke();
  drawText(ctx, name, { x: cx, y: line + 20, size: 16, minSize: 11, weight: 700, color, maxW: 236 });
  drawText(ctx, role, { x: cx, y: line + 39, size: 14, weight: 500, color, maxW: 236 });
}

async function drawBrand(ctx: Ctx, z: Layout["brand"]) {
  const logo = await loadCorsImage(`${import.meta.env.BASE_URL}logo-256.png`).catch(() => null);
  const text = "LingoTrace";
  ctx.font = `700 12px ${EN}`;
  ctx.direction = "ltr";
  const tw = ctx.measureText(text).width;
  const icon = logo ? 20 : 0;
  const total = icon + (logo ? 6 : 0) + tw;
  let x = z.cx - total / 2;
  if (logo) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, x, z.cy - icon / 2, icon, icon);
    x += icon + 6;
  }
  drawText(ctx, text, { x, y: z.cy + 4, size: 12, family: "en", weight: 700, color: MUTED, align: "left" });
}

/* ───────────────────────────── the certificate ───────────────────────────── */

/** Draws one certificate on a fresh canvas (`scale` 1 = 1123 px wide, handy for previews; print uses 3.125). */
export async function renderTemplateCanvas(data: TemplateRenderData, scale = PRINT_SCALE): Promise<HTMLCanvasElement> {
  const { info } = data;
  const L = LAYOUTS[info.orientation];
  const lang = LABELS[info.labelLang];
  const name = data.studentName.replace(/\s+/g, " ").trim();
  const reason = data.reason.replace(/\s+/g, " ").trim();
  const [art] = await Promise.all([
    loadCorsImage(info.templateURL),
    loadFonts(`${name} ${reason} ${info.teacherName} ${info.principalName} ${data.badges.map((b) => b.name).join(" ")} 0123456789`),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(L.w * scale);
  canvas.height = Math.round(L.h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the certificate (canvas unavailable).");
  ctx.scale(canvas.width / L.w, canvas.height / L.h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art, 0, 0, L.w, L.h); // stretched to A4; the settings card warns when the proportions are off

  const color = info.textColor || DEFAULT_TEXT_COLOR;

  // Student name
  drawText(ctx, name, { x: L.name.cx, y: L.name.base, size: L.name.size, minSize: 22, weight: 700, color, maxW: L.name.maxW });

  // Reason (up to three lines)
  if (reason) {
    const fam = isRtl(reason) ? AR : EN;
    let size = L.reason.size;
    let lines: string[] = [];
    for (; size >= 14; size -= 1) {
      lines = wrap(ctx, reason, L.reason.maxW, `500 ${size}px ${fam}`);
      if (lines.length <= L.reason.maxLines) break;
    }
    lines = lines.slice(0, L.reason.maxLines);
    lines.forEach((line, i) =>
      drawText(ctx, line, { x: L.reason.cx, y: L.reason.base + i * (size * (L.reason.pitch / L.reason.size)), size, weight: 500, color, maxW: L.reason.maxW, minSize: 12 })
    );
  }

  drawChips(ctx, statItems(data), L.chips);
  drawBadges(ctx, data.badges, info.labelLang, color, L.badges);

  // Signatures and stamp — a switched-off item is not drawn at all.
  if (info.showTeacherSignature) await drawSignature(ctx, L.teacher.cx, L.teacher.line, info.teacherSignatureURL, info.teacherName, lang.teacher, color);
  if (info.showPrincipalSignature) await drawSignature(ctx, L.principal.cx, L.principal.line, info.principalSignatureURL, info.principalName, lang.principal, color);
  if (info.showStamp) {
    const stamp = await loadLogoImage(info.stampURL);
    if (stamp?.naturalWidth) drawImageFit(ctx, stamp, L.stamp.cx, L.stamp.cy, L.stamp.size, L.stamp.size);
  }

  drawText(ctx, dateText(data.issuedAt), { x: L.date.cx, y: L.date.y, size: 14, family: "en", weight: 500, color });
  await drawBrand(ctx, L.brand);
  return canvas;
}

export async function buildTemplateCertificatePdf(data: TemplateRenderData): Promise<Uint8Array> {
  const canvas = await renderTemplateCanvas(data);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The certificate image could not be created."))), "image/jpeg", 0.93)
  );
  const L = LAYOUTS[data.info.orientation];
  return jpegToPdf({
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    widthPx: canvas.width,
    heightPx: canvas.height,
    widthPt: L.pt.w,
    heightPt: L.pt.h,
    title: data.studentName.trim() || "Certificate",
  });
}

/* ───────────────────────────── the guide the school designs against ───────────────────────────── */

/**
 * A picture of the standard: the A4 page with every zone LingoTrace fills in, labelled in Arabic and English. The
 * school's designer lays their artwork around these boxes (keeping them free), then exports the page as PNG / JPG / PDF.
 */
export async function renderGuideCanvas(orientation: Orientation, scale = 2.5): Promise<HTMLCanvasElement> {
  const L = LAYOUTS[orientation];
  await loadFonts("دليل قالب الشهادة اسم الطالب سبب منح الشهادة النقاط الترتيب الأوسمة التوقيع الختم التاريخ");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(L.w * scale);
  canvas.height = Math.round(L.h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the guide (canvas unavailable).");
  ctx.scale(canvas.width / L.w, canvas.height / L.h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L.w, L.h);

  // A4 outline + a ~6 mm margin that desktop printers can't print into
  const m = 24;
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "#9aa3b2";
  ctx.lineWidth = 1;
  ctx.strokeRect(m, m, L.w - 2 * m, L.h - 2 * m);

  const box = (cx: number, top: number, w: number, h: number, en: string, ar: string, hue: string) => {
    ctx.setLineDash([5, 4]);
    ctx.fillStyle = `${hue}22`;
    ctx.strokeStyle = hue;
    ctx.lineWidth = 1.4;
    roundedRect(ctx, cx - w / 2, top, w, h, 6);
    ctx.fill();
    ctx.stroke();
    const fits = w >= 150;
    const y = top + h / 2 + 5;
    if (fits) {
      drawText(ctx, en, { x: cx - 8, y, size: 13, family: "en", color: hue, align: "right", weight: 500 });
      drawText(ctx, ar, { x: cx + 8, y, size: 15, family: "ar", color: hue, align: "left", weight: 700 });
    }
  };
  const z = L;
  box(z.name.cx, z.name.base - 50, z.name.maxW, 66, "Student name", "اسم الطالب", "#0D3F7B");
  box(z.reason.cx, z.reason.base - 24, z.reason.maxW, z.reason.pitch * 2 + 34, "Reason for the certificate (up to 3 lines)", "سبب منح الشهادة (حتى ٣ أسطر)", "#2F7D6B");
  box(z.chips.cx, z.chips.cy - z.chips.h / 2 - 4, z.chips.maxW, z.chips.h + 8, "Points · Class rank", "النقاط · الترتيب", "#B8860B");
  box(z.badges.cx, z.badges.cy - 16, z.badges.maxW, 32, "Badges", "الأوسمة", "#8A4FB3");
  for (const [slot, en, ar] of [
    [z.teacher, "Subject teacher signature", "توقيع معلم المادة"],
    [z.principal, "Principal signature", "توقيع مدير المدرسة"],
  ] as const) {
    box(slot.cx, slot.line - 68, 236, 128, "", "", "#C2410C");
    // two-language label, stacked inside the box
    drawText(ctx, en, { x: slot.cx, y: slot.line - 30, size: 12, family: "en", color: "#C2410C", weight: 500 });
    drawText(ctx, ar, { x: slot.cx, y: slot.line - 12, size: 14, family: "ar", color: "#C2410C", weight: 700 });
  }
  box(z.stamp.cx, z.stamp.cy - z.stamp.size / 2, z.stamp.size, z.stamp.size, "", "", "#B91C1C");
  drawText(ctx, "School stamp", { x: z.stamp.cx, y: z.stamp.cy - 4, size: 12, family: "en", color: "#B91C1C", weight: 500 });
  drawText(ctx, "ختم المدرسة", { x: z.stamp.cx, y: z.stamp.cy + 14, size: 14, family: "ar", color: "#B91C1C", weight: 700 });
  box(z.date.cx, z.date.y - 18, 120, 26, "", "", "#475569");
  drawText(ctx, "Date · التاريخ", { x: z.date.cx, y: z.date.y, size: 12, family: "en", color: "#475569", weight: 500 });
  box(z.brand.cx, z.brand.cy - 14, 140, 28, "", "", "#475569");
  drawText(ctx, "LingoTrace logo", { x: z.brand.cx, y: z.brand.cy + 4, size: 12, family: "en", color: "#475569", weight: 500 });

  // Heading + rules, in the free area at the top
  ctx.setLineDash([]);
  const top = orientation === "landscape" ? 90 : 120;
  drawText(ctx, "دليل قالب الشهادة القياسي", { x: L.w / 2, y: top, size: 30, family: "ar", color: NAVY, weight: 700 });
  drawText(ctx, `LingoTrace standard certificate template · A4 ${orientation}`, { x: L.w / 2, y: top + 28, size: 15, family: "en", color: MUTED, italic: true });
  const notes = [
    ["Design your own artwork on this A4 page and keep the coloured boxes free of text and busy graphics.", "صمّم القالب بحرّية على صفحة A4 هذه، واترك المربعات الملوّنة خالية من النصوص والرسومات المزدحمة."],
    ["Put your title, school name, logo and any \"awarded to\" wording in the area above the Student name box.", "ضع العنوان واسم المدرسة والشعار وعبارة «تُمنح إلى» في المساحة أعلى مربع اسم الطالب."],
    ["Export as PNG, JPG or PDF (first page), then remove this guide layer before uploading.", "صدّر الملف PNG أو JPG أو PDF (الصفحة الأولى)، واحذف طبقة هذا الدليل قبل الرفع."],
  ];
  notes.forEach(([en, ar], i) => {
    const y = top + 62 + i * 40;
    drawText(ctx, ar, { x: L.w / 2, y, size: 14, family: "ar", color: INK_SOFT, maxW: L.w - 160 });
    drawText(ctx, en, { x: L.w / 2, y: y + 18, size: 11.5, family: "en", color: MUTED, maxW: L.w - 160 });
  });
  return canvas;
}

const INK_SOFT = "#334155";
