import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, RotateCcw, CalendarCheck, MessageCircle, Trophy } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { POINTS_REASON_ICONS } from "../lib/pointsReasons";
import { getDefaultRankingPeriod } from "../lib/services/classRankingsService";
import { subscribeToClasses } from "../lib/services/classesService";
import { allBuiltIn, cloneScope, getPrefs, hasClassOverride, effectiveScope } from "../lib/reasonPrefs";
import { useEffect } from "react";
import type { ClassRecord, ReasonPrefs, ReasonScope } from "../types";

const ALL = "__all__";

/** "YYYY-MM-DD" in local time, the format <input type="date"> needs. */
function msToLocalDateValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Teacher preferences page (side menu, under Dashboard): attendance marks on/off + which reasons appear when giving / deducting marks. */
export default function PreferencesPage() {
  const { t } = useTranslation();
  const { user, profile, updateTeacherReasonPrefs, updateTeacherAttendancePoints, updateTeacherWhatsapp, updateTeacherRankingPeriod } = useAuth();

  // WhatsApp number (used for parent messages)
  const [whatsapp, setWhatsapp] = useState(profile?.whatsappNumber || "");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);

  // Champions reporting period
  const defaultPeriod = getDefaultRankingPeriod();
  const [periodStart, setPeriodStart] = useState(msToLocalDateValue(profile?.rankingPeriodStart ?? defaultPeriod.start));
  const [periodEnd, setPeriodEnd] = useState(msToLocalDateValue(profile?.rankingPeriodEnd ?? defaultPeriod.end));
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodMsg, setPeriodMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setSavingWhatsapp(true);
    setWhatsappSaved(false);
    try {
      await updateTeacherWhatsapp(whatsapp.trim());
      setWhatsappSaved(true);
      setTimeout(() => setWhatsappSaved(false), 3000);
    } finally {
      setSavingWhatsapp(false);
    }
  }

  async function savePeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!periodStart || !periodEnd) return;
    if (periodEnd < periodStart) {
      setPeriodMsg({ ok: false, text: t("ranking.invalidRange") });
      return;
    }
    setSavingPeriod(true);
    setPeriodMsg(null);
    try {
      // End date is inclusive through the end of that calendar day.
      await updateTeacherRankingPeriod(
        new Date(`${periodStart}T00:00:00`).getTime(),
        new Date(`${periodEnd}T23:59:59.999`).getTime()
      );
      setPeriodMsg({ ok: true, text: t("preferences.saved") });
    } catch (err) {
      console.error("Could not save the champions period", err);
      setPeriodMsg({ ok: false, text: t("ranking.saveError") });
    } finally {
      setSavingPeriod(false);
    }
  }
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [prefs, setPrefs] = useState<ReasonPrefs>(() => getPrefs(profile));
  const [scopeId, setScopeId] = useState(ALL);
  const [positive, setPositive] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const attendanceOn = profile?.attendancePoints !== false;

  useEffect(() => {
    if (!user) return;
    return subscribeToClasses(user.uid, setClasses);
  }, [user]);

  const isClass = scopeId !== ALL;
  const ownList = isClass && hasClassOverride(prefs, scopeId);
  const editable = !isClass || ownList;
  const scope: ReasonScope = effectiveScope(prefs, isClass ? scopeId : "");
  const key = positive ? "positive" : "negative";
  const list = scope[key];

  function commit(next: ReasonPrefs) {
    setPrefs(next);
    setError(false);
    updateTeacherReasonPrefs(next).catch((err) => {
      console.error("Could not save preferences", err);
      setError(true);
    });
  }

  function withScope(update: (s: ReasonScope) => void) {
    const edited = cloneScope(scope);
    update(edited);
    commit(isClass ? { ...prefs, byClass: { ...prefs.byClass, [scopeId]: edited } } : { ...prefs, all: edited });
  }

  function toggleBuiltIn(reason: string) {
    withScope((s) => {
      const hidden = s[key].hidden;
      s[key].hidden = hidden.includes(reason) ? hidden.filter((r) => r !== reason) : [...hidden, reason];
    });
  }

  function addCustom() {
    const text = draft.trim();
    if (!text || list.custom.some((r) => r.toLowerCase() === text.toLowerCase())) return;
    withScope((s) => s[key].custom.push(text));
    setDraft("");
  }

  function removeCustom(text: string) {
    withScope((s) => (s[key].custom = s[key].custom.filter((r) => r !== text)));
  }

  function resetList() {
    withScope((s) => (s[key] = { hidden: [], custom: [] }));
  }

  function setOwnList(on: boolean) {
    const byClass = { ...prefs.byClass };
    if (on) byClass[scopeId] = cloneScope(prefs.all);
    else delete byClass[scopeId];
    commit({ ...prefs, byClass });
  }

  const className = classes.find((c) => c.id === scopeId)?.name || "";
  const tab = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
      active ? "border-gold bg-gold-50 text-gold" : "border-cream-300 text-cream-600 hover:border-gold/50"
    }`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("preferences.title")}</h1>

      <div className="card flex items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold">
            <CalendarCheck size={20} />
          </div>
          <div>
            <p className="text-base font-semibold text-navy">{t("preferences.attendanceMarks")}</p>
            <p className="text-sm text-cream-600">{t("preferences.attendanceMarksHint")}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={attendanceOn}
          onClick={() => updateTeacherAttendancePoints(!attendanceOn).catch((err) => console.error(err))}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${attendanceOn ? "bg-green-500" : "bg-cream-400"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${attendanceOn ? "start-[1.4rem]" : "start-0.5"}`} />
        </button>
      </div>

      <form onSubmit={saveWhatsapp} className="card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <MessageCircle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-navy">{t("settings.whatsappNumber")}</p>
            <p className="text-sm text-cream-600">{t("settings.whatsappHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder={t("settings.whatsappPlaceholder")}
            className="input-field max-w-xs"
          />
          <button type="submit" disabled={savingWhatsapp} className="btn-primary py-2 px-4 text-sm">
            {savingWhatsapp ? t("common.loading") : t("common.save")}
          </button>
          {whatsappSaved && <span className="text-sm font-semibold text-green-700">{t("preferences.saved")}</span>}
        </div>
      </form>

      <form onSubmit={savePeriod} className="card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Trophy size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-navy">{t("ranking.scheduleLabel")}</p>
            <p className="text-sm text-cream-600">{t("ranking.scheduleHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label-eyebrow mb-1 block">{t("ranking.startDate")}</label>
            <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="input-field w-auto" />
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">{t("ranking.endDate")}</label>
            <input type="date" required value={periodEnd} min={periodStart || undefined} onChange={(e) => setPeriodEnd(e.target.value)} className="input-field w-auto" />
          </div>
          <button type="submit" disabled={savingPeriod} className="btn-primary py-2 px-4 text-sm">
            {savingPeriod ? t("common.loading") : t("common.save")}
          </button>
        </div>
        {periodMsg && <p className={`text-sm font-semibold ${periodMsg.ok ? "text-green-700" : "text-red-600"}`}>{periodMsg.text}</p>}
      </form>

      <div className="card space-y-4 p-5">
        <div>
          <p className="mb-1 text-base font-semibold text-navy">{t("preferences.reasonsTitle")}</p>
          <p className="text-xs text-cream-600">{t("preferences.reasonsHint")}</p>
        </div>

        <div>
          <label className="label-eyebrow mb-1.5 block">{t("preferences.appliesTo")}</label>
          <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="input-field">
            <option value={ALL}>{t("preferences.allClasses")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {hasClassOverride(prefs, c.id) ? ` ★` : ""}
              </option>
            ))}
          </select>
        </div>

        {isClass && (
          <label className="flex items-start gap-2 rounded-lg border border-cream-300 bg-cream-100/60 px-3 py-2 text-sm text-navy">
            <input type="checkbox" className="mt-0.5" checked={ownList} onChange={(e) => setOwnList(e.target.checked)} />
            <span>{t("preferences.ownList", { name: className })}</span>
          </label>
        )}
        {isClass && !ownList && <p className="text-xs text-cream-600">{t("preferences.followsAll")}</p>}

        <div className="flex gap-2">
          <button type="button" className={tab(positive)} onClick={() => setPositive(true)}>
            {t("preferences.giving")}
          </button>
          <button type="button" className={tab(!positive)} onClick={() => setPositive(false)}>
            {t("preferences.deducting")}
          </button>
        </div>

        <div className={editable ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-navy">{t("preferences.builtIn")}</p>
            <div className="flex flex-wrap gap-2">
              {allBuiltIn(positive).map((r) => {
                const shown = !list.hidden.includes(r);
                const Icon = POINTS_REASON_ICONS[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleBuiltIn(r)}
                    aria-pressed={shown}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                      shown
                        ? "border-gold bg-gold-50 text-gold"
                        : "border-cream-300 text-cream-500 line-through hover:border-gold/50"
                    }`}
                  >
                    {Icon && <Icon size={14} />}
                    {t(`points.reasons.${r}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-cream-600">{t("preferences.builtInHint")}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-navy">{t("preferences.myReasons")}</p>
            <div className="flex flex-wrap gap-2">
              {list.custom.length === 0 && <span className="text-xs text-cream-600">{t("preferences.noneYet")}</span>}
              {list.custom.map((text) => (
                <span
                  key={text}
                  className="flex items-center gap-1 rounded-lg border border-gold bg-gold-50 py-1 ps-3 pe-1 text-sm font-semibold text-gold"
                >
                  {text}
                  <button type="button" onClick={() => removeCustom(text)} title={t("preferences.remove")} className="rounded-full p-1 hover:bg-gold/10">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                maxLength={60}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder={t("preferences.newReasonPlaceholder")}
                className="input-field"
              />
              <button type="button" onClick={addCustom} disabled={!draft.trim()} className="btn-primary shrink-0 px-3 py-2 text-sm disabled:opacity-50">
                <Plus size={15} />
                {t("preferences.add")}
              </button>
            </div>
          </div>

          <button type="button" onClick={resetList} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream-700 hover:text-navy">
            <RotateCcw size={13} />
            {t("preferences.reset")}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{t("preferences.saveError")}</p>}
      </div>
    </div>
  );
}
