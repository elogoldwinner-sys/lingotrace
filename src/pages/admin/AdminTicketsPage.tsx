import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import TicketThread, { StatusPill, TICKET_STATUSES, fmtDateTime, useTicketLabels } from "../../components/support/ticketUi";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeAllTickets } from "../../lib/services/ticketsService";
import type { Ticket, TicketStatus } from "../../types";

type Filter = "all" | "unread" | TicketStatus;

export default function AdminTicketsPage() {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const selectedId = params.get("ticket") || "";

  useEffect(() => subscribeAllTickets(setTickets, () => setTickets([])), []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tickets || []).filter((x) => {
      if (filter === "unread" && !x.unreadByAdmin) return false;
      if (filter !== "all" && filter !== "unread" && x.status !== filter) return false;
      return !needle || `${x.subject} ${x.schoolName} ${x.createdByName}`.toLowerCase().includes(needle);
    });
  }, [tickets, filter, q]);

  const selected = tickets?.find((x) => x.id === selectedId) || null;
  const select = (id: string) => setParams(id ? { ticket: id } : {}, { replace: true });

  if (tickets === null) return <Spinner />;

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: t("adm.filterAll", "All") },
    { id: "unread", label: t("adm.filterUnread", "Needs reply") },
    ...TICKET_STATUSES.map((s) => ({ id: s as Filter, label: labels.status(s) })),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{t("adm.ticketsPageTitle", "Support tickets")}</h1>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <aside className={`space-y-3 ${selected ? "hidden lg:block" : ""}`}>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-cream-600" />
            <input className="input-field ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adm.searchTickets", "Search subject or school")} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filter === c.id ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {shown.length === 0 ? (
              <p className="card p-4 text-center text-sm text-cream-600">{t("adm.noTickets", "No tickets yet.")}</p>
            ) : (
              shown.map((tk) => (
                <button
                  key={tk.id}
                  type="button"
                  onClick={() => select(tk.id)}
                  className={`card block w-full p-3 text-start transition hover:shadow-md ${tk.id === selectedId ? "ring-2 ring-gold" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-navy">
                      {tk.unreadByAdmin && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-red-600" />}
                      {tk.subject}
                    </p>
                    <StatusPill status={tk.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-cream-600">
                    {tk.schoolName} · {labels.category(tk.category)}
                  </p>
                  <p className="text-xs text-cream-600">{fmtDateTime(tk.lastMessageAt)}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className={`card flex min-h-[28rem] flex-col p-4 ${selected ? "" : "hidden lg:flex"}`}>
          {selected && user ? (
            <>
              <button type="button" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cream-600 hover:text-navy lg:hidden" onClick={() => select("")}>
                <ArrowLeft size={16} />
                {t("adm.backToList", "All tickets")}
              </button>
              <TicketThread ticket={selected} side="admin" me={{ uid: user.uid, name: user.displayName || user.email || "Admin" }} />
            </>
          ) : (
            <p className="m-auto text-sm text-cream-600">{t("adm.pickTicket", "Choose a ticket to read and reply.")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
