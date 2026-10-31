import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  increment,
  limit,
  type Unsubscribe,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { toMillis } from "../timestamps";
import type { Ticket, TicketCategory, TicketMessage, TicketStatus } from "../../types";

const fromDoc = (id: string, d: Record<string, unknown>): Ticket => {
  const data = d as unknown as Ticket;
  return {
    ...data,
    id,
    // A just-written serverTimestamp() reads back as null until the server confirms it — treat that as "now".
    createdAt: toMillis(d.createdAt as never) || Date.now(),
    lastMessageAt: toMillis((d.lastMessageAt ?? d.createdAt) as never) || Date.now(),
  };
};

const newestFirst = (a: Ticket, b: Ticket) => b.lastMessageAt - a.lastMessageAt;

/** Principal: open a ticket together with its first message, atomically. Returns the ticket id. */
export async function createTicket(input: {
  schoolId: string;
  schoolName: string;
  uid: string;
  name: string;
  email: string;
  category: TicketCategory;
  subject: string;
  message: string;
  featureKey?: string;
}): Promise<string> {
  const ref = doc(collection(db, "tickets"));
  const batch = writeBatch(db);
  batch.set(ref, {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    createdByUid: input.uid,
    createdByName: input.name,
    createdByEmail: input.email.toLowerCase(),
    category: input.category,
    subject: input.subject.trim(),
    ...(input.featureKey ? { featureKey: input.featureKey } : {}),
    status: "open",
    unreadByAdmin: true,
    unreadByPrincipal: false,
    messageCount: 1,
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  });
  batch.set(doc(collection(ref, "messages")), {
    authorUid: input.uid,
    authorName: input.name,
    authorRole: "principal",
    text: input.message.trim(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}

/** Principal: their school's tickets (newest activity first). */
export function subscribeSchoolTickets(schoolId: string, cb: (t: Ticket[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "tickets"), where("schoolId", "==", schoolId)),
    (snap) => cb(snap.docs.map((d) => fromDoc(d.id, d.data())).sort(newestFirst)),
    onError
  );
}

/** Admin: every ticket (newest activity first). */
export function subscribeAllTickets(cb: (t: Ticket[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "tickets"), orderBy("lastMessageAt", "desc"), limit(500)),
    (snap) => cb(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

/** Live count of tickets with something new for the given side. Equality filters only → no index needed. */
export function subscribeUnreadCount(side: "admin" | "principal", schoolId: string | null, cb: (n: number) => void): Unsubscribe {
  const flag = side === "admin" ? "unreadByAdmin" : "unreadByPrincipal";
  const q = schoolId
    ? query(collection(db, "tickets"), where("schoolId", "==", schoolId), where(flag, "==", true))
    : query(collection(db, "tickets"), where(flag, "==", true));
  return onSnapshot(q, (snap) => cb(snap.size), () => cb(0));
}

export function subscribeMessages(ticketId: string, cb: (m: TicketMessage[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "tickets", ticketId, "messages"), orderBy("createdAt", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as TicketMessage), id: d.id, createdAt: toMillis(d.data().createdAt) || Date.now() }))),
    onError
  );
}

export async function listSchoolTicketsOnce(schoolId: string): Promise<Ticket[]> {
  const snap = await getDocs(query(collection(db, "tickets"), where("schoolId", "==", schoolId)));
  return snap.docs.map((d) => fromDoc(d.id, d.data())).sort(newestFirst);
}

/** Adds a reply and flags the ticket as unread for the OTHER side. A principal replying re-opens a resolved/closed ticket. */
export async function replyToTicket(
  ticket: Ticket,
  author: { uid: string; name: string; role: "principal" | "admin" },
  text: string
) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "tickets", ticket.id, "messages")), {
    authorUid: author.uid,
    authorName: author.name,
    authorRole: author.role,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  const isAdmin = author.role === "admin";
  const reopen = !isAdmin && (ticket.status === "resolved" || ticket.status === "closed");
  batch.update(doc(db, "tickets", ticket.id), {
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
    unreadByAdmin: !isAdmin,
    unreadByPrincipal: isAdmin,
    // The admin moves a fresh ticket to "in progress" on the first answer.
    ...(isAdmin && ticket.status === "open" ? { status: "in_progress" } : {}),
    ...(reopen ? { status: "open" } : {}),
  });
  await batch.commit();
}

export async function setTicketStatus(id: string, status: TicketStatus) {
  await updateDoc(doc(db, "tickets", id), { status });
}

/** Clears the "new" dot for whoever just opened the thread. */
export async function markTicketRead(id: string, side: "admin" | "principal") {
  await updateDoc(doc(db, "tickets", id), side === "admin" ? { unreadByAdmin: false } : { unreadByPrincipal: false });
}

