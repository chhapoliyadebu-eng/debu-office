export const DEPOTS = [
  "Ambala", "Panchkula", "Yamunanagar", "Kurukshetra", "Kaithal", "Karnal", "Panipat",
  "Sonipat", "Rohtak", "Jhajjar", "Gurugram", "Faridabad", "Mewat/Nuh", "Rewari",
  "Mahendragarh", "Bhiwani", "Charkhi Dadri", "Hisar", "Fatehabad", "Sirsa", "Jind", "Palwal",
];

export const WINGS = [
  "Head Office / Directorate", "Traffic Wing", "Workshop/Mechanical Wing",
  "Personnel/Establishment Wing", "Accounts/Finance Wing", "Enforcement Wing (Flying Squad)",
  "Regional Transport Authority (RTA)",
];

export type Role = "USER" | "DEPARTMENT_ADMIN" | "ADMIN";

export interface DemoUser {
  id: string;
  email?: string; // present for real logged-in users; absent for legacy demo users
  name: string;
  nameHi: string;
  designation: string;
  wing: string;
  department?: string;
  role: Role;
  seat: string;
  activeStyleSampleId?: string | null; // the writing-style sample currently auto-applied to AI generation for this user
  connectedMailboxId?: string | null; // the ONE office mailbox this user has joined, if any (see MailAccount.memberUids)
}

/**
 * Real registered users (Section 6-7) live in the Firestore `users`
 * collection, keyed by Firebase Auth uid — see src/App.tsx's useUserProfile.
 * A profile is auto-created with role "USER" on first sign-in; an Admin then
 * promotes them and sets designation/wing/seat from the Admin Panel's Users
 * tab. DEMO_USERS below only powers the app when Firebase isn't configured.
 */
export function blankProfileFor(uid: string, email: string, displayName: string | null): DemoUser {
  return {
    id: uid,
    email,
    name: displayName || email.split("@")[0],
    nameHi: "",
    designation: "Unassigned — pending Admin setup",
    wing: "Unassigned",
    department: "Unassigned",
    role: "USER",
    seat: "Unassigned",
    activeStyleSampleId: null,
  };
}

export const DEMO_USERS: DemoUser[] = [
  { id: "u1", name: "Suresh Kumar", nameHi: "सुरेश कुमार", designation: "Depot Manager", wing: "Ambala Depot", role: "USER", seat: "Depot Manager, Ambala" },
  { id: "u2", name: "Anita Sharma", nameHi: "अनीता शर्मा", designation: "Section Officer", wing: "Traffic Wing", role: "USER", seat: "Section Officer, Traffic Wing" },
  { id: "u3", name: "R.K. Bishnoi", nameHi: "आर.के. बिश्नोई", designation: "Joint Director", wing: "Head Office / Directorate", role: "DEPARTMENT_ADMIN", seat: "Joint Director, Transport" },
  { id: "u4", name: "Portal Admin", nameHi: "पोर्टल प्रशासक", designation: "System Administrator", wing: "Head Office / Directorate", role: "ADMIN", seat: "System Admin" },
];

export const RULE_CATEGORY_NAMES = [
  "Motor Vehicles Act & Central Motor Vehicles Rules",
  "Punjab Motor Vehicles Rules (as adopted by Haryana)",
  "Haryana Passengers and Goods Taxation Act & Rules",
  "Road Transport Corporation Act provisions",
  "Haryana Roadways service/conduct rules",
  "Departmental disciplinary/conduct rules",
  "Depot-level SOPs (fleet, route permits, fare revision)",
  "RTA circulars & permit instructions",
  "Fleet/vehicle fitness & workshop inspection rules",
  "Accident/claims handling instructions",
];

/* ===================== Rules Library (Section 25-26) ===================== */

export type RuleStatus = "VERIFIED" | "PENDING_VERIFICATION" | "REJECTED";

export interface RuleRecord {
  id: string;
  category: string;
  title: string;
  sourceNote: string; // e.g. filename or reference the uploader typed
  fullText: string; // the verified/uploaded text — AI may only cite this, never invent beyond it
  status: RuleStatus;
  uploadedBy: string;
  uploadedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  origin: "STARTER" | "USER_UPLOAD" | "CS_HARYANA_SCRAPE";
}

export const initialRules: RuleRecord[] = RULE_CATEGORY_NAMES.map((cat, i) => ({
  id: "RULE-CAT-" + (i + 1),
  category: cat,
  title: cat,
  sourceNote: "Category placeholder — awaiting admin-verified source document",
  fullText: "",
  status: "PENDING_VERIFICATION" as RuleStatus,
  uploadedBy: "System (starter dataset)",
  uploadedAt: "2026-01-01",
  origin: "STARTER" as const,
}));

