import { describe, it, expect } from "vitest";
import {
  mailboxConnectSchema,
  updateUserSchema,
  shareSchema,
  rtiSearchSchema,
  fileMoveSchema,
  mailboxSendSchema,
  draftNotingSchema,
  generateSchema,
} from "../lib/validationSchemas.js";

describe("mailboxConnectSchema", () => {
  const valid = {
    branchOrSeat: "Ambala Depot",
    officeEmail: "rto.ambala@hry.gov.in",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    username: "rto.ambala@hry.gov.in",
    password: "secret",
    connectedBy: "Section Officer",
  };

  it("accepts a fully valid payload", () => {
    expect(mailboxConnectSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-email officeEmail — this is what stops garbage credentials from ever being stored", () => {
    const result = mailboxConnectSchema.safeParse({ ...valid, officeEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a port number outside the valid 1-65535 range", () => {
    expect(mailboxConnectSchema.safeParse({ ...valid, imapPort: 70000 }).success).toBe(false);
    expect(mailboxConnectSchema.safeParse({ ...valid, imapPort: 0 }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    const { password, ...withoutPassword } = valid;
    expect(mailboxConnectSchema.safeParse(withoutPassword).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("accepts a partial patch (all fields optional)", () => {
    expect(updateUserSchema.safeParse({ designation: "RTO" }).success).toBe(true);
    expect(updateUserSchema.safeParse({}).success).toBe(true);
  });

  it("only allows the three known role values — this is what stops a client from sending an arbitrary role string", () => {
    expect(updateUserSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ role: "SUPERADMIN" }).success).toBe(false);
  });

  it("rejects an empty-string designation (trimmed)", () => {
    expect(updateUserSchema.safeParse({ designation: "   " }).success).toBe(false);
  });
});

describe("shareSchema", () => {
  it("only allows VIEW, COMMENT, or EDIT as the permission level", () => {
    expect(shareSchema.safeParse({ targetUid: "u1", permission: "EDIT" }).success).toBe(true);
    expect(shareSchema.safeParse({ targetUid: "u1", permission: "OWNER" }).success).toBe(false);
  });

  it("requires a non-empty targetUid", () => {
    expect(shareSchema.safeParse({ targetUid: "", permission: "VIEW" }).success).toBe(false);
  });
});

describe("rtiSearchSchema", () => {
  const valid = {
    query: "fare revision",
    resultCounts: { files: 2, letters: 0, documents: 1, rules: 3, templates: 0 },
  };

  it("accepts a valid RTI search log payload", () => {
    expect(rtiSearchSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a negative result count — counts can never be negative", () => {
    const bad = { ...valid, resultCounts: { ...valid.resultCounts, files: -1 } };
    expect(rtiSearchSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty query string", () => {
    expect(rtiSearchSchema.safeParse({ ...valid, query: "" }).success).toBe(false);
  });

  it("rejects a query longer than 300 characters", () => {
    expect(rtiSearchSchema.safeParse({ ...valid, query: "a".repeat(301) }).success).toBe(false);
  });
});

describe("fileMoveSchema", () => {
  it("requires a non-empty destination seat", () => {
    expect(fileMoveSchema.safeParse({ toSeat: "" }).success).toBe(false);
    expect(fileMoveSchema.safeParse({ toSeat: "Section Officer, Traffic Wing" }).success).toBe(true);
  });

  it("remarks are optional", () => {
    expect(fileMoveSchema.safeParse({ toSeat: "Some Seat" }).success).toBe(true);
  });
});

describe("mailboxSendSchema", () => {
  it("requires a valid recipient email", () => {
    expect(mailboxSendSchema.safeParse({ to: "not-an-email", subject: "Hi", body: "Hello" }).success).toBe(false);
    expect(mailboxSendSchema.safeParse({ to: "officer@hry.gov.in", subject: "Hi", body: "Hello" }).success).toBe(true);
  });

  it("rejects a body over 20,000 characters", () => {
    const result = mailboxSendSchema.safeParse({ to: "officer@hry.gov.in", subject: "Hi", body: "a".repeat(20001) });
    expect(result.success).toBe(false);
  });
});

describe("draftNotingSchema / generateSchema", () => {
  it("draftNotingSchema requires both letterSubject and letterContent", () => {
    expect(draftNotingSchema.safeParse({ letterSubject: "Re: fare", letterContent: "Body text" }).success).toBe(true);
    expect(draftNotingSchema.safeParse({ letterSubject: "Re: fare" }).success).toBe(false);
  });

  it("generateSchema requires a non-empty prompt within the size limit", () => {
    expect(generateSchema.safeParse({ prompt: "Draft a noting about..." }).success).toBe(true);
    expect(generateSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(generateSchema.safeParse({ prompt: "a".repeat(8001) }).success).toBe(false);
  });
});
