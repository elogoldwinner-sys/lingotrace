import { whatsappLink } from "./whatsapp";

/**
 * WhatsApp cannot be sent silently from a web page — only WhatsApp's own Business API can do that. The closest a
 * web app gets is opening the parent's chat with the message already typed, so the teacher only taps "Send".
 *
 * Browsers block a new tab opened after an `await`, so callers open a blank tab FIRST (synchronously inside the
 * click) and point it at the chat once the message is ready, or close it if something failed.
 */
export function openPendingWhatsappTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function finishWhatsappTab(win: Window | null, number: string, text: string): void {
  const url = `${whatsappLink(number)}?text=${encodeURIComponent(text)}`;
  if (win && !win.closed) win.location.href = url;
  else window.open(url, "_blank");
}

export function buildNoteAlertText(opts: {
  header: string;
  positive: boolean;
  label: string;
  content: string;
}): string {
  return `${opts.header}\n${opts.positive ? "✅" : "⚠️"} ${opts.label}\n${opts.content}`;
}
