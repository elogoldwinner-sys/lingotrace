/**
 * Dependency-free PDF "incremental update".
 *
 * The certificate template (src/assets/certificate/template.pdf) is shipped as a finished,
 * vector A4 page whose artwork is left completely untouched. It contains a few empty slots
 * (a blank content stream, four 1×1 placeholder images and an Info dictionary). To make a
 * student's certificate we do NOT re-encode the template: we append a standard PDF
 * incremental update that redefines those slots with the student's text (rendered at 600 dpi
 * with a transparency mask) and draws them on top. Every PDF viewer/printer supports this,
 * and the original vector artwork and its full-resolution images stay byte-for-byte identical.
 */

export interface OverlayImage {
  /** Object number of the placeholder image in the template. */
  objNum: number;
  /** Resource name of that placeholder (e.g. "LtName"). */
  resName: string;
  /** Placement on the PDF page, in points, origin bottom-left of the page's coordinate system. */
  x: number;
  y: number;
  w: number;
  h: number;
  widthPx: number;
  heightPx: number;
  rgb: Uint8Array;
  alpha: Uint8Array;
}

export interface OverlaySlots {
  /** Object number of the blank content stream that is drawn after the template art. */
  contentObj: number;
  /** Object number of the Info dictionary. */
  infoObj: number;
}

const enc = new TextEncoder();
const ascii = (s: string) => enc.encode(s);
const blobPart = (u: Uint8Array) => u as unknown as BlobPart;

/** zlib/Deflate via the browser's built-in CompressionStream (what PDF's FlateDecode expects). */
export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([blobPart(data)]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

function utf16Hex(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  return `(D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}Z)`;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function appendOverlayUpdate(
  template: Uint8Array,
  slots: OverlaySlots,
  overlays: OverlayImage[],
  title: string
): Promise<Uint8Array> {
  // --- read the template's classic trailer -------------------------------------------------
  const tail = latin1(template.subarray(Math.max(0, template.length - 4096)));
  const sx = tail.lastIndexOf("startxref");
  const tr = tail.lastIndexOf("trailer");
  if (sx < 0 || tr < 0) throw new Error("Certificate template has an unexpected structure.");
  const prevXref = parseInt(tail.slice(sx + 9).trim(), 10);
  const trailer = tail.slice(tr, sx);
  const size = parseInt(/\/Size\s+(\d+)/.exec(trailer)?.[1] ?? "", 10);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  const idMatch = /\/ID\s*(\[[^\]]*\])/.exec(trailer)?.[1];
  if (!Number.isFinite(prevXref) || !Number.isFinite(size) || !root) {
    throw new Error("Certificate template trailer could not be read.");
  }

  const chunks: Uint8Array[] = [];
  let offset = template.length;
  const push = (c: Uint8Array) => {
    chunks.push(c);
    offset += c.length;
  };
  if (template[template.length - 1] !== 0x0a) push(ascii("\n"));

  const offsets = new Map<number, number>();
  const writeObject = (num: number, dict: string, stream?: Uint8Array) => {
    offsets.set(num, offset);
    if (stream) {
      push(ascii(`${num} 0 obj\n<< ${dict} /Length ${stream.length} >>\nstream\n`));
      push(stream);
      push(ascii("\nendstream\nendobj\n"));
    } else {
      push(ascii(`${num} 0 obj\n<< ${dict} >>\nendobj\n`));
    }
  };

  // --- images (+ their transparency masks, which take new object numbers) -------------------
  let nextNew = size;
  const drawOps: string[] = [];
  for (const o of overlays) {
    const maskNum = nextNew++;
    const [rgbZ, alphaZ] = await Promise.all([deflate(o.rgb), deflate(o.alpha)]);
    writeObject(
      maskNum,
      `/Type /XObject /Subtype /Image /Width ${o.widthPx} /Height ${o.heightPx} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
      alphaZ
    );
    writeObject(
      o.objNum,
      `/Type /XObject /Subtype /Image /Width ${o.widthPx} /Height ${o.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true /SMask ${maskNum} 0 R /Filter /FlateDecode`,
      rgbZ
    );
    drawOps.push(`q ${o.w.toFixed(4)} 0 0 ${o.h.toFixed(4)} ${o.x.toFixed(4)} ${o.y.toFixed(4)} cm /${o.resName} Do Q`);
  }

  // --- content stream drawn after the template art ------------------------------------------
  // "/LtGs gs" resets opacity to 100%: the template's own content ends with an invisible (ca 0) state.
  writeObject(slots.contentObj, "", ascii(`q\n/LtGs gs\n${drawOps.join("\n")}\nQ\n`));

  // --- document info (title = student's name, so the PDF tab/print job is labelled) ---------
  writeObject(
    slots.infoObj,
    `/Title ${utf16Hex(title)} /Author (Mahmoud Badawi) /Creator (LingoTrace) /Producer (LingoTrace) /CreationDate ${pdfDate(new Date())}`
  );

  // --- cross-reference section for just the objects we wrote --------------------------------
  const nums = [...offsets.keys()].sort((a, b) => a - b);
  const xrefOffset = offset;
  let xref = "xref\n";
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    xref += `${nums[i]} ${j - i + 1}\n`;
    for (let k = i; k <= j; k++) xref += `${pad(offsets.get(nums[k])!, 10)} 00000 n \n`;
    i = j + 1;
  }
  xref += `trailer\n<< /Size ${nextNew} /Root ${root} /Info ${slots.infoObj} 0 R /Prev ${prevXref}${idMatch ? ` /ID ${idMatch}` : ""} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  push(ascii(xref));

  return concat([template, ...chunks]);
}
