import { DemoUser, DocumentRecord } from "../data/mockData";

/**
 * Resolves the ownership fields (ownerUid, department, wing, createdBy,
 * createdAt) to write when saving a document.
 *
 * THIS FUNCTION EXISTS BECAUSE OF A REAL BUG: an earlier version of this
 * logic unconditionally stamped the CURRENT logged-in user's own identity
 * onto every save — including when a colleague with "Edit" sharing
 * permission was saving someone ELSE's document. firestore.rules requires
 * ownerUid/department/wing/createdBy to stay unchanged on every update
 * except by the true owner creating it for the first time, so that bug
 * meant a shared "Edit" colleague got permission-denied on every single
 * save — the sharing feature looked like it worked (access was granted)
 * but silently could not actually be used.
 *
 * The fix: a brand-new document (no `existing` record yet) uses the
 * current user's identity, since they ARE the new owner. An EXISTING
 * document always keeps its already-stored ownership values, regardless
 * of who is currently saving it.
 */
export function resolveDocumentOwnership(
  existing: Pick<DocumentRecord, "ownerUid" | "department" | "wing" | "createdBy" | "createdAt"> | undefined,
  currentUser: Pick<DemoUser, "id" | "department" | "wing" | "seat">
): { ownerUid: string; department: string; wing: string; createdBy: string; createdAt: string } {
  return {
    ownerUid: existing?.ownerUid ?? currentUser.id,
    department: existing?.department ?? (currentUser.department || "Unassigned"),
    wing: existing?.wing ?? currentUser.wing,
    createdBy: existing?.createdBy ?? currentUser.seat,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}
