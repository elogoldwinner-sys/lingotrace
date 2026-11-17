/**
 * Dependency-free one-page PDF that shows a single JPEG filling the page — used for certificates on the school's own template, which
 * is drawn on a canvas (Arabic shaping, signatures, stamp) and then wrapped in a PDF so it prints at true A4.
 */

const enc = new TextEncoder();
const ascii = (s: string) => enc.encode(s);

/** PDF text string: plain ASCII stays as is; anything else becomes UTF-16BE hex (so Arabic titles survive). */
function pdfText(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/([\\()])/g, "\\$1")})`;
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${hex.toUpperCase()}>`;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function jpegToPdf(opts: {
  jpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
  /** Page size in points (A4 landscape = 841.89 × 595.28). */
  widthPt: number;
  heightPt: number;
  title: string;
}): Uint8Array {
  const { jpeg, widthPx, heightPx, widthPt, heightPt, title } = opts;
  const content = ascii(`q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im0 Do Q`);

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === "string" ? ascii(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (num: number, body: (Uint8Array | string)[]) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  obj(5, [`<< /Length ${content.length} >>\nstream\n`, content, "\nendstream"]);
  obj(6, [`<< /Title ${pdfText(title)} /Producer (LingoTrace) >>`]);

  const xrefAt = length;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (let n = 1; n <= 6; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return concat(chunks);
}
