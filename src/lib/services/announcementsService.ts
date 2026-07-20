import { deleteDoc, doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { Announcement } from "../../types";

const ANNOUNCEMENT_REF = doc(db, "announcements", "current");

/** Live-subscribes to the single school-wide announcement. Calls back with `null` if none is currently posted. */
export function subscribeToAnnouncement(callback: (announcement: Announcement | null) => void) {
  return onSnapshot(ANNOUNCEMENT_REF, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback(snapshot.data() as Announcement);
  });
}

/**
 * Posts (or replaces) the school-wide announcement. Uses `Timestamp.now()`
 * rather than `serverTimestamp()` for the same reason notes do (see
 * notesService.ts) — a concrete value shows up in every open tab instantly
 * instead of waiting on the server round-trip.
 */
export async function saveAnnouncement(data: {
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  postedByName: string;
}) {
  const payload: Record<string, unknown> = {
    text: data.text,
    postedByName: data.postedByName,
    updatedAt: Timestamp.now(),
  };
  if (data.imageUrl) payload.imageUrl = data.imageUrl;
  if (data.videoUrl) payload.videoUrl = data.videoUrl;
  // Full overwrite (not merge) so removing an image/video by leaving it out
  // of `data` actually clears the old one instead of leaving it stuck.
  await setDoc(ANNOUNCEMENT_REF, payload);
}

/** Removes the announcement entirely so nothing shows for anyone. */
export async function clearAnnouncement() {
  await deleteDoc(ANNOUNCEMENT_REF);
}
