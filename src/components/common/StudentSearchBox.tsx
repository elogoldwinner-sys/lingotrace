import { ArrowDownAZ, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Search-by-name box for a class roster (during a session and while taking attendance, in normal and full-screen mode). */
export default function StudentSearchBox({
  value,
  onChange,
  shown,
  total,
  alpha,
  onToggleAlpha,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Students matching the search / students in the class — shown while a search is active. */
  shown: number;
  total: number;
  /** Alphabetical order is on. */
  alpha: boolean;
  onToggleAlpha: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-cream-600" />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onChange("");
          }}
          placeholder={t("studentSearch.placeholder", "Search student name…")}
          aria-label={t("studentSearch.placeholder", "Search student name…")}
          className="input-field w-full !ps-9 !pe-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("studentSearch.clear", "Clear search")}
            className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-cream-600 hover:bg-cream-300"
          >
            <X size={14} />
          </button>
        )}
      </div>
        <button
          type="button"
          onClick={onToggleAlpha}
          aria-pressed={alpha}
          title={alpha ? t("studentSearch.sortOn", "Sorted A–Z — click to restore the class order") : t("studentSearch.sortOff", "Sort students alphabetically")}
          className={`pill border shrink-0 gap-1.5 px-3 py-2 text-sm font-semibold transition ${
            alpha ? "border-gold bg-gold-50 text-navy" : "border-cream-400 bg-white text-cream-700 hover:border-gold/60"
          }`}
        >
          <ArrowDownAZ size={16} />
          {t("studentSearch.sortLabel", "A–Z")}
        </button>
      </div>
      {value.trim() && (
        <p className="mt-1 text-xs text-cream-600" aria-live="polite">
          {shown === 0 ? t("studentSearch.none", "No student matches this search.") : t("studentSearch.count", "{{shown}} of {{total}} students", { shown, total })}
        </p>
      )}
    </div>
  );
}
