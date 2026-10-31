import { useCallback, useEffect, useState } from "react";
import { listSchools } from "../../lib/services/schoolService";
import { listAllEntitlements } from "../../lib/services/entitlementsService";
import { subscribeAllTickets } from "../../lib/services/ticketsService";
import type { School, SchoolEntitlements, Ticket } from "../../types";

/** Everything the admin overview / schools list needs: all schools, their plans, and all tickets (live). */
export function useAdminData() {
  const [schools, setSchools] = useState<School[]>([]);
  const [ents, setEnts] = useState<Record<string, SchoolEntitlements>>({});
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setError(false);
    try {
      const [s, e] = await Promise.all([listSchools(), listAllEntitlements()]);
      setSchools(s);
      setEnts(e);
    } catch (err) {
      console.error("Admin: couldn't load schools", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return subscribeAllTickets(setTickets, (err) => console.error("Admin: tickets listener failed", err));
  }, [reload]);

  return { schools, ents, tickets, loading, error, reload };
}

export const isActiveTicket = (t: Ticket) => t.status === "open" || t.status === "in_progress";
