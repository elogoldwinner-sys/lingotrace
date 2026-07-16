import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Creates a typed CRUD + real-time-subscription service for a Firestore collection.
 * Every feature module (classes, students, attendance, sessions, notes, points,
 * badges, notifications) is built on top of this so the data-access pattern
 * stays identical across the app.
 */
export function createFirestoreService<T extends { id: string }>(
  collectionName: string
) {
  const colRef = collection(db, collectionName);

  function subscribe(
    constraints: QueryConstraint[],
    onData: (items: T[]) => void,
    onError?: (error: Error) => void
  ) {
    const q = query(colRef, ...constraints);
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as T)
        );
        onData(items);
      },
      (error) => onError?.(error)
    );
  }

  async function create(data: Omit<T, "id" | "createdAt">) {
    const docRef = await addDoc(colRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async function update(id: string, data: Partial<Omit<T, "id">>) {
    await updateDoc(doc(db, collectionName, id), { ...data });
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, collectionName, id));
  }

  /**
   * Creates many documents at once using batched writes (used by bulk session
   * generation). Firestore batches cap at 500 writes, so large sets are split
   * into chunks of 400 to stay safely under that limit.
   */
  async function createMany(items: Omit<T, "id" | "createdAt">[]) {
    const CHUNK_SIZE = 400;
    const ids: string[] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const chunkIds = chunk.map(() => doc(colRef).id);
      chunk.forEach((data, idx) => {
        batch.set(doc(db, collectionName, chunkIds[idx]), {
          ...data,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      ids.push(...chunkIds);
    }
    return ids;
  }

  return { subscribe, create, update, remove, createMany, where, orderBy };
}
