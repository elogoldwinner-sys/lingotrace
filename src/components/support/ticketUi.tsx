import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Send } from "lucide-react";
import Spinner from "../common/Spinner";
import { markTicketRead, replyToTicket, setTicketStatus, subscribeMessages } from "../../lib/services/ticketsService";
import type { Ticket, TicketCategory, TicketMessage, TicketStatus } from "../../types";

export const TICKET_CATEGORIES: TicketCategory[] = ["complaint", "feature_request", "technical", "billing", "other"];
export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

const CATEGORY_DEFAULTS: Record<TicketCategory, string> = {
  complaint: "Complaint",
  feature_request: "Feature request",
  technical: "Technical problem",
  billing: "Plan / billing",
  other: "Other",
};
const STATUS_DEFAULTS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};
const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-cream-300 text-cream-700",
};

export function useTicketLabels() {
  const { t } = useTranslation();
  return {
    category: (c: TicketCategory) => t(`tk.cat.${c}`, CATEGORY_DEFAULTS[c]),
    status: (s: TicketStatus) => t(`tk.status.${s}`, STATUS_DEFAULTS[s]),
  };
}

export function StatusPill({ status }: { status: TicketStatus }) {
  const labels = useTicketLabels();
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[status]}`}>{labels.status(status)}</span>;
}

export const fmtDateTime = (ms: number) => (ms ? format(new Date(ms), "d MMM yyyy, HH:mm") : "");

/**
 * One ticket's conversation + reply box. Used by the admin (side = "admin") and by the principal (side = "principal").
 * Opening it clears that side's "new" dot.
 */
export default function TicketThread({
  ticket,
  side,
  me,
}: {
  ticket: Ticket;
  side: "admin" | "principal";
  me: { uid: string; name: string };
}) {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const [messages, setMessages] = useState<TicketMessage[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const unread = side === "admin" ? ticket.unreadByAdmin : ticket.unreadByPrincipal;

  useEffect(() => {
    setMessages(null);
    setText("");
    setError("");
    return subscribeMessages(ticket.id, setMessages, () => setMessages([]));
  }, [ticket.id]);

  // Whoever has the thread open has read it (also when a new reply arrives while it is open).
  useEffect(() => {
    if (unread) markTicketRead(ticket.id, side).catch(() => {});
  }, [ticket.id, unread, side]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await replyToTicket(ticket, { uid: me.uid, name: me.name, role: side }, text);
      setText("");
    } catch (err) {
      console.error("Couldn't send the reply", err);
      setError(t("tk.sendError", "Couldn't send that. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: TicketStatus) {
    try {
      await setTicketStatus(ticket.id, status);
    } catch {
      setError(t("tk.sendError", "Couldn't send that. Please try again."));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-cream-300 pb-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-navy">{ticket.subject}</h2>
          <p className="mt-0.5 text-xs text-cream-600">
            {labels.category(ticket.category)} · {fmtDateTime(ticket.createdAt)}
            {side === "admin" && (
              <>
                {" "}· {ticket.schoolName} · {ticket.createdByName} · <span dir="ltr">{ticket.createdByEmail}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {side === "admin" ? (
            <select
              className="input-field w-auto py-1.5 text-sm"
              value={ticket.status}
              onChange={(e) => changeStatus(e.target.value as TicketStatus)}
              aria-label={t("tk.statusLabel", "Status")}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labels.status(s)}
                </option>
              ))}
            </select>
          ) : (
            <>
              <StatusPill status={ticket.status} />
              {ticket.status !== "closed" && (
                <button type="button" className="btn-secondary py-1 text-xs" onClick={() => changeStatus("closed")}>
                  {t("tk.closeTicket", "Close ticket")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto py-4">
        {messages === null ? (
          <Spinner />
        ) : (
          messages.map((m) => {
            const mine = m.authorRole === side;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-navy text-white" : "border border-cream-400 bg-cream-100 text-navy"}`}>
                  <p className={`mb-0.5 text-[11px] font-bold ${mine ? "text-white/70" : "text-cream-600"}`}>
                    {m.authorRole === "admin" ? t("tk.supportTeam", "Support team") : m.authorName} · {fmtDateTime(m.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="space-y-2 border-t border-cream-300 pt-3">
        {ticket.status === "closed" && side === "principal" && (
          <p className="text-xs text-cream-600">{t("tk.closedHint", "This ticket is closed. Sending a message re-opens it.")}</p>
        )}
        <textarea
          className="input-field min-h-[5rem]"
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("tk.replyPlaceholder", "Write a reply…")}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={!text.trim() || busy} className="btn-primary">
            <Send size={15} />
            {t("tk.send", "Send")}
          </button>
        </div>
      </form>
    </div>
  );
}
