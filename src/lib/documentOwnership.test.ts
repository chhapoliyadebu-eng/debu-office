import { describe, it, expect } from "vitest";
import { resolveDocumentOwnership } from "./documentOwnership";

const owner = { id: "uid-owner", department: "Transport", wing: "Traffic Wing", seat: "Section Officer, Traffic Wing" };
const sharedEditor = { id: "uid-editor", department: "Transport", wing: "Enforcement Wing", seat: "Inspector, Enforcement" };

describe("resolveDocumentOwnership", () => {
  it("uses the CURRENT user's identity for a brand-new document (no existing record)", () => {
    const result = resolveDocumentOwnership(undefined, owner);
    expect(result.ownerUid).toBe("uid-owner");
    expect(result.department).toBe("Transport");
    expect(result.wing).toBe("Traffic Wing");
    expect(result.createdBy).toBe("Section Officer, Traffic Wing");
  });

  it("defaults department to 'Unassigned' for a new document if the user has none set", () => {
    const result = resolveDocumentOwnership(undefined, { ...owner, department: "" });
    expect(result.department).toBe("Unassigned");
  });

  it(
    "REGRESSION: preserves the ORIGINAL owner's identity when a shared 'Edit' colleague saves an existing document — " +
      "this is the exact bug that once broke sharing: this function used to unconditionally stamp the CURRENT user's " +
      "own identity, which firestore.rules would then reject (ownerUid/department/wing/createdBy must stay unchanged " +
      "on every update except by the true owner). A shared editor got permission-denied on every save.",
    () => {
      const existing = {
        ownerUid: "uid-owner",
        department: "Transport",
        wing: "Traffic Wing",
        createdBy: "Section Officer, Traffic Wing",
        createdAt: "2026-01-01T00:00:00.000Z",
      };

      // sharedEditor is a DIFFERENT person saving someone else's document.
      const result = resolveDocumentOwnership(existing, sharedEditor);

      expect(result.ownerUid).toBe("uid-owner"); // NOT sharedEditor.id
      expect(result.department).toBe("Transport"); // NOT sharedEditor.department
      expect(result.wing).toBe("Traffic Wing"); // NOT sharedEditor.wing
      expect(result.createdBy).toBe("Section Officer, Traffic Wing"); // NOT sharedEditor.seat
    }
  );

  it("preserves the original createdAt timestamp on every subsequent save, never resetting it", () => {
    const existing = {
      ownerUid: "uid-owner",
      department: "Transport",
      wing: "Traffic Wing",
      createdBy: "Section Officer, Traffic Wing",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = resolveDocumentOwnership(existing, owner);
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("still lets the true owner re-save their own document normally", () => {
    const existing = {
      ownerUid: "uid-owner",
      department: "Transport",
      wing: "Traffic Wing",
      createdBy: "Section Officer, Traffic Wing",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const result = resolveDocumentOwnership(existing, owner);
    expect(result.ownerUid).toBe("uid-owner");
    expect(result.department).toBe("Transport");
  });
});
