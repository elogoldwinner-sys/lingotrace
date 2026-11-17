import QRCode, { QRErrorCorrectLevel } from "./qrcodeVendor";

/** Dark/light module grid for `text` (error correction M, version picked automatically). */
export function makeQrMatrix(text: string): boolean[][] {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * Draws a QR code (with the 4-module quiet zone scanners need) on a white
 * background, plus an optional caption underneath — so the image is
 * self-explanatory once it's pasted into WhatsApp or printed.
 */
export function drawQr(canvas: HTMLCanvasElement, text: string, caption?: string, size = 720): void {
  const matrix = makeQrMatrix(text);
  const quiet = 4;
  const modules = matrix.length + quiet * 2;
  const cell = Math.max(1, Math.floor(size / modules));
  const qrPx = cell * modules;
  const captionH = caption ? Math.round(qrPx * 0.12) : 0;

  canvas.width = qrPx;
  canvas.height = qrPx + captionH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    })
  );

  if (caption) {
    ctx.fillStyle = "#1f2a44";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontPx = Math.round(captionH * 0.5);
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    // Shrink long class names so they always fit.
    while (ctx.measureText(caption).width > qrPx * 0.9 && fontPx > 10) {
      fontPx -= 2;
      ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    }
    ctx.fillText(caption, qrPx / 2, qrPx + captionH * 0.45);
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
