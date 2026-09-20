import DOMPurify from "dompurify";

/**
 * Formatted text (announcements and notes) is stored as a small, sanitized
 * subset of HTML next to a plain-text copy of the same content:
 *
 *   announcements: `textHtml`    + `text`
 *   notes:         `contentHtml` + `content`
 *
 * The plain-text copy keeps everything that doesn't understand formatting
 * working exactly as before (the parent report e-mail, and every entry
 * written before formatting existed, which has no HTML at all).
 *
 * Students and parents read what a teacher wrote, and any Google account can
 * become a teacher — so HTML is NEVER trusted: it is passed through
 * `sanitizeRichHtml` both when it is saved and again every time it is shown.
 */

const ALLOWED_TAGS = [
  "b", "strong", "i", "em", "u", "s", "strike", "del", "br",
  "p", "div", "span", "h2", "h3", "ul", "ol", "li", "a",
];
const ALLOWED_ATTR = ["href", "style", "dir", "target", "rel"];
// Only ordinary links: no javascript:, data:, relative URLs, etc.
const ALLOWED_URI = /^(?:https?:|mailto:|tel:)/i;

const BLOCK_TAGS = new Set(["P", "DIV", "H2", "H3", "UL", "OL", "LI"]);

const COLOR_VALUE = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%/]+\)|[a-z]{3,20})$/i;

/** Keeps only a handful of harmless inline style properties, with strictly validated values. */
function filterStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const index = declaration.indexOf(":");
    if (index === -1) continue;
    const prop = declaration.slice(0, index).trim().toLowerCase();
    const value = declaration.slice(index + 1).trim().toLowerCase();
    if (!value) continue;
    if ((prop === "color" || prop === "background-color") && COLOR_VALUE.test(value)) {
      kept.push(`${prop}: ${value}`);
    } else if (prop === "text-align" && /^(left|right|center|justify|start|end)$/.test(value)) {
      kept.push(`${prop}: ${value}`);
    } else if (prop === "font-weight" && /^(bold|bolder|[6-9]00)$/.test(value)) {
      kept.push("font-weight: bold");
    } else if (prop === "font-style" && value === "italic") {
      kept.push("font-style: italic");
    } else if (prop === "text-decoration" || prop === "text-decoration-line") {
      const parts = value.split(/\s+/).filter((part) => part === "underline" || part === "line-through");
      if (parts.length > 0) kept.push(`text-decoration: ${parts.join(" ")}`);
    }
  }
  return kept.join("; ");
}

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;

    if (node.hasAttribute("style")) {
      const filtered = filterStyle(node.getAttribute("style") || "");
      if (filtered) node.setAttribute("style", filtered);
      else node.removeAttribute("style");
    }

    if (node.hasAttribute("dir") && !/^(ltr|rtl|auto)$/i.test(node.getAttribute("dir") || "")) {
      node.removeAttribute("dir");
    }
    // Every block picks its own direction from its first letter, so an
    // Arabic paragraph and an English one can sit in the same announcement.
    if (BLOCK_TAGS.has(node.tagName) && !node.hasAttribute("dir")) {
      node.setAttribute("dir", "auto");
    }

    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Returns a safe HTML string built only from the allowed formatting tags.
 * `stripStyles` also drops every inline style (colors, alignment) — used for
 * pasted content, so text copied from a dark web page can't arrive as
 * invisible white-on-white.
 */
export function sanitizeRichHtml(html: string, options: { stripStyles?: boolean } = {}): string {
  if (!html) return "";
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    // DOMPurify tests every attribute NOT on its "URI-safe" list against
    // ALLOWED_URI_REGEXP, which would strip dir="rtl" — so list it explicitly.
    ADD_URI_SAFE_ATTR: ["dir"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_ATTR: options.stripStyles ? ["style"] : [],
  });
}

function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
}

/**
 * Plain-text version of formatted HTML (line breaks kept, list items become
 * "• item" / "1. item"). This is what gets stored in `text` / `content`.
 */
export function richHtmlToPlainText(html: string): string {
  if (!html) return "";
  const root = parse(sanitizeRichHtml(html));
  let out = "";

  const ensureLineBreak = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };

  const walk = (node: Node, listIndex?: { n: number; ordered: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;

    if (tag === "BR") {
      out += "\n";
      return;
    }
    if (tag === "UL" || tag === "OL") {
      ensureLineBreak();
      const state = { n: 0, ordered: tag === "OL" };
      node.childNodes.forEach((child) => walk(child, state));
      ensureLineBreak();
      return;
    }
    if (tag === "LI") {
      ensureLineBreak();
      if (listIndex) {
        listIndex.n += 1;
        out += listIndex.ordered ? `${listIndex.n}. ` : "• ";
      }
      node.childNodes.forEach((child) => walk(child));
      ensureLineBreak();
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      ensureLineBreak();
      node.childNodes.forEach((child) => walk(child));
      ensureLineBreak();
      return;
    }
    node.childNodes.forEach((child) => walk(child));
  };

  root.childNodes.forEach((child) => walk(child));
  return out.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the formatted HTML contains no visible text at all. */
export function isRichHtmlEmpty(html: string): boolean {
  return richHtmlToPlainText(html).length === 0;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turns an old plain-text entry into HTML, so it can be opened in the editor with its line breaks intact. */
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>"))
    .join("");
}

const BLOCK_SELECTOR = "p,div,li,h2,h3";

/** The innermost blocks (paragraphs, list items, headings) that a selection touches. */
export function blocksInRange(root: HTMLElement, range: Range): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (node) => !node.querySelector(BLOCK_SELECTOR) && range.intersectsNode(node)
  );
}

/**
 * Sets the reading direction (left-to-right / right-to-left) of every block
 * the selection touches; `null` removes the explicit direction so the block
 * goes back to picking it from its first letter. A list item also sets its
 * list, so the bullets/numbers move to the matching side. Returns false when
 * the selection isn't inside any block yet (loose text), so the caller can
 * wrap it in a paragraph first.
 */
export function setBlockDirection(root: HTMLElement, range: Range, dir: "ltr" | "rtl" | null): boolean {
  const blocks = blocksInRange(root, range);
  if (blocks.length === 0) return false;
  for (const block of blocks) {
    const targets = [block];
    const list = block.tagName === "LI" ? block.parentElement : null;
    if (list && list !== root) targets.push(list);
    for (const target of targets) {
      if (dir) target.setAttribute("dir", dir);
      else target.removeAttribute("dir");
    }
  }
  return true;
}

/** The explicit direction of the block containing `node`, or null when it follows its text. */
export function explicitDirectionAt(root: HTMLElement, node: Node | null): "ltr" | "rtl" | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.matches(BLOCK_SELECTOR)) {
      const dir = current.getAttribute("dir");
      if (dir === "ltr" || dir === "rtl") return dir;
      return null;
    }
    current = current.parentNode;
  }
  return null;
}