/* ===================== CS Haryana + Finance Dept Circular Scraper (Section 25) ===================== */

export type CircularStatus = "PENDING_REVIEW" | "PUBLISHED" | "DISMISSED";
export type ScrapeSourceKey = "CS_HARYANA" | "FINANCE_HARYANA";

export interface ScrapeSource {
  key: ScrapeSourceKey;
  label: string;
  baseUrl: string;
}

export const SCRAPE_SOURCES: ScrapeSource[] = [
  { key: "CS_HARYANA", label: "CS Haryana", baseUrl: "https://csharyana.gov.in/circulars" },
  { key: "FINANCE_HARYANA", label: "Finance Department Haryana", baseUrl: "https://finhry.gov.in/circulars" },
];

export interface CircularRecord {
  id: string;
  source: ScrapeSourceKey;
  title: string;
  summary: string;
  sourceUrl: string;
  fetchedAt: string;
  status: CircularStatus;
  possibleConflictWith?: string; // rule id, if keyword overlap detected
}

export const initialCirculars: CircularRecord[] = [
  {
    id: "CIRC-2026-014",
    source: "CS_HARYANA",
    title: "Revised guidelines for stage-carriage fare slabs — August 2026",
    summary: "CS Haryana has published revised fare-slab guidelines that may update depot-level fare revision SOPs currently on file.",
    sourceUrl: "https://csharyana.gov.in/circulars/2026/014",
    fetchedAt: "2026-08-08 06:00",
    status: "PENDING_REVIEW",
    possibleConflictWith: "RULE-CAT-7",
  },
  {
    id: "CIRC-FIN-2026-009",
    source: "FINANCE_HARYANA",
    title: "Revised TA/DA and depot expenditure sanction limits — FY 2026-27",
    summary: "Finance Department Haryana has revised sanction limits applicable to depot-level expenditure and staff TA/DA claims.",
    sourceUrl: "https://finhry.gov.in/circulars/2026/009",
    fetchedAt: "2026-08-07 06:00",
    status: "PENDING_REVIEW",
    possibleConflictWith: "RULE-CAT-3",
  },
];

/* ===================== Office Mailbox Connection (Section 43A) ===================== */

/**
 * A user's personal login (Google/email — Section 6) is separate from this.
 * This represents an OFFICE mailbox (e.g. rto.ambala@hry.gov.in) connected
 * to the portal so its inbox can be viewed and mail sent from it — scoped to
 * a branch/seat, not to one person, matching Section 43A: "Connection is
 * configured per-branch/per-seat mailbox... not per individual personal
 * email." The actual IMAP/SMTP credentials are NEVER stored in this
 * collection or sent to the browser again after connecting — only this
 * metadata is. Credentials live encrypted server-side (see
 * functions/index.js + the separate `mailAccountSecrets` collection, which
 * Firestore rules block the client from ever reading).
 */
export type MailProvider = "IMAP_SMTP" | "GOOGLE_WORKSPACE" | "MICROSOFT_365";
export type MailAccountStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

export interface MailAccount {
  id: string;
  branchOrSeat: string;
  officeEmail: string;
  provider: MailProvider;
  status: MailAccountStatus;
  connectedBy: string;
  connectedAt: string;
  lastSyncedAt?: string;
  lastError?: string;
  memberUids?: string[]; // uids of every officer who has JOINED this office mailbox to use its inbox/compose
}

export const initialMailAccounts: MailAccount[] = [];


export interface MailItem {
  id: string;
  ownerUid?: string;
  department?: string;
  wing?: string;
  mailAccountId?: string; // which connected office mailbox this came from (real fetch), absent for demo/mock mail
  from: string;
  subject: string;
  date: string;
  read: boolean;
  body: string;
  attachments: string[];
  imported: boolean;
  linkedIncomingLetterId?: string; // set once this mail has been turned into an Incoming Letter record
}

export const initialMail: MailItem[] = [
  {
    id: "m1", from: "ps.transportsecy@hry.gov.in", subject: "Fare revision order — urgent compliance",
    date: "2026-08-06", read: false,
    body: "Kindly ensure the revised fare structure notified vide order no. TR/2026/441 is implemented at all depots with effect from 15.08.2026. Confirmation of compliance is required within 3 working days.",
    attachments: ["Fare_Revision_Order_TR-2026-441.pdf"], imported: false,
  },
  {
    id: "m2", from: "rto.ambala@hry.gov.in", subject: "Permit renewal pendency — Ambala depot",
    date: "2026-08-05", read: true,
    body: "Please expedite pending route permit renewals for stage carriages registered at Ambala RTA. List of 14 pending files attached.",
    attachments: ["Pending_Permits_Ambala.xlsx"], imported: true,
  },
  {
    id: "m3", from: "citizen.grievance@hry.gov.in", subject: "RTI query — bus breakdown record Karnal-Panipat",
    date: "2026-08-04", read: true,
    body: "Under RTI Act, applicant seeks breakdown/maintenance records of buses on Karnal-Panipat route for the last two years.",
    attachments: [], imported: false,
  },
];

