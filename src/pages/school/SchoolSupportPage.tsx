import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LifeBuoy, Plus } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import TicketThread, { StatusPill, TICKET_CATEGORIES, fmtDateTime, useTicketLabels } from "../../components/support/ticketUi";
import { useAuth } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import { FEATURE_BY_KEY, type FeatureKey } from "../../lib/features";
import { createTicket, subscribeSchoolTickets } from "../../lib/services/ticketsService";
import type { Ticket, TicketCategory } from "../../types";

/** Principal only: contact the platform admin by issuing a ticket, and follow the conversation. */
export default function SchoolSupportPage() {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const { user } = useAuth();
  const { staff, school } = useSchool();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<TicketCategory>("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [featureKey, setFeatureKey] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedId = params.get("ticket") || "";
  const schoolId = school?.id;
  const isPrincipal = staff?.role === "principal";

  useEffect(() => {
    if (!schoolId || !isPrincipal) return;
    return subscribeSchoolTickets(schoolId, setTickets, (err) => {
      console.error("Couldn't load tickets", err);
      setTickets([]);
    });
  }, [schoolId, isPrincipal]);

  // Arrived from a locked feature's "Request access" badge → open the form with the request already written.
  const wantedFeature = params.get("feature") as FeatureKey | null;
  useEffect(() => {
    if (!wantedFeature || !FEATURE_BY_KEY[wantedFeature]) return;
    const name = t(`feat.${wantedFeature}.label`, FEATURE_BY_KEY[wantedFeature].label);
    setComposing(true);
    setCategory("feature_request");
    setFeatureKey(wantedFeature);
    setSubject(`${t("tk.requestSubject", "Please enable")}: ${name}`);
    setMessage(t("tk.requestBody", "Hello, we would like to use this feature at our school. Please enable it for us and let us know the next steps."));
    const next = new URLSearchParams(params);
    next.delete("feature");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedFeature]);

  if (!staff || !school || !isPrincipal || !user) return <Navigate to="/school" replace />;
  const me = { uid: user.uid, name: user.displayName || school.principalName || user.email || "" };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || !school || !user) return;
    setBusy(true);
    setError("");
    try {
      const id = await createTicket({
        schoolId: school.id,
        schoolName: school.name,
        uid: me.uid,
        name: me.name,
        email: user.email || "",
        category,
        subject,
        message,
        featureKey,
      });
      setComposing(false);
      setSubject("");
      setMessage("");
      setFeatureKey(undefined);
      setCategory("other");
      setParams({ ticket: id }, { replace: true });
    } catch (err) {
      console.error("Couldn't create the ticket", err);
      setError(t("tk.createError", "Couldn't send your ticket. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (tickets === null) return <Spinner />;
  const selected = tickets.find((x) => x.id === selectedId) || null;
  const select = (id: string) => setParams(id ? { ticket: id } : {}, { replace: true });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-navy">
            <LifeBuoy size={22} />
            {t("tk.title", "Support")}
          </h1>
          <p className="text-sm text-cream-600">{t("tk.sub", "Send a complaint, a question or a request to the platform administrator and follow the answer here.")}</p>
        </div>
        <button className="btn-primary" onClick={() => setComposing((v) => !v)}>
          <Plus size={16} />
          {t("tk.new", "New ticket")}
        </button>
      </div>

      {composing && (
        <form onSubmit={submit} className="card space-y-3 p-4">
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("tk.category", "Type")}</label>
            <div className="flex flex-wrap gap-2">
              {TICKET_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    category === c ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
                  }`}
                >
                  {labels.category(c)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("tk.subject", "Subject")}</label>
            <input required maxLength={150} className="input-field" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("tk.message", "Message")}</label>
            <textarea required maxLength={4000} className="input-field min-h-[8rem]" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setComposing(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={busy || !subject.trim() || !message.trim()} className="btn-primary">
              {t("tk.submit", "Send ticket")}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <aside className={`space-y-2 ${selected ? "hidden lg:block" : ""}`}>
          {tickets.length === 0 ? (
            <p className="card p-4 text-center text-sm text-cream-600">{t("tk.none", "You haven't sent any tickets yet.")}</p>
          ) : (
            tickets.map((tk) => (
              <button
                key={tk.id}
                type="button"
                onClick={() => select(tk.id)}
                className={`card block w-full p-3 text-start transition hover:shadow-md ${tk.id === selectedId ? "ring-2 ring-gold" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-navy">
                    {tk.unreadByPrincipal && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-red-600" aria-label={t("adm.new", "New")} />}
                    {tk.subject}
                  </p>
                  <StatusPill status={tk.status} />
                </div>
                <p className="mt-0.5 text-xs text-cream-600">
                  {labels.category(tk.category)} · {fmtDateTime(tk.lastMessageAt)}
                </p>
              </button>
            ))
          )}
        </aside>

        <section className={`card flex min-h-[26rem] flex-col p-4 ${selected ? "" : "hidden lg:flex"}`}>
          {selected ? (
            <>
              <button type="button" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cream-600 hover:text-navy lg:hidden" onClick={() => select("")}>
                <ArrowLeft size={16} />
                {t("adm.backToList", "All tickets")}
              </button>
              <TicketThread ticket={selected} side="principal" me={me} />
            </>
          ) : (
            <p className="m-auto text-sm text-cream-600">{t("tk.pick", "Choose a ticket to read the conversation.")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
