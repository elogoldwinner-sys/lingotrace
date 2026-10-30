import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Printer, Shuffle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToStudents } from "../../lib/services/studentsService";
import { downloadCardItemsZip, downloadCardsZip, printCardItems, printCards } from "../../lib/cardExport";
import { CARD_ARTS, planClassCards } from "../../lib/numberedCards";
import type { ClassRecord, StudentRecord } from "../../types";

/**
 * Teacher preferences → Numbered Heads cards. Two things live here:
 *  - the four blank number cards (print / ZIP), previously inside the
 *    Numbered Heads window, and
 *  - one card per student of a class with their name written on it (in the app language), all downloadable as a
 *    single ZIP or printed in one go.
 */
export default function NumberedCardsSettings({ classes }: { classes: ClassRecord[] }) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const logoUrl = profile?.schoolLogoURL;

  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Start on the first class once the list has loaded (and recover if the chosen class disappears).
  useEffect(() => {
    if (!classes.some((c) => c.id === classId)) setClassId(classes[0]?.id || "");
  }, [classes, classId]);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    return subscribeToStudents(classId, setStudents);
  }, [classId]);

  const plan = useMemo(() => planClassCards(students, i18n.language), [students, i18n.language]);
  const className = classes.find((c) => c.id === classId)?.name || "";

  async function run(key: string, action: () => Promise<{ logoApplied: boolean }>) {
    setBusy(key);
    setMessage(null);
    try {
      const { logoApplied } = await action();
      if (!logoApplied) setMessage({ ok: false, text: t("numberedHeads.logoFailed") });
    } catch (err) {
      console.error("Card export failed", err);
      setMessage({ ok: false, text: t("numberedHeads.cardError") });
    } finally {
      setBusy("");
    }
  }

  const cardsTitle = t("numberedHeads.cardsTitle");
  const classCardsReady = plan.items.length > 0;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Shuffle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-navy">{t("preferences.cardsTitle")}</p>
          <p className="text-sm text-cream-600">{t("preferences.cardsHint")}</p>
        </div>
      </div>

      {/* Class cards with student names */}
      <div className="space-y-2 rounded-lg border border-cream-300 bg-cream-100/60 p-3">
        <p className="text-sm font-semibold text-navy">{t("preferences.classCardsTitle")}</p>
        <p className="text-xs text-cream-600">{t("preferences.classCardsHint")}</p>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field" aria-label={t("preferences.classCardsTitle")}>
          {classes.length === 0 && <option value="">{t("preferences.noClasses")}</option>}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {classId && (
          <p className="text-xs text-cream-600">
            {t("preferences.cardsCount", { count: plan.items.length })}
            {plan.skipped.length > 0 && ` ${t("preferences.cardsSkipped", { count: plan.skipped.length })}`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!classCardsReady || !!busy}
            onClick={() => run("classZip", () => downloadCardItemsZip(plan.items, logoUrl, `${t("preferences.classCardsZip")} - ${className}`))}
            className="btn-primary py-2 px-4 text-sm disabled:opacity-60"
          >
            <Download size={15} />
            {t("preferences.downloadClassCards")}
          </button>
          <button
            type="button"
            disabled={!classCardsReady || !!busy}
            onClick={() => run("classPrint", () => printCardItems(plan.items, logoUrl, `${cardsTitle} - ${className}`))}
            className="btn-secondary py-2 px-4 text-sm disabled:opacity-60"
          >
            <Printer size={15} />
            {t("preferences.printClassCards")}
          </button>
        </div>
      </div>

      {/* The four blank number cards (moved here from the Numbered Heads window) */}
      <div className="space-y-2 rounded-lg border border-cream-300 bg-cream-100/60 p-3">
        <p className="text-sm font-semibold text-navy">{t("preferences.blankCardsTitle")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("print", () => printCards(CARD_ARTS, logoUrl, cardsTitle))}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-60"
          >
            <Printer size={14} />
            {t("numberedHeads.printCards")}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("zip", () => downloadCardsZip(CARD_ARTS, logoUrl, t("numberedHeads.zipName")))}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-60"
          >
            <Download size={14} />
            {t("numberedHeads.downloadAll")}
          </button>
        </div>
      </div>

      {!logoUrl && <p className="text-[11px] text-cream-600">{t("numberedHeads.noLogoHint")}</p>}
      {busy && <p className="text-[11px] text-cream-600">{t("common.loading")}</p>}
      {message && <p className={`text-xs font-semibold ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
    </div>
  );
}
