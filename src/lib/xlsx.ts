import { buildZip } from "./certificate/zip";

/**
 * Excel (.xlsx) export and import, with no extra dependency: an .xlsx file is a ZIP of small XML files, so the existing
 * store-only ZIP writer builds it, and the browser's DecompressionStream reads files saved by Excel.
 *
 * Why not CSV any more: Excel guesses the encoding / delimiter of CSV files (Arabic text turns to gibberish, commas
 * split cells in some regional settings) and drops leading zeros. A real workbook has none of those problems.
 */

export interface XlsxSheet {
  /** Tab name (cleaned to Excel's rules: ≤ 31 characters, none of  \ / ? * [ ] : ). */
  name: string;
  headers: string[];
  /** Rows as text or numbers. Text that looks like a plain number (e.g. "12", "-3", "4.5") is stored as a number. */
  rows: (string | number)[][];
  /** Zero-based columns to format as Text (phone numbers: Excel keeps the leading 0 / + and never turns them into 5.0E+11). */
  textColumns?: number[];
}

/* ───────────────────────────── writing ───────────────────────────── */

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

// eslint-disable-next-line no-control-regex
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const esc = (s: string) =>
  s
    .replace(XML_BAD, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 0 → A, 25 → Z, 26 → AA … */
function colName(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Plain numbers only: no leading zeros (phone numbers, codes stay text), at most 15 digits (Excel's precision). */
const NUMERIC = /^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$/;

function sheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[\\/?*[\]:]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sheet";
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function sheetXml(sheet: XlsxSheet, rtl: boolean): string {
  const all = [sheet.headers, ...sheet.rows];
  const cols = Math.max(1, ...all.map((r) => r.length));
  const textCols = new Set(sheet.textColumns ?? []);

  // Column widths from the longest cell (capped, so a long "details" column wraps instead of stretching).
  const widths = Array.from({ length: cols }, (_, c) => {
    const longest = Math.max(...all.map((r) => String(r[c] ?? "").split("\n").reduce((m, l) => Math.max(m, l.length), 0)), 4);
    return Math.min(60, Math.max(10, longest + 3));
  });

  const rowsXml = all
    .map((row, r) => {
      if (row.length === 0) return `<row r="${r + 1}"/>`;
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (value === "" || value === null || value === undefined) return r === 0 ? `<c r="${ref}" s="1"/>` : "";
          if (r > 0 && typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="3"><v>${value}</v></c>`;
          const text = String(value);
          if (r > 0 && textCols.has(c)) return `<c r="${ref}" s="4" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
          if (r > 0 && NUMERIC.test(text)) return `<c r="${ref}" s="3"><v>${text}</v></c>`;
          return `<c r="${ref}" s="${r === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${colName(cols - 1)}${all.length}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}>` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${textCols.has(i) ? ' style="4"' : ""}/>`).join("")}</cols>` +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF0D3F7B"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Builds an .xlsx workbook. `rtl` mirrors the sheets (right-to-left) for Arabic. */
export function buildXlsx(sheets: XlsxSheet[], rtl = false): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

  const files = [
    {
      name: "[Content_Types].xml",
      data: bytes(
        head +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
          `</Types>`
      ),
    },
    {
      name: "_rels/.rels",
      data: bytes(
        head +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      ),
    },
    {
      name: "xl/workbook.xml",
      data: bytes(
        head +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<bookViews><workbookView${rtl ? "" : ""}/></bookViews>` +
          `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
          `</workbook>`
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: bytes(
        head +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      ),
    },
    { name: "xl/styles.xml", data: bytes(STYLES_XML) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: bytes(sheetXml(s, rtl)) })),
  ];
  return buildZip(files);
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Builds the workbook and downloads it. Sheets are mirrored right-to-left when the app is in Arabic. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const rtl = typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
  const data = buildXlsx(sheets, rtl);
  const blob = new Blob([data as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ───────────────────────────── reading ───────────────────────────── */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't open .xlsx files. Please use a recent Chrome, Edge, Safari or Firefox.");
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads the entries of a ZIP (stored or deflated) into a name → bytes map. */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const data = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^(xl\/(workbook|sharedStrings)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = data.subarray(start, start + compSize);
    out.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
  }
  return out;
}

const xmlDoc = (bytesIn: Uint8Array) => new DOMParser().parseFromString(new TextDecoder().decode(bytesIn), "application/xml");
const byTag = (root: Document | Element, tag: string): Element[] => Array.from(root.getElementsByTagNameNS("*", tag));

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/**
 * Reads the FIRST sheet of an .xlsx into row objects keyed by the (trimmed, lower-cased) header row — the same shape
 * parseCsv returns, so importers handle both alike. Empty rows are skipped.
 */
export async function parseXlsx(buf: ArrayBuffer): Promise<Record<string, string>[]> {
  const files = await unzip(buf);

  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml");
  if (sst) for (const si of byTag(xmlDoc(sst), "si")) shared.push(byTag(si, "t").map((t) => t.textContent ?? "").join(""));

  // First sheet in workbook order → its file via the relationships; falls back to sheet1.xml.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = files.get("xl/workbook.xml");
  const rels = files.get("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const first = byTag(xmlDoc(wb), "sheet")[0];
    const rid = first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? first?.getAttribute("r:id");
    const target = byTag(xmlDoc(rels), "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheet = files.get(sheetPath) ?? files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook has no sheet to read.");

  const grid: string[][] = [];
  for (const rowEl of byTag(xmlDoc(sheet), "row")) {
    const row: string[] = [];
    for (const c of Array.from(rowEl.children).filter((e) => e.localName === "c")) {
      const at = colIndex(c.getAttribute("r") ?? "A1");
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") value = byTag(c, "t").map((t) => t.textContent ?? "").join("");
      else {
        const v = byTag(c, "v")[0]?.textContent ?? "";
        value = type === "s" ? shared[Number(v)] ?? "" : type === "b" ? (v === "1" ? "TRUE" : "FALSE") : v;
      }
      row[at] = value;
    }
    grid.push(Array.from(row, (x) => x ?? ""));
  }

  const headerAt = grid.findIndex((r) => r.some((x) => x.trim() !== ""));
  if (headerAt < 0) return [];
  const headers = grid[headerAt].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (const r of grid.slice(headerAt + 1)) {
    if (r.every((x) => !x || x.trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = (r[i] ?? "").trim();
    });
    out.push(obj);
  }
  return out;
}
