import type { SchoolLetterhead } from "../types";

export const LETTERHEAD_DEFAULTS = { topMm: 45, bottomMm: 25, sideMm: 15 };
export const LETTERHEAD_MAX_MB = 10;

/**
 * The first page of an uploaded PDF as a PNG, made by Cloudinary (the PDF is uploaded as an image-type file, which lets
 * Cloudinary turn a page into a picture). `pg_1` = first page, width 1654px ≈ A4 at 200 dpi.
 */
export function letterheadImageUrl(pdfUrl: string): string {
  const marker = "/upload/";
  const at = pdfUrl.indexOf(marker);
  if (at < 0) return pdfUrl;
  const head = pdfUrl.slice(0, at + marker.length);
  const tail = pdfUrl.slice(at + marker.length).replace(/\.pdf(\?.*)?$/i, ".png");
  return `${head}pg_1,w_1654,f_png/${tail}`;
}

export function newLetterhead(pdfUrl: string): SchoolLetterhead {
  return { pdfUrl, imageUrl: letterheadImageUrl(pdfUrl), ...LETTERHEAD_DEFAULTS, enabled: true };
}
