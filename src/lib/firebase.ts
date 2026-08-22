import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/**
 * `ignoreUndefinedProperties: true` makes Firestore silently drop any field
 * whose value is `undefined` instead of throwing "Unsupported field value:
 * undefined". Several write paths in this app build objects like
 * `{ parentName: value || undefined }` for optional fields (bulk student
 * import, manual add, announcements, etc.) — without this setting, a batched
 * `writeBatch.set()` call (used by createMany) rejects the entire write the
 * moment one of those optional fields is left blank.
 */
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
