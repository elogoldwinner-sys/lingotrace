import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, Link2 } from "lucide-react";
import Modal from "../common/Modal";
import { drawQr, canvasToPngBlob } from "../../lib/qr/qr";

interface QrInviteModalProps {
  open: boolean;
  onClose: () => void;
  /** The parent invite link the QR code points to. */
  url: string;
  className: string;
}

type Done = "" | "image" | "link" | "download";

/** Shows the class's parent-invite QR code, with copy-as-image, download and copy-link actions. */
export default function QrInviteModal({ open, onClose, url, className }: QrInviteModalProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState<Done>("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !url || !canvasRef.current) return;
    drawQr(canvasRef.current, url, className);
  }, [open, url, className]);

  function flash(kind: Done) {
    setDone(kind);
    setTimeout(() => setDone(""), 2000);
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${className || "class"}-parent-invite-qr.png`;
    a.click();
    flash("download");
  }

  async function copyImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError("");
    try {
      // Browsers without image-clipboard support (older Firefox, some in-app
      // browsers) fall back to downloading the PNG so the teacher still gets it.
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        download();
        return;
      }
      const blob = await canvasToPngBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("image");
    } catch {
      setError(t("classes.qrCopyFailed"));
    }
  }

  async function copyLink() {
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      flash("link");
    } catch {
      setError(t("classes.qrCopyFailed"));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("classes.qrTitle")} widthClassName="max-w-sm">
      <div className="flex flex-col items-center gap-2.5">
        <canvas ref={canvasRef} className="w-full max-w-[210px] rounded-xl border border-cream-400/70 bg-white" />
        <p className="text-center text-xs text-cream-600">{t("classes.qrHint")}</p>
        {error && <p className="text-center text-xs font-semibold text-red-600">{error}</p>}
        <div className="grid w-full grid-cols-1 gap-2">
          <button type="button" onClick={copyImage} className="btn-primary flex items-center justify-center gap-2">
            {done === "image" ? <Check size={16} /> : <Copy size={16} />}
            {done === "image" ? t("classes.copied") : t("classes.qrCopyImage")}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={download} className="btn-secondary flex items-center justify-center gap-2">
              {done === "download" ? <Check size={16} /> : <Download size={16} />}
              {t("classes.qrDownload")}
            </button>
            <button type="button" onClick={copyLink} className="btn-secondary flex items-center justify-center gap-2">
              {done === "link" ? <Check size={16} /> : <Link2 size={16} />}
              {done === "link" ? t("classes.copied") : t("classes.qrCopyLink")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
