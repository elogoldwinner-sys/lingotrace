import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  widthClassName?: string;
}

export default function Modal({ open, onClose, title, children, widthClassName }: ModalProps) {
  if (!open) return null;

  // Rendered via a portal straight into <body> rather than in place, so it
  // always centers on the real viewport — some ancestors (e.g. the sticky
  // header's backdrop-blur) use CSS filter/backdrop-filter, which creates a
  // new containing block for `position: fixed` descendants and would
  // otherwise trap the modal inside that ancestor's small box instead of
  // the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 backdrop-blur-sm px-4">
      <div
        className={`card w-full ${widthClassName || "max-w-lg"} p-6 max-h-[85vh] overflow-y-auto overscroll-contain`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          <button
            onClick={onClose}
            className="text-cream-600 hover:text-navy rounded-full p-1 hover:bg-cream-300"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