export interface IncomingLetter {
  id: string;
  ownerUid?: string;
  department?: string;
  wing?: string;
  subject: string;
  from: string;
  dept: string;
  date: string;
  classification: string;
  locked: boolean;
  content: string;
}

export const initialIncoming: IncomingLetter[] = [
  {
    id: "IL-2026-0091", subject: "Fare revision order — urgent compliance", from: "PS to Transport Secretary",
    dept: "Head Office", date: "2026-08-06", classification: "Routine", locked: true,
    content: "Kindly ensure the revised fare structure notified vide order no. TR/2026/441 is implemented at all depots with effect from 15.08.2026. Confirmation of compliance is required within 3 working days from the depots concerned, with route-wise applied fare charts attached for record.",
  },
  {
    id: "IL-2026-0088", subject: "Workshop inspection report — Q2 pending vehicles", dept: "Workshop Wing",
    from: "Workshop Superintendent", date: "2026-08-02", classification: "Routine", locked: true,
    content: "Attached herewith is the Q2 workshop inspection report flagging 9 vehicles at Rohtak and Hisar depots pending fitness certification renewal beyond the permissible window.",
  },
];

export type MarkingStatus = "PENDING" | "ACTIONED" | "RETURNED";

export interface Marking {
  id: string;
  incomingLetterId: string;
  markedBy: string;
  markedTo: string;
  instructions: string;
  status: MarkingStatus;
  markedAt: string;
  linkedDocumentId: string | null;
}

export const initialMarkings: Marking[] = [
  {
    id: "MK-1001", incomingLetterId: "IL-2026-0091", markedBy: "R.K. Bishnoi",
    markedTo: "Section Officer, Traffic Wing",
    instructions: "Please examine and put up a compliance draft for all depots by 12.08.2026.",
    status: "PENDING", markedAt: "2026-08-06 11:20", linkedDocumentId: null,
  },
];

export interface FileRecord {
  id: string;
  ownerUid?: string;
  department?: string;
  wing?: string;
  currentSeat?: string;
  fileNo: string;
  subject: string;
  branch: string;
  status: "Open" | "Closed";
  updated: string;
}

export const initialFiles: FileRecord[] = [
  { id: "FILE-AMB-2026-0142", fileNo: "AMB/2026/0142", subject: "Fare revision compliance — Ambala depot", branch: "Ambala", status: "Open", updated: "2026-08-06" },
  { id: "FILE-HO-2026-0077", fileNo: "HO/2026/0077", subject: "Workshop fitness certification backlog", branch: "Head Office", status: "Open", updated: "2026-08-02" },
  { id: "FILE-RTA-2026-0233", fileNo: "RTA/2026/0233", subject: "Route permit renewal batch — August", branch: "RTA Ambala", status: "Closed", updated: "2026-07-29" },
];

export interface PaymentVerification {
  id: string;
  user: string;
  utr: string;
  amount: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  date: string;
}

export const initialSubs: PaymentVerification[] = [
  { id: "PV-501", user: "Suresh Kumar (Ambala)", utr: "UTR2608091143A7", amount: "₹499", status: "PENDING", date: "2026-08-08" },
  { id: "PV-500", user: "Anita Sharma (Traffic Wing)", utr: "UTR2607301022B2", amount: "₹499", status: "VERIFIED", date: "2026-07-30" },
];

/* ===================== Document Types (Section 17, 21, 41) ===================== */

export type DocType = "NOTING" | "LETTER" | "ENDORSEMENT";

export interface SignatureRecord {
  signedBy: string;
  signedAt: string;
  mode: "TYPED" | "DRAWN";
  dataUrl?: string; // for drawn signature
  typedText?: string; // for typed signature
}

export interface DocVersion {
  version: number;
  paras: string[];
  savedAt: string;
  savedBy: string;
  note?: string;
}

export type SharePermission = "VIEW" | "COMMENT" | "EDIT";

export interface ShareRecord {
  id: string;
  sharedWith: string; // seat/name
  permission: SharePermission;
  sharedAt: string;
  sharedBy: string;
}

