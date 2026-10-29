import { buildZip } from "./certificate/zip";
import { loadLogoImage } from "./logoImage";

export interface CardArt {
  number: number;
  url: string;
}

/** Output is drawn at 2× the artwork's size so the school logo stays crisp when printed. */
const OUT_SCALE = 2;
/** Where the school logo goes: the clear bottom-right corner of the card (fractions of card width/height). */
const LOGO_BOX = { x: 0.58, y: 0.765, w: 0.35, h: 0.17 };

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src}`));
    img.src = src;
  });
}

/** One card as a PNG canvas: transparent outside the rounded card, school logo on its own (no background plate). */
async function renderCard(art: CardArt, logo: HTMLImageElement | null): Promise<HTMLCanvasElement> {
  const card = await loadImage(art.url);
  const canvas = document.createElement("canvas");
  canvas.width = card.naturalWidth * OUT_SCALE;
  canvas.height = card.naturalHeight * OUT_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(card, 0, 0, canvas.width, canvas.height);
  if (logo) {
    const bw = canvas.width * LOGO_BOX.w;
    const bh = canvas.height * LOGO_BOX.h;
    const ratio = Math.min(bw / logo.naturalWidth, bh / logo.naturalHeight);
    const w = logo.naturalWidth * ratio;
    const h = logo.naturalHeight * ratio;
    const x = canvas.width * LOGO_BOX.x + (bw - w) / 2;
    const y = canvas.height * LOGO_BOX.y + (bh - h) / 2;
    ctx.drawImage(logo, x, y, w, h);
  }
  return canvas;
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

/** Opens the print dialog with all cards on one A4 page (2 × 2), ready to cut out. */
export async function printCards(cards: CardArt[], logoUrl: string | undefined, title: string) {
  const logo = await loadLogoImage(logoUrl);
  const imgs: string[] = [];
  for (const c of cards) imgs.push((await renderCard(c, logo)).toDataURL("image/png"));

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
.sheet img{width:90mm;height:auto;display:block}
</style></head><body><div class="sheet">${imgs.map((s) => `<img src="${s}">`).join("")}</div></body></html>`);
  doc.close();
  await new Promise((r) => setTimeout(r, 400));
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60_000);
  return { logoApplied: !!logo || !logoUrl };
}
