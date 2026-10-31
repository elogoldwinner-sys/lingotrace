import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Unlock } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import Switch from "../../components/common/Switch";
import { StatusPill, fmtDateTime } from "../../components/support/ticketUi";
import { useAuth } from "../../contexts/AuthContext";
import { allFeaturesOff, allFeaturesOn, FEATURES, type FeatureKey } from "../../lib/features";
import { getAdminNote, getEntitlements, listAdminLog, saveAdminNote, saveEntitlements } from "../../lib/services/entitlementsService";
import { getSchool, listMemberships, listStaff } from "../../lib/services/schoolService";
import { subscribeAllTickets } from "../../lib/services/ticketsService";
import { toMillis } from "../../lib/timestamps";
import type { AdminLogEntry, School, SchoolEntitlements, SchoolPlan, SchoolTeacher, StaffAccess, Ticket } from "../../types";
import { PlanPill } from "./AdminSchoolsPage";

export default function AdminSchoolDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [ent, setEnt] = useState<SchoolEntitlements | null>(null);
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [staff, setStaff] = useState<StaffAccess[]>([]);
  const [log, setLog] = useState<AdminLogEntry[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await getSchool(id);
      if (!s) {
        setMissing(true);
        return;
      }
      setSchool(s);
      const [e, tc, st, lg, n] = await Promise.all([
        getEntitlements(id),
        listMemberships(id).catch(() => [] as SchoolTeacher[]),
        listStaff(id).catch(() => [] as StaffAccess[]),
        listAdminLog(id).catch(() => [] as AdminLogEntry[]),
        getAdminNote(id).catch(() => ""),
      ]);
      setEnt(e);
      setTeachers(tc);
      setStaff(st);
      setLog(lg);
      setNote(n);
    } catch (err) {
      console.error("Admin: couldn't load the school", err);
      setError(t("sp.loadError", "Couldn't load the schools. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
    return subscribeAllTickets((all) => setTickets(all.filter((x) => x.schoolId === id)));
  }, [load, id]);

  async function apply(plan: SchoolPlan, features: SchoolEntitlements["features"], detail: string) {
    if (!school || !user?.email) return;
    const before = ent;
    setBusy(true);
    setError("");
    setEnt({ ...(ent as SchoolEntitlements), plan, features }); // optimistic; rolled back below if the write fails
    try {
      await saveEntitlements(school, { plan, features }, user.email, detail);
      setLog(await listAdminLog(id).catch(() => log));
    } catch (err) {
      console.error("Admin: saving the plan failed", err);
      setEnt(before);
      setError(t("sp.actionError", "That didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (missing || !school || !ent) {
    return (
      <div className="space-y-4">
        <Link to="/admin/schools" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cream-600 hover:text-navy">
          <ArrowLeft size={16} />
          {t("adm.backToSchools", "All schools")}
        </Link>
        <p className="card p-6 text-sm text-cream-600">{error || t("adm.schoolMissing", "School not found.")}</p>
      </div>
    );
  }

  const label = (k: FeatureKey) => t(`feat.${k}.label`, FEATURES.find((f) => f.key === k)!.label);
  const created = toMillis(school.createdAt);

  return (
    <div className="space-y-6">
      <Link to="/admin/schools" className="inline-flex items-center gap-1.5 text-sm font-semibold text-cream-600 hover:text-navy">
        <ArrowLeft size={16} />
        {t("adm.backToSchools", "All schools")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        {school.logoURL ? (
          <img src={school.logoURL} alt="" className="h-14 w-14 rounded-full border border-gold/40 bg-white object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy text-xl font-bold text-cream-100">{school.name.charAt(0)}</span>
        )}
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-navy">
            {school.name} <PlanPill plan={ent.plan} />
          </h1>
          <p className="text-sm text-cream-600">
            {school.principalName} · <span dir="ltr">{school.principalEmail}</span>
            {created ? ` · ${t("adm.since", "since")} ${new Date(created).toLocaleDateString()}` : ""}
          </p>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-1 p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <h2 className="label-eyebrow">{t("adm.featuresTitle", "Features for this school")}</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary py-1.5 text-xs" disabled={busy} onClick={() => apply("paid", allFeaturesOn(), t("adm.presetPaid", "Paid preset (everything on)"))}>
                <Unlock size={13} />
                {t("adm.presetPaid", "Paid preset (everything on)")}
              </button>
              <button className="btn-secondary py-1.5 text-xs" disabled={busy} onClick={() => apply("free", allFeaturesOff(), t("adm.presetFree", "Free preset (basic only)"))}>
                <Lock size={13} />
                {t("adm.presetFree", "Free preset (basic only)")}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 pb-3 text-sm">
            <label htmlFor="plan" className="font-semibold text-navy">
              {t("adm.planLabel", "Plan label")}
            </label>
            <select
              id="plan"
              className="input-field w-auto py-1.5"
              value={ent.plan}
              disabled={busy}
              onChange={(e) => apply(e.target.value as SchoolPlan, ent.features, `${t("adm.planLabel", "Plan label")}: ${e.target.value}`)}
            >
              <option value="free">{t("adm.planFree", "Free")}</option>
              <option value="paid">{t("adm.planPaid", "Paid")}</option>
            </select>
            <span className="text-xs text-cream-600">{t("adm.planHelp", "A label for you — the switches below are what actually decide access.")}</span>
          </div>

          <div className="divide-y divide-cream-300">
            {FEATURES.map((f) => {
              const on = ent.features[f.key] === true;
              return (
                <div key={f.key} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{label(f.key)}</p>
                    <p className="text-xs text-cream-600">{t(`feat.${f.key}.description`, f.description)}</p>
                  </div>
                  <Switch
                    checked={on}
                    disabled={busy}
                    label={label(f.key)}
                    onChange={(next) =>
                      apply(ent.plan, { ...ent.features, [f.key]: next }, `${label(f.key)}: ${next ? t("adm.enabled", "enabled") : t("adm.disabled", "disabled")}`)
                    }
                  />
                </div>
              );
            })}
          </div>
          <p className="pt-2 text-xs text-cream-600">
            {t("adm.disableNote", "Switching a feature off fades it for the school straight away. Staff added earlier keep their record but can't sign in to the school portal while their role is off.")}
          </p>
        </section>

        <div className="space-y-6">
          <section className="card space-y-2 p-4">
            <h2 className="label-eyebrow">{t("adm.noteTitle", "Private note")}</h2>
            <textarea className="input-field min-h-[6rem]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("adm.notePh", "Contract, contact, renewal date…")} />
            <div className="flex items-center justify-end gap-2">
              {noteSaved && <span className="text-xs font-semibold text-green-700">{t("sp.saved", "Saved")}</span>}
              <button
                className="btn-secondary py-1.5 text-sm"
                onClick={async () => {
                  try {
                    await saveAdminNote(id, note);
                    setNoteSaved(true);
                    setTimeout(() => setNoteSaved(false), 2000);
                  } catch {
                    setError(t("sp.actionError", "That didn't work. Please try again."));
                  }
                }}
              >
                {t("common.save")}
              </button>
            </div>
          </section>

          <section className="card space-y-2 p-4">
            <h2 className="label-eyebrow">
              {t("adm.ticketsTitle", "Tickets")} ({tickets.length})
            </h2>
            {tickets.length === 0 ? (
              <p className="text-sm text-cream-600">{t("adm.noTickets", "No tickets yet.")}</p>
            ) : (
              tickets.slice(0, 5).map((tk) => (
                <Link key={tk.id} to={`/admin/tickets?ticket=${tk.id}`} className="block rounded-lg border border-cream-300 p-2.5 hover:bg-cream-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-navy">{tk.subject}</p>
                    <StatusPill status={tk.status} />
                  </div>
                  <p className="text-xs text-cream-600">{fmtDateTime(tk.lastMessageAt)}</p>
                </Link>
              ))
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-2 p-4 lg:col-span-2">
          <h2 className="label-eyebrow">
            {t("adm.peopleTitle", "People")} — {teachers.length} {t("adm.teachersWord", "teachers")}, {staff.filter((s) => s.role !== "principal").length} {t("adm.staffWord", "staff")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {teachers.map((m) => (
              <div key={m.id} className="rounded-lg border border-cream-300 p-2.5 text-sm">
                <p className="font-semibold text-navy">{m.name}</p>
                <p className="text-xs text-cream-600">
                  {m.subject} · {t(`sp.status.${m.status}`, m.status)} · <span dir="ltr">{m.email}</span>
                </p>
              </div>
            ))}
            {staff
              .filter((s) => s.role !== "principal")
              .map((s) => (
                <div key={s.id} className="rounded-lg border border-gold/30 bg-gold-50/40 p-2.5 text-sm">
                  <p className="font-semibold text-navy">{s.displayName || s.email}</p>
                  <p className="text-xs text-cream-600">
                    {s.jobTitle || t(`sp.role.${s.role}`, s.role)} · <span dir="ltr">{s.email}</span>
                  </p>
                </div>
              ))}
          </div>
          {teachers.length === 0 && staff.length <= 1 && <p className="text-sm text-cream-600">{t("adm.noPeople", "Nobody has joined this school yet.")}</p>}
        </section>

        <section className="card space-y-2 p-4">
          <h2 className="label-eyebrow">{t("adm.logTitle", "Change log")}</h2>
          {log.length === 0 ? (
            <p className="text-sm text-cream-600">{t("adm.noLog", "No changes yet.")}</p>
          ) : (
            log.slice(0, 12).map((l) => (
              <p key={l.id} className="text-xs text-navy">
                <span className="text-cream-600">{fmtDateTime(l.createdAt)}</span> · {l.detail}
              </p>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
