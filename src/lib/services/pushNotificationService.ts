import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";

export interface PushSubscriptionData {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent: string;
}

const BASE = import.meta.env.BASE_URL;

/** Web Push / Notifications available in this browser? */
export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.warn("Notification permission request error:", err);
    return "denied";
  }
}

/** Show a local notification through the service worker (used for welcome/test). */
export async function sendLocalNotification(title: string, options?: NotificationOptions): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: `${BASE}logo-192.png`,
      badge: `${BASE}favicon-32x32.png`,
      ...options,
    });
    return true;
  } catch (err) {
    console.warn("Error displaying notification:", err);
    return false;
  }
}

// applicationServerKey must be a Uint8Array for maximum browser compatibility
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Stores this device's push subscription on the user's Firestore document so a
 * future backend (Cloud Function) can send alerts. NOTE: nothing is sent
 * automatically yet — that needs server-side code.
 * Only the "parents" collection is permitted by firestore.rules.
 */
export async function saveUserPushSubscription(collectionName: "parents", docId: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager?.getSubscription();
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!subscription && registration.pushManager && vapidKey) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    if (!subscription) return false; // nothing real to store without a subscription

    const json = subscription.toJSON();
    // No timestamp inside the object, so arrayUnion de-duplicates the same device.
    const payload: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    };
    await updateDoc(doc(db, collectionName, docId), {
      pushSubscriptions: arrayUnion(payload),
      notificationsEnabled: true,
      lastNotificationOptIn: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn("Could not save push subscription to Firestore:", err);
    return false;
  }
}
