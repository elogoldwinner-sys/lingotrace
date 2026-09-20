import { useMemo } from "react";
import { sanitizeRichHtml } from "../../lib/richText";

/**
 * Shows an announcement/note body. Entries written with the formatting
 * toolbar carry a sanitized HTML copy (`html`) — that is what's displayed,
 * re-sanitized here on every render since the data is readable and writable
 * by any account. Older entries have only plain `text`, shown exactly as
 * they always were.
 */
export default function RichText({
  html,
  text,
  className = "",
  plainClassName,
}: {
  html?: string;
  text?: string;
  /** Applied to the formatted version (and to the plain one too unless `plainClassName` is given). */
  className?: string;
  /** Classes for the legacy plain-text version, when it needs different ones (e.g. to keep line breaks). */
  plainClassName?: string;
}) {
  const safeHtml = useMemo(() => (html ? sanitizeRichHtml(html) : ""), [html]);

  if (safeHtml) {
    return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
  }
  if (!text) return null;
  return <p className={plainClassName ?? className}>{text}</p>;
}
