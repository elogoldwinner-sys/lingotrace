import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import { useAuth } from "../../contexts/AuthContext";
import { allFeaturesOff, allFeaturesOn, FEATURE_KEYS } from "../../lib/features";
import { saveEntitlements } from "../../lib/services/entitlementsService";
import { toMillis } from "../../lib/timestamps";
import { isActiveTicket, useAdminData } from "./useAdminData";

export function PlanPill({ plan }: { plan: "free" | "paid" | undefined }) {
  const { t } = useTranslation();
  return plan === "paid" ? (
    <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-white">{t("adm.planPaid", "Paid")}</span>
  ) : (
    <span className="rounded-full bg-cream-300 px-2.5 py-0.5 text-xs font-bold text-cream-700">{t("adm.planFree", "Free")}</span>
  );
}

export default function AdminSchoolsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { schools, ents, tickets, loading, error, reload } = useAdminData();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return schools.filter((s) => !needle || `${s.name} ${s.principalName} ${s.principalEmail}`.toLowerCase().includes(needle));
  }, [schools, q]);

  const allPicked = rows.length > 0 && rows.every((s) => picked.has(s.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function applyPreset(kind: "paid" | "free") {
    const targets = schools.filter((s) => picked.has(s.id));
    if (!targets.length || !user?.email) return;
    const label = kind === "paid" ? t("adm.presetPaid", "Paid preset (everything on)") : t("adm.presetFree", "Free preset (basic only)");
    if (!window.confirm(`${label} → ${targets.length} ${t("adm.schoolsWord", "school(s)")}?`)) return;
    setBusy(true);
    setMsg("");
    try {
      for (const s of targets) {
        await saveEntitlements(s, { plan: kind, features: kind === "paid" ? allFeaturesOn() : allFeaturesOff() }, user.email, `${label} (bulk)`);
      }
      setPicked(new Set());
      await reload();
      setMsg(`${t("sp.saved", "Saved")}: ${targets.length}`);
    } catch (err) {
      console.error("Bulk preset failed", err);
      setMsg(t("sp.actionError", "That didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("adm.schoolsTitle", "Schools")}</h1>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-cream-600" />
          <input className="input-field ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.searchSchools", "Search school or principal")} />
        </div>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("sp.loadError", "Couldn't load the schools. Please try again.")}</p>}
      {msg && <p className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-2 text-sm text-navy">{msg}</p>}

      {picked.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-semibold text-navy">
            {picked.size} {t("adm.selected", "selected")}
          </span>
          <button className="btn-primary py-1.5 text-sm" disabled={busy} onClick={() => applyPreset("paid")}>
            {t("adm.presetPaid", "Paid preset (everything on)")}
          </button>
          <button className="btn-secondary py-1.5 text-sm" disabled={busy} onClick={() => applyPreset("free")}>
            {t("adm.presetFree", "Free preset (basic only)")}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-cream-600">{t("adm.noSchools", "No schools found.")}</div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-cream-600">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((s) => s.id)))} />
            {t("adm.selectAll", "Select all")}
          </label>
          {rows.map((s) => {
            const ent = ents[s.id];
            const on = ent ? FEATURE_KEYS.filter((k) => ent.features[k]).length : 0;
            const open = tickets.filter((x) => x.schoolId === s.id && isActiveTicket(x)).length;
            const unread = tickets.some((x) => x.schoolId === s.id && x.unreadByAdmin);
            const created = toMillis(s.createdAt);
            return (
              <div key={s.id} className="card flex items-center gap-3 p-3 sm:p-4">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={s.name} />
                {s.logoURL ? (
                  <img src={s.logoURL} alt="" className="h-10 w-10 shrink-0 rounded-full border border-gold/40 bg-white object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-cream-100">{s.name.charAt(0)}</span>
                )}
                <Link to={`/admin/schools/${s.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">
                    {s.name} {unread && <span className="ms-1 inline-block h-2 w-2 rounded-full bg-red-600" />}
                  </p>
                  <p className="truncate text-xs text-cream-600">
                    {s.principalName} · <span dir="ltr">{s.principalEmail}</span>
                    {created ? ` · ${new Date(created).toLocaleDateString()}` : ""}
                  </p>
                </Link>
                <div className="hidden text-end text-xs text-cream-600 sm:block">
                  <p>
                    {on}/{FEATURE_KEYS.length} {t("adm.featuresOn", "features on")}
                  </p>
                  {open > 0 && (
                    <p className="font-semibold text-navy">
                      {open} {t("adm.openTicketsShort", "open ticket(s)")}
                    </p>
                  )}
                </div>
                <PlanPill plan={ent?.plan} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
