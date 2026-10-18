import templateUrl from "../../assets/certificate/template.pdf?url";
import { appendOverlayUpdate } from "./pdfOverlay";
import { renderCertificateOverlays, type CertificateRenderData } from "./render";
import { buildZip } from "./zip";

export type { CertificateRenderData, CertificateBadge } from "./render";

/** Object numbers of the blank content stream and Info dictionary inside src/assets/certificate/template.pdf. */
const TEMPLATE_SLOTS = { contentObj: 10, infoObj: 2 };

let templatePromise: Promise<Uint8Array> | null = null;

function getTemplate(): Promise<Uint8Array> {
  if (!templatePromise) {
    templatePromise = fetch(templateUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Certificate template could not be loaded (${res.status}).`);
        return new Uint8Array(await res.arrayBuffer());
      })
      .catch((err) => {
        templatePromise = null;
        throw err;
      });
  }
  return templatePromise;
}

/** One finished A4 certificate as PDF bytes: the untouched template art + this student's text on top. */
export async function buildCertificatePdf(data: CertificateRenderData): Promise<Uint8Array> {
  const [template, overlays] = await Promise.all([getTemplate(), renderCertificateOverlays(data)]);
  return appendOverlayUpdate(template, TEMPLATE_SLOTS, overlays, data.studentName.trim() || "Certificate");
}

/** Turns a student's name into a safe file name (keeps Arabic and other scripts, drops characters Windows/macOS reject). */
export function safeFileName(name: string, fallback = "Certificate"): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

function saveBlob(bytes: Uint8Array, mime: string, fileName: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Downloads the certificate(s). One student → "<Student name>.pdf". Several students → a single
 * "<zipLabel>.zip" holding one "<Student name>.pdf" per student (browsers block or nag about many
 * simultaneous downloads, and a zip also works on phones/tablets).
 */
export async function downloadCertificates(
  items: CertificateRenderData[],
  zipLabel = "Certificates",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (items.length === 0) return;
  const used = new Map<string, number>();
  const entries: { name: string; data: Uint8Array }[] = [];

  for (let i = 0; i < items.length; i++) {
    const data = await buildCertificatePdf(items[i]);
    const base = safeFileName(items[i].studentName);
    const n = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), n);
    entries.push({ name: `${n > 1 ? `${base} (${n})` : base}.pdf`, data });
    onProgress?.(i + 1, items.length);
  }

  if (entries.length === 1) saveBlob(entries[0].data, "application/pdf", entries[0].name);
  else saveBlob(buildZip(entries), "application/zip", `${safeFileName(zipLabel, "Certificates")}.zip`);
}
