import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Building2, Crown, LifeBuoy, MailWarning } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import { FEATURES, FEATURE_KEYS } from "../../lib/features";
import { StatusPill, fmtDateTime } from "../../components/support/ticketUi";
import { isActiveTicket, useAdminData } from "./useAdminData";

function Stat({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number | string; tone?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-200 text-navy ${tone}`}>{icon}</span>
      <div>
        <p className="text-2xl font-semibold leading-none text-navy">{value}</p>
        <p className="mt-1 text-xs font-semibold text-cream-600">{label}</p>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const { schools, ents, tickets, loading, error } = useAdminData();

  const stats = useMemo(() => {
    const paid = schools.filter((s) => ents[s.id]?.plan === "paid").length;
    const noRecord = schools.filter((s) => !ents[s.id]).length;
    const adoption = Object.fromEntries(FEATURE_KEYS.map((k) => [k, schools.filter((s) => ents[s.id]?.features[k]).length]));
    return {
      paid,
      free: schools.length - paid,
      noRecord,
      adoption,
      active: tickets.filter(isActiveTicket).length,
      unread: tickets.filter((x) => x.unreadByAdmin).length,
    };
  }, [schools, ents, tickets]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("adm.overviewTitle", "Overview")}</h1>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("sp.loadError", "Couldn't load the schools. Please try again.")}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Building2 size={20} />} label={t("adm.statSchools", "Schools")} value={schools.length} />
        <Stat icon={<Crown size={20} />} label={t("adm.statPaid", "Paid schools")} value={stats.paid} tone="text-gold" />
        <Stat icon={<LifeBuoy size={20} />} label={t("adm.statActive", "Open tickets")} value={stats.active} />
        <Stat icon={<MailWarning size={20} />} label={t("adm.statUnread", "Waiting for your reply")} value={stats.unread} tone={stats.unread ? "text-red-600" : ""} />
      </div>

      {stats.noRecord > 0 && (
        <div className="rounded-xl border border-gold/40 bg-gold-50 p-4 text-sm text-navy">
          <p className="font-semibold">
            {t("adm.noRecordTitle", "Schools without a plan record")}: {stats.noRecord}
          </p>
          <p className="mt-1 text-cream-700">
            {t("adm.noRecordHelp", "These schools have only the basic features. Open Schools to switch features on, or apply the Paid preset to several schools at once.")}
          </p>
          <Link to="/admin/schools" className="btn-primary mt-3 inline-flex">
            {t("adm.openSchools", "Open Schools")}
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-4">
          <h2 className="label-eyebrow">{t("adm.adoption", "Features switched on")}</h2>
          {FEATURES.map((f) => {
            const n = stats.adoption[f.key] ?? 0;
            const pct = schools.length ? Math.round((n / schools.length) * 100) : 0;
            return (
              <div key={f.key}>
                <div className="flex justify-between text-sm text-navy">
                  <span>{t(`feat.${f.key}.label`, f.label)}</span>
                  <span className="font-semibold">
                    {n}/{schools.length}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-300">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="label-eyebrow">{t("adm.recentTickets", "Latest tickets")}</h2>
            <Link to="/admin/tickets" className="text-sm font-semibold text-gold hover:underline">
              {t("adm.seeAll", "See all")}
            </Link>
          </div>
          {tickets.length === 0 ? (
            <p className="text-sm text-cream-600">{t("adm.noTickets", "No tickets yet.")}</p>
          ) : (
            tickets.slice(0, 6).map((tk) => (
              <Link key={tk.id} to={`/admin/tickets?ticket=${tk.id}`} className="block rounded-lg border border-cream-300 p-3 hover:bg-cream-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-navy">
                    {tk.unreadByAdmin && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-red-600" aria-label={t("adm.new", "New")} />}
                    {tk.subject}
                  </p>
                  <StatusPill status={tk.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-cream-600">
                  {tk.schoolName} · {fmtDateTime(tk.lastMessageAt)}
                </p>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