export interface DocumentRecord {
  id: string;
  ownerUid?: string;
  department?: string;
  wing?: string;
  type: DocType;
  title: string;
  letterId: string | null; // linked incoming letter, if any
  // Letter-specific header fields
  toAddress?: string;
  refNo?: string;
  paras: string[];
  signature: SignatureRecord | null;
  versions: DocVersion[];
  shares: ShareRecord[]; // legacy display list — kept for existing records; real access control now uses sharedWith below
  sharedWith?: Record<string, { permission: SharePermission; sharedAt: string; sharedBy: string }>; // uid -> permission. This is what firestore.rules actually checks for a shared colleague's read/edit access — see canAccess() in firestore.rules. Only writable via POST /api/documents/:id/share and /unshare (never a direct client write), so every share/revoke gets a proper audit-log entry and can't be forged by a client that isn't the owner.
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  classification: "Routine" | "Confidential" | "Secret";
}

export const initialDocuments: DocumentRecord[] = [];

/* ===================== Templates (Section 23-24) ===================== */

export interface AttachmentRecord {
  id: string;
  fileName: string;
  storagePath: string;
  storageFileName: string;
  contentType: string;
  size: number;
  uploadedBy: string; // uid
  uploaderName: string;
  department: string;
  wing: string;
  linkedType: "document" | "incomingLetter";
  linkedId: string;
  uploadedAt: string;
}

export interface DocTemplate {
  id: string;
  scope: "SYSTEM" | "PERSONAL";
  type: DocType;
  title: string;
  description: string;
  owner?: string; // for personal templates — the seat that created it
  ownerUid?: string; // for personal templates — required by firestore.rules for create/update
  department?: string; // for personal templates — required by firestore.rules for create
  paras: string[];
}

export const initialTemplates: DocTemplate[] = [
  {
    id: "TPL-SYS-001", scope: "SYSTEM", type: "NOTING", title: "Standard Compliance Noting",
    description: "4-part noting for routine compliance directions from Head Office.",
    paras: [
      "Facts of the case: This office has received directions vide letter under reference regarding ",
      "Analysis: On examination of the matter in light of applicable rules, ",
      "Suggestions: It is suggested that concerned depot(s)/wing be directed to ",
      "Conclusion: Submitted for kind perusal and orders please.",
    ],
  },
  {
    id: "TPL-SYS-002", scope: "SYSTEM", type: "LETTER", title: "Depot Compliance Confirmation Letter",
    description: "Standard outward letter confirming compliance with a Head Office order.",
    paras: [
      "With reference to the letter cited above, it is intimated that this office has taken necessary action as directed.",
      "Compliance report/relevant documents are enclosed herewith for record.",
      "This is for information and further necessary action please.",
    ],
  },
  {
    id: "TPL-SYS-003", scope: "SYSTEM", type: "ENDORSEMENT", title: "Standard Forwarding Endorsement",
    description: "Endorsement copy forwarded to concerned wing/depot for information and action.",
    paras: [
      "A copy of the above is forwarded to the following for information and necessary action:",
      "1. All Depot Managers, Haryana Roadways\n2. Accounts Wing, Head Office",
    ],
  },
  {
    id: "TPL-PER-001", scope: "PERSONAL", type: "NOTING", title: "My Fare-Revision Noting Draft",
    description: "Anita Sharma's saved personal starting point for fare-revision related notings.",
    owner: "Section Officer, Traffic Wing",
    paras: [
      "Facts of the case: Reference is invited to the fare revision order under consideration.",
      "Analysis: The proposed revision has been checked against the Haryana Passengers and Goods Taxation Act provisions.",
      "Suggestions: Depot-wise implementation timeline is suggested as under.",
      "Conclusion: Submitted please.",
    ],
  },
];

/* ===================== Audit Log (Section 49) ===================== */

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

export const initialAuditLog: AuditEntry[] = [
  { id: "AL-1", actor: "R.K. Bishnoi", action: "MARKED", target: "IL-2026-0091 → Section Officer, Traffic Wing", at: "2026-08-06 11:20" },
  { id: "AL-2", actor: "Anita Sharma", action: "IMPORTED_MAIL", target: "Permit renewal pendency — Ambala depot", at: "2026-08-05 09:40" },
  { id: "AL-3", actor: "Portal Admin", action: "VERIFIED_PAYMENT", target: "PV-500 (Anita Sharma)", at: "2026-07-30 15:05" },
];

/* ===================== Style Samples — "write in my style" ===================== */

/**
 * A user-provided writing sample so AI drafting matches THEIR phrasing,
 * tone, and structure instead of a generic style. Saved samples persist
 * per-user (scoped by ownerSeat) and can be reused across many future
 * drafts; a one-off paste (not saved) works too — see DocumentEditor.tsx.
 */
export interface StyleSample {
  id: string;
  ownerUid?: string;
  ownerSeat: string;
  title: string;
  docType: DocType;
  sampleText: string;
  createdAt: string;
}

export const initialStyleSamples: StyleSample[] = [];

