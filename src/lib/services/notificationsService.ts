import { createFirestoreService } from "../firestoreService";
import type { NotificationRecord } from "../../types";

const service = createFirestoreService<NotificationRecord>("notifications");

export function subscribeToNotifications(
  recipientId: string,
  onData: (notifications: NotificationRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [
      service.where("recipientId", "==", recipientId),
      service.orderBy("createdAt", "desc"),
    ],
    onData,
    onError
  );
}

export async function createNotification(data: {
  recipientId: string;
  type: NotificationRecord["type"];
  title: string;
  body: string;
  linkTo?: string;
}) {
  return service.create({ ...data, read: false } as Omit<
    NotificationRecord,
    "id" | "createdAt"
  >);
}

export async function markNotificationRead(id: string) {
  return service.update(id, { read: true });
}
