import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { toMillis } from "../timestamps";
import type { Announcement, AnnouncementLink } from "../../types";

const announcementsCol = collection(db, "announcements");

/** Most recent announcements pulled per subscription — plenty for a school, and keeps every portal load cheap. */
const MAX_ANNOUNCEMENTS = 100;

/** Live-subscribes to announcements, newest first. Callers narrow the list with `isAnnouncementVisibleTo`. */
export function subscribeToAnnouncements(
  callback: (announcements: Announcement[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(announcementsCol, orderBy("updatedAt", "desc"), limit(MAX_ANNOUNCEMENTS));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as Announcement);
      // The server already sorted by updatedAt; this re-sort only keeps a
      // just-written local doc (whose timestamp is a concrete value, see
      // saveAnnouncement) in the right spot without waiting on a round-trip.
      items.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      callback(items);
    },
    (error) => onError?.(error)
  );
}

/**
 * Whether an announcement should be shown to someone in the given classes.
 * No `classIds` (or an empty list) means it's for everyone.
 */
export function isAnnouncementVisibleTo(announcement: Announcement, viewerClassIds: string[]): boolean {
  const target = announcement.classIds;
  if (!target || target.length === 0) return true;
  return target.some((id) => viewerClassIds.includes(id));
}

/**
 * A teacher sees the announcements they posted themselves, plus any that
 * predate authorship tracking (the original school-wide one).
 */
export function isAnnouncementOwnedBy(announcement: Announcement, teacherUid: string): boolean {
  return !announcement.authorId || announcement.authorId === teacherUid;
}

/**
 * Only http(s), mailto and tel links are ever allowed — anything else
 * (notably `javascript:`) would be an XSS hole, since students and parents
 * click these. Returns a normalized absolute URL, or `null` if it isn't
 * acceptable. A bare "example.com/page" gets "https://" added.
 */
export function normalizeAnnouncementUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return null;
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname.includes(".")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Creates a new announcement (no `id`) or fully replaces an existing one
 * (`id` given). Uses `Timestamp.now()` rather than `serverTimestamp()` for
 * the same reason notes do (see notesService.ts) — a concrete value shows up
 * in every open tab instantly instead of waiting on the server round-trip.
 */
export async function saveAnnouncement(data: {
  id?: string;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  links?: AnnouncementLink[];
  /** Omit or pass an empty array for "everyone". */
  classIds?: string[];
  authorId: string;
  postedByName: string;
}) {
  const payload: Record<string, unknown> = {
    text: data.text,
    authorId: data.authorId,
    postedByName: data.postedByName,
    updatedAt: Timestamp.now(),
  };
  if (data.imageUrl) payload.imageUrl = data.imageUrl;
  if (data.videoUrl) payload.videoUrl = data.videoUrl;
  if (data.links && data.links.length > 0) payload.links = data.links;
  if (data.classIds && data.classIds.length > 0) payload.classIds = data.classIds;

  const ref = data.id ? doc(db, "announcements", data.id) : doc(announcementsCol);
  // Full overwrite (not merge) so removing an image/video/icon — or widening
  // the audience back to "everyone" — by leaving it out of `data` actually
  // clears the old value instead of leaving it stuck.
  await setDoc(ref, payload);
  return ref.id;
}

/** Removes one announcement entirely so nothing shows for anyone. */
export async function deleteAnnouncement(id: string) {
  await deleteDoc(doc(db, "announcements", id));
}
