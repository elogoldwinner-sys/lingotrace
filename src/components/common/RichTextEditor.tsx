import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Highlighter,
  Link as LinkIcon,
  RemoveFormatting,
  PilcrowLeft,
  PilcrowRight,
} from "lucide-react";
import { explicitDirectionAt, isRichHtmlEmpty, sanitizeRichHtml, setBlockDirection } from "../../lib/richText";
import { normalizeAnnouncementUrl } from "../../lib/services/announcementsService";

const TEXT_COLORS = [
  { key: "gray", value: "#4b5563" },
  { key: "red", value: "#dc2626" },
  { key: "orange", value: "#ea580c" },
  { key: "green", value: "#16a34a" },
  { key: "blue", value: "#2563eb" },
  { key: "purple", value: "#7c3aed" },
];

const HIGHLIGHTS = [
  { key: "yellow", value: "#fef08a" },
  { key: "green", value: "#bbf7d0" },
  { key: "blue", value: "#bfdbfe" },
  { key: "pink", value: "#fbcfe8" },
  { key: "none", value: "transparent" },
];

type ActiveState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  ul: boolean;
  ol: boolean;
  heading: boolean;
  /** Explicit text direction of the paragraph under the caret (null = follows its text). */
  dir: "ltr" | "rtl" | null;
};
const NO_ACTIVE: ActiveState = {
  bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, heading: false, dir: null,
};

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A small formatting editor for announcements and notes: bold / italic /
 * underline / strike-through, a heading, bullet & numbered lists, alignment,
 * text color, highlight, links and "clear formatting".
 *
 * `value` and `onChange` are HTML strings (sanitized on the way out — see
 * lib/richText.ts); `onChange("")` is sent while the editor holds no text.
 * Built on the browser's own editing commands instead of a heavy editor
 * library, so it adds nothing to the bundle and Arabic/English typing, IME
 * and spell-check all behave natively.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-[7rem]",
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [active, setActive] = useState<ActiveState>(NO_ACTIVE);
  const [menu, setMenu] = useState<null | "color" | "highlight">(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Load `value` into the editor on mount, and again whenever the parent
  // changes it from outside (e.g. clearing the form after saving). Changes
  // that came from typing are skipped so the caret never jumps.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmitted.current) {
      el.innerHTML = sanitizeRichHtml(value);
      lastEmitted.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  function refreshActive() {
    const el = editorRef.current;
    const selection = window.getSelection();
    if (!el || !selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
      setActive(NO_ACTIVE);
      return;
    }
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        heading: /^h[23]$/i.test(String(document.queryCommandValue("formatBlock")).replace(/[<>]/g, "")),
        dir: explicitDirectionAt(el, selection.anchorNode),
      });
    } catch {
      setActive(NO_ACTIVE);
    }
  }

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, []);

  // Close the color menus when clicking anywhere outside the toolbar.
  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (!toolbarRef.current?.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  function emit() {
    const el = editorRef.current;
    if (!el) return;
    // A browser leaves a lone <br> behind once everything is deleted; drop it
    // so the placeholder comes back (but never touch an empty list the
    // teacher has just started).
    if (/^(<br>|<(p|div)><br><\/(p|div)>)?$/i.test(el.innerHTML)) el.innerHTML = "";
    const html = sanitizeRichHtml(el.innerHTML);
    const next = isRichHtmlEmpty(html) ? "" : html;
    lastEmitted.current = next;
    onChange(next);
  }

  function run(command: string, arg?: string, css = false) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("styleWithCSS", false, css ? "true" : "false");
    document.execCommand(command, false, arg);
    emit();
    refreshActive();
  }

  function toggleHeading() {
    run("formatBlock", active.heading ? "<p>" : "<h3>");
  }

  // Clicking the active direction again returns the paragraph to "automatic".
  function setDirection(dir: "ltr" | "rtl") {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const next = active.dir === dir ? null : dir;
    const rangeOf = () => {
      const selection = window.getSelection();
      return selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    };
    const range = rangeOf();
    if (!range) return;
    if (!setBlockDirection(el, range, next)) {
      // Loose text with no paragraph around it yet — wrap it, then retry.
      document.execCommand("formatBlock", false, "<p>");
      const wrapped = rangeOf();
      if (wrapped) setBlockDirection(el, wrapped, next);
    }
    emit();
    refreshActive();
  }

  function applyLink() {
    const el = editorRef.current;
    if (!el) return;
    const selection = window.getSelection();
    const saved = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    const input = window.prompt(t("richText.linkPrompt"), "https://");
    if (!input || !input.trim()) return;
    const href = normalizeAnnouncementUrl(input);
    if (!href) {
      window.alert(t("richText.linkInvalid"));
      return;
    }
    el.focus();
    if (saved && selection) {
      selection.removeAllRanges();
      selection.addRange(saved);
    }
    if (selection && selection.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${escapeAttr(href)}">${escapeAttr(href)}</a>`);
    } else {
      document.execCommand("createLink", false, href);
    }
    emit();
  }

  function clearFormatting() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
    // removeFormat leaves block types (headings, lists) alone.
    if (active.heading) document.execCommand("formatBlock", false, "<p>");
    emit();
    refreshActive();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (html) {
      document.execCommand("insertHTML", false, sanitizeRichHtml(html, { stripStyles: true }));
    } else {
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    }
    emit();
  }

  const btn = (isActive = false) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
      isActive ? "bg-navy text-cream-100" : "text-navy hover:bg-cream-300"
    }`;

  // Buttons must not take focus from the editor, or the text selection they act on is lost.
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  const Divider = () => <span className="mx-1 h-5 w-px bg-cream-400" aria-hidden="true" />;

  return (
    <div className="rich-editor-box">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={t("richText.toolbar")}
        className="relative flex flex-wrap items-center gap-0.5 border-b border-cream-300 px-1.5 py-1"
      >
        <button type="button" title={t("richText.bold")} aria-label={t("richText.bold")} aria-pressed={active.bold}
          onMouseDown={keepSelection} onClick={() => run("bold")} className={btn(active.bold)}>
          <Bold size={16} />
        </button>
        <button type="button" title={t("richText.italic")} aria-label={t("richText.italic")} aria-pressed={active.italic}
          onMouseDown={keepSelection} onClick={() => run("italic")} className={btn(active.italic)}>
          <Italic size={16} />
        </button>
        <button type="button" title={t("richText.underline")} aria-label={t("richText.underline")} aria-pressed={active.underline}
          onMouseDown={keepSelection} onClick={() => run("underline")} className={btn(active.underline)}>
          <Underline size={16} />
        </button>
        <button type="button" title={t("richText.strike")} aria-label={t("richText.strike")} aria-pressed={active.strike}
          onMouseDown={keepSelection} onClick={() => run("strikeThrough")} className={btn(active.strike)}>
          <Strikethrough size={16} />
        </button>

        <Divider />

        <button type="button" title={t("richText.heading")} aria-label={t("richText.heading")} aria-pressed={active.heading}
          onMouseDown={keepSelection} onClick={toggleHeading} className={btn(active.heading)}>
          <Heading2 size={16} />
        </button>
        <button type="button" title={t("richText.bulletList")} aria-label={t("richText.bulletList")} aria-pressed={active.ul}
          onMouseDown={keepSelection} onClick={() => run("insertUnorderedList")} className={btn(active.ul)}>
          <List size={16} />
        </button>
        <button type="button" title={t("richText.numberedList")} aria-label={t("richText.numberedList")} aria-pressed={active.ol}
          onMouseDown={keepSelection} onClick={() => run("insertOrderedList")} className={btn(active.ol)}>
          <ListOrdered size={16} />
        </button>

        <Divider />

        <button type="button" title={t("richText.alignLeft")} aria-label={t("richText.alignLeft")}
          onMouseDown={keepSelection} onClick={() => run("justifyLeft", undefined, true)} className={btn()}>
          <AlignLeft size={16} />
        </button>
        <button type="button" title={t("richText.alignCenter")} aria-label={t("richText.alignCenter")}
          onMouseDown={keepSelection} onClick={() => run("justifyCenter", undefined, true)} className={btn()}>
          <AlignCenter size={16} />
        </button>
        <button type="button" title={t("richText.alignRight")} aria-label={t("richText.alignRight")}
          onMouseDown={keepSelection} onClick={() => run("justifyRight", undefined, true)} className={btn()}>
          <AlignRight size={16} />
        </button>

        <button type="button" title={t("richText.ltr")} aria-label={t("richText.ltr")} aria-pressed={active.dir === "ltr"}
          onMouseDown={keepSelection} onClick={() => setDirection("ltr")} className={btn(active.dir === "ltr")}>
          <PilcrowRight size={16} />
        </button>
        <button type="button" title={t("richText.rtl")} aria-label={t("richText.rtl")} aria-pressed={active.dir === "rtl"}
          onMouseDown={keepSelection} onClick={() => setDirection("rtl")} className={btn(active.dir === "rtl")}>
          <PilcrowLeft size={16} />
        </button>

        <Divider />

        <button type="button" title={t("richText.textColor")} aria-label={t("richText.textColor")} aria-expanded={menu === "color"}
          onMouseDown={keepSelection} onClick={() => setMenu(menu === "color" ? null : "color")} className={btn(menu === "color")}>
          <Palette size={16} />
        </button>
        <button type="button" title={t("richText.highlight")} aria-label={t("richText.highlight")} aria-expanded={menu === "highlight"}
          onMouseDown={keepSelection} onClick={() => setMenu(menu === "highlight" ? null : "highlight")} className={btn(menu === "highlight")}>
          <Highlighter size={16} />
        </button>
        <button type="button" title={t("richText.link")} aria-label={t("richText.link")}
          onMouseDown={keepSelection} onClick={applyLink} className={btn()}>
          <LinkIcon size={16} />
        </button>
        <button type="button" title={t("richText.clear")} aria-label={t("richText.clear")}
          onMouseDown={keepSelection} onClick={clearFormatting} className={btn()}>
          <RemoveFormatting size={16} />
        </button>

        {menu && (
          <div className="absolute start-1.5 top-full z-20 mt-1 flex items-center gap-1.5 rounded-lg border border-cream-400 bg-white p-2 shadow-lg">
            {(menu === "color" ? TEXT_COLORS : HIGHLIGHTS).map((swatch) => (
              <button
                key={swatch.key}
                type="button"
                title={t(`richText.colors.${swatch.key}`)}
                aria-label={t(`richText.colors.${swatch.key}`)}
                onMouseDown={keepSelection}
                onClick={() => {
                  run(menu === "color" ? "foreColor" : "hiliteColor", swatch.value, true);
                  setMenu(null);
                }}
                className={`h-6 w-6 rounded-full border border-cream-400 ${
                  swatch.value === "transparent"
                    ? "bg-white bg-[linear-gradient(135deg,transparent_45%,#dc2626_45%,#dc2626_55%,transparent_55%)]"
                    : ""
                }`}
                style={swatch.value === "transparent" ? undefined : { backgroundColor: swatch.value }}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        dir="auto"
        data-placeholder={placeholder}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={emit}
        onPaste={handlePaste}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        className={`rich-editor ${minHeightClass} max-h-72 overflow-y-auto px-3.5 py-2.5 text-navy focus:outline-none`}
      />
    </div>
  );
}
