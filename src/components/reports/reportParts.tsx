import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import type { KindFilter, Period, Totals } from "../../lib/reports/pointsStats";

/** Renders its children into <body> so they can be printed on their own (see .lt-print-root in index.css). */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  return createPortal(<div className="lt-print-root">{children}</div>, document.body);
}

/** Opens the browser's print dialog (which also offers "Save as PDF"), naming the file after the report. */
export function printReport(title: string) {
  const previous = document.title;
  document.title = title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

export function ReportHeader({
  title,
  lines,
  logo,
}: {
  title: string;
  lines: { label: string; value: string }[];
  logo?: string;
}) {
  return (
    <div className="lt-report-head">
      {logo && <img className="lt-report-logo" src={logo} alt="" />}
      <div>
        <h1>{title}</h1>
        <div className="lt-report-meta">
          {lines.map((l) => (
            <div key={l.label}>
              {l.label}: <b>{l.value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatCards({ totals, extra }: { totals: Totals; extra?: { label: string; value: string | number } }) {
  const { t } = useTranslation();
  return (
    <div className="lt-cards">
      <div className="lt-stat">
        <span>{t("reports.gained")}</span>
        <b className="lt-pos">+{totals.gained}</b>
      </div>
      <div className="lt-stat">
        <span>{t("reports.lost")}</span>
        <b className="lt-neg">−{totals.lost}</b>
      </div>
      <div className="lt-stat">
        <span>{t("reports.net")}</span>
        <b className={totals.net >= 0 ? "lt-pos" : "lt-neg"}>
          {totals.net > 0 ? "+" : totals.net < 0 ? "−" : ""}
          {Math.abs(totals.net)}
        </b>
      </div>
      <div className="lt-stat">
        <span>{extra?.label ?? t("reports.records")}</span>
        <b>{extra?.value ?? totals.count}</b>
      </div>
    </div>
  );
}

export function PrintedOn() {
  const { t } = useTranslation();
  return <p className="lt-foot">{t("reports.printedOn", { date: format(new Date(), "yyyy-MM-dd HH:mm") })} · LingoTrace</p>;
}

/** Period (entire / custom dates), gained-lost filter and the print button — shared by both report windows. */
export function ReportControls({
  period,
  onPeriod,
  kind,
  onKind,
  onPrint,
  printDisabled,
  children,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  onPrint: () => void;
  printDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
      active ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
    }`;
  const kinds: { value: KindFilter; label: string }[] = [
    { value: "both", label: t("reports.kindBoth") },
    { value: "gained", label: t("reports.kindGained") },
    { value: "lost", label: t("reports.kindLost") },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-cream-400 bg-cream-100/60 p-3">
      {children}
      <div>
        <label className="label-eyebrow mb-1 block">{t("reports.period")}</label>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={chip(period.mode === "all")} onClick={() => onPeriod({ ...period, mode: "all" })}>
            {t("reports.periodAll")}
          </button>
          <button type="button" className={chip(period.mode === "custom")} onClick={() => onPeriod({ ...period, mode: "custom" })}>
            {t("reports.periodCustom")}
          </button>
          {period.mode === "custom" && (
            <>
              <div>
                <label className="label-eyebrow mb-0.5 block text-[10px]">{t("reports.from")}</label>
                <input
                  type="date"
                  value={period.startDate}
                  onChange={(e) => onPeriod({ ...period, startDate: e.target.value })}
                  className="input-field w-auto"
                />
              </div>
              <div>
                <label className="label-eyebrow mb-0.5 block text-[10px]">{t("reports.to")}</label>
                <input
                  type="date"
                  value={period.endDate}
                  min={period.startDate || undefined}
                  onChange={(e) => onPeriod({ ...period, endDate: e.target.value })}
                  className="input-field w-auto"
                />
              </div>
            </>
          )}
        </div>
        {period.mode === "custom" && period.startDate > period.endDate && (
          <p className="mt-1 text-xs text-red-600">{t("reports.badRange")}</p>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <label className="label-eyebrow mb-1 block">{t("reports.show")}</label>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button key={k.value} type="button" className={chip(kind === k.value)} onClick={() => onKind(k.value)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onPrint} disabled={printDisabled} className="btn-primary py-2 px-4 text-sm disabled:opacity-50">
          <Printer size={16} />
          {t("reports.print")}
        </button>
      </div>
    </div>
  );
}
