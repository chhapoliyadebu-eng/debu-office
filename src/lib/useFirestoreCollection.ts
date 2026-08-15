import { useEffect, useState } from "react";
import { collection, doc, deleteDoc, onSnapshot, setDoc, query, QueryConstraint } from "firebase/firestore";
import { db, firebaseConfigured } from "./firebase";

type CollectionOptions = {
  constraints?: QueryConstraint[];
  /** @deprecated Production seeding is permanently disabled. */
  seedInProduction?: never;
  scopeKey?: string;
};

/**
 * Firestore collection hook.
 * Production is fail-closed: mock/demo data is never written to Firestore.
 * Real Firebase reads must be constrained by the caller to the user's
 * authorized scope so Firestore rules can enforce the same boundary.
 */
export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  seedData: T[],
  enabled: boolean,
  options: CollectionOptions = {}
) {
  const [data, setData] = useState<T[]>(seedData);
  const [ready, setReady] = useState(!firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured || !db) {
      setData(seedData);
      setReady(true);
      return;
    }
    if (!enabled) {
      // If this was previously enabled and is now disabled (e.g. a role
      // change means the caller no longer qualifies for this collection),
      // don't leave the last-synced snapshot sitting in state forever —
      // clear it back to the seed so a stale admin/department list can't
      // linger in memory after access is revoked.
      setData(seedData);
      return;
    }

    const colRef = collection(db, collectionName);
    const q = options.constraints?.length ? query(colRef, ...options.constraints) : colRef;

    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => d.data() as T));
        setReady(true);
      },
      (err) => {
        console.error(`[firestore] Sync failed for "${collectionName}":`, err);
        setData([]);
        setReady(true);
      }
    );
    return () => unsub();
  }, [collectionName, enabled, options.scopeKey]);

  async function upsert(item: T) {
    if (firebaseConfigured && db) {
      await setDoc(doc(db, collectionName, item.id), item as any, { merge: false });
      return;
    }
    setData((prev) => prev.some((d) => d.id === item.id)
      ? prev.map((d) => d.id === item.id ? item : d)
      : [item, ...prev]);
  }

  async function remove(id: string) {
    if (firebaseConfigured && db) {
      await deleteDoc(doc(db, collectionName, id));
      return;
    }
    setData((prev) => prev.filter((d) => d.id !== id));
  }

  return { data, ready, upsert, remove };
}
