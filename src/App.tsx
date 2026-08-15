import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import { where, documentId } from "firebase/firestore";

import { Sidebar, TopBar, TabKey } from "./components/Layout";
import { useHeadroom } from "./lib/useHeadroom";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { useFirestoreCollection } from "./lib/useFirestoreCollection";
import { updateUser } from "./lib/usersApi";
import { scrapeCircularsNow } from "./lib/circularsApi";
import * as adminActions from "./lib/adminActionsApi";

import {
  firebaseConfigured,
  securityConfigured,
  isProductionBuild,
  watchAuthState,
  signOutUser,
  User,
} from "./lib/firebase";

import {
  DEMO_USERS,
  DemoUser,
  blankProfileFor,
  initialMail,
  initialIncoming,
  initialMarkings,
  initialFiles,
  initialSubs,
  initialDocuments,
  initialTemplates,
  initialAuditLog,
  initialRules,
  initialCirculars,
  initialMailAccounts,
  initialStyleSamples,
  MailItem,
  IncomingLetter,
  Marking,
  FileRecord,
  PaymentVerification,
  DocumentRecord,
  DocTemplate,
  AttachmentRecord,
  AuditEntry,
  RuleRecord,
  CircularRecord,
  ScrapeSourceKey,
  MailAccount,
  StyleSample,
  DocType,
} from "./data/mockData";

// -----------------------------------------------------------------------------
// Lazy-loaded tabs
// -----------------------------------------------------------------------------

const IncomingLetters = lazy(() =>
  import("./components/IncomingLetters").then((m) => ({
    default: m.IncomingLetters,
  }))
);

const MarkingWorkflow = lazy(() =>
  import("./components/MarkingWorkflow").then((m) => ({
    default: m.MarkingWorkflow,
  }))
);

const DocumentEditor = lazy(() =>
  import("./components/DocumentEditor").then((m) => ({
    default: m.DocumentEditor,
  }))
);

const FilesRegister = lazy(() =>
  import("./components/FilesAndRules").then((m) => ({
    default: m.FilesRegister,
  }))
);

const RulesLibrary = lazy(() =>
  import("./components/RulesLibrary").then((m) => ({
    default: m.RulesLibrary,
  }))
);

const AdminPanel = lazy(() =>
  import("./components/AdminPanel").then((m) => ({
    default: m.AdminPanel,
  }))
);

const TemplatesLibrary = lazy(() =>
  import("./components/TemplatesLibrary").then((m) => ({
    default: m.TemplatesLibrary,
  }))
);

const GlobalSearch = lazy(() =>
  import("./components/GlobalSearch").then((m) => ({
    default: m.GlobalSearch,
  }))
);

// -----------------------------------------------------------------------------
// Loading fallback
// -----------------------------------------------------------------------------

function TabFallback() {
  return (
    <div className="rise-in text-sm text-ink/40 font-mono py-10 text-center">
      Loading…
    </div>
  );
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

export default function App() {
  // ---------------------------------------------------------------------------
  // Scroll / UI
  // ---------------------------------------------------------------------------

  const mainScrollRef = useRef<HTMLElement>(null);
  const topBarVisible = useHeadroom(mainScrollRef);

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [demoUser, setDemoUser] = useState<DemoUser>(DEMO_USERS[1]);

  useEffect(() => {
    const unsub = watchAuthState((u) => {
      setAuthUser(u);
      setAuthChecked(true);
    });

    return () => {
      if (unsub) {
        unsub();
      }
    };
  }, []);

  const isRealAuth = firebaseConfigured;

  // ---------------------------------------------------------------------------
  // Current user's Firestore profile
  // ---------------------------------------------------------------------------

  const profileCol = useFirestoreCollection<DemoUser>(
    "users",
    [],
    isRealAuth && !!authUser,
    {
      constraints: authUser
        ? [where(documentId(), "==", authUser.uid)]
        : [],
    }
  );

  const provisionalUser =
    profileCol.data[0] ||
    blankProfileFor(
      authUser?.uid || "",
      authUser?.email || "",
      authUser?.displayName || null
    );

  // ---------------------------------------------------------------------------
  // Admin / Department Admin users collection
  // ---------------------------------------------------------------------------

  const adminUsersCol = useFirestoreCollection<DemoUser>(
    "users",
    [],
    isRealAuth &&
      !!authUser &&
      (provisionalUser.role === "ADMIN" ||
        provisionalUser.role === "DEPARTMENT_ADMIN"),
    provisionalUser.role === "DEPARTMENT_ADMIN"
      ? {
          constraints: provisionalUser.department
            ? [
                where("department", "in", [
                  provisionalUser.department,
                  "Unassigned",
                ]),
              ]
            : [where("department", "==", "Unassigned")],

          scopeKey: `${provisionalUser.role}:${
            provisionalUser.department || ""
          }:${authUser?.uid || ""}`,
        }
      : {
          scopeKey: `${provisionalUser.role}:${
            provisionalUser.department || ""
          }:${authUser?.uid || ""}`,
        }
  );

  // ---------------------------------------------------------------------------
  // Provision new authenticated users
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isRealAuth || !authUser || !profileCol.ready) {
      return;
    }

    // Password users must verify their email.
    if (
      !authUser.emailVerified &&
      authUser.providerData.some(
        (provider) => provider.providerId === "password"
      )
    ) {
      void signOutUser();
      return;
    }

    // Create a Firestore profile for a brand-new Firebase Auth user.
    if (!profileCol.data[0]) {
      void profileCol.upsert(
        blankProfileFor(
          authUser.uid,
          authUser.email || "",
          authUser.displayName
        )
      );
    }

    // Intentionally do not include profileCol.data/profileCol.upsert
    // in dependencies because the profile creation itself changes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealAuth, authUser, profileCol.ready]);

  // ---------------------------------------------------------------------------
  // Effective user
  // ---------------------------------------------------------------------------

  const user: DemoUser = isRealAuth ? provisionalUser : demoUser;
  const usersForAdmin = adminUsersCol.data;

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const [tab, setTab] = useState<TabKey>("dashboard");

  // ---------------------------------------------------------------------------
  // Firestore collections
  // ---------------------------------------------------------------------------

  const collectionsEnabled = isRealAuth ? !!authUser : false;

  const scopedConstraints =
    isRealAuth && authUser && user.role !== "ADMIN"
      ? user.role === "DEPARTMENT_ADMIN" &&
        user.department &&
        user.wing
        ? [
            where("department", "==", user.department),
            where("wing", "==", user.wing),
          ]
        : [where("ownerUid", "==", authUser.uid)]
      : [];

  const mailCol = useFirestoreCollection<MailItem>(
    "mail",
    initialMail,
    collectionsEnabled,
    {
      constraints: scopedConstraints,
      scopeKey: `${user.role}:${user.department || ""}:${
        authUser?.uid || ""
      }`,
    }
  );

  const mailAccountsCol = useFirestoreCollection<MailAccount>(
    "mailAccounts",
    initialMailAccounts,
    collectionsEnabled
  );

  const incomingCol = useFirestoreCollection<IncomingLetter>(
    "incomingLetters",
    initialIncoming,
    collectionsEnabled,
    {
      constraints: scopedConstraints,
      scopeKey: `${user.role}:${user.department || ""}:${
        authUser?.uid || ""
      }`,
    }
  );

  const markingsCol = useFirestoreCollection<Marking>(
    "markings",
    initialMarkings,
    collectionsEnabled,
    {
      constraints:
        user.role === "ADMIN"
          ? []
          : [where("markedTo", "==", user.seat)],

      scopeKey: `${user.role}:${user.seat}:${authUser?.uid || ""}`,
    }
  );

  const subsCol = useFirestoreCollection<PaymentVerification>(
    "paymentVerifications",
    initialSubs,
    collectionsEnabled
  );

  const documentsCol = useFirestoreCollection<DocumentRecord>(
    "documents",
    initialDocuments,
    collectionsEnabled,
    {
      constraints: scopedConstraints,
      scopeKey: `${user.role}:${user.department || ""}:${
        authUser?.uid || ""
      }`,
    }
  );

  const templatesCol = useFirestoreCollection<DocTemplate>(
    "templates",
    initialTemplates,
    collectionsEnabled
  );

  const attachmentsCol = useFirestoreCollection<AttachmentRecord>(
    "attachments",
    [],
    collectionsEnabled
  );

  const styleSampleConstraints =
    isRealAuth && authUser && user.role !== "ADMIN"
      ? [where("ownerUid", "==", authUser.uid)]
      : [];

  const styleSamplesCol = useFirestoreCollection<StyleSample>(
    "styleSamples",
    initialStyleSamples,
    collectionsEnabled,
    {
      constraints: styleSampleConstraints,
      scopeKey: `${user.role}:${user.department || ""}:${
        authUser?.uid || ""
      }`,
    }
  );

  const auditCol = useFirestoreCollection<AuditEntry>(
    "auditLog",
    initialAuditLog,
    collectionsEnabled
  );

  const rulesCol = useFirestoreCollection<RuleRecord>(
    "rules",
    initialRules,
    collectionsEnabled
  );

  const circularsCol = useFirestoreCollection<CircularRecord>(
    "circulars",
    initialCirculars,
    collectionsEnabled
  );

  const filesCol = useFirestoreCollection<FileRecord>(
    "files",
    initialFiles,
    collectionsEnabled,
    {
      constraints: scopedConstraints,
      scopeKey: `${user.role}:${user.department || ""}:${
        authUser?.uid || ""
      }`,
    }
  );

  // ---------------------------------------------------------------------------
  // Collection data
  // ---------------------------------------------------------------------------

  const files = filesCol.data;

  const mail = mailCol.data;
  const incoming = incomingCol.data;
  const markings = markingsCol.data;

  const subs = subsCol.data;
  const documents = documentsCol.data;
  const templates = templatesCol.data;
  const attachments = attachmentsCol.data;

  const auditLog = auditCol.data;
  const rules = rulesCol.data;
  const circulars = circularsCol.data;

  const mailAccounts = mailAccountsCol.data;
  const styleSamples = styleSamplesCol.data;

  // ---------------------------------------------------------------------------
  // Editor state
  // ---------------------------------------------------------------------------

  const [activeLetterForEditor, setActiveLetterForEditor] =
    useState<string | null>(null);

  const [pendingTemplate, setPendingTemplate] =
    useState<DocTemplate | null>(null);

  // ---------------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------------

  const isAdmin = user.role === "ADMIN";

  const isDeptAdmin =
    user.role === "DEPARTMENT_ADMIN" || isAdmin;

  // ---------------------------------------------------------------------------
  // Markings
  // ---------------------------------------------------------------------------

  const myMarkings = markings.filter(
    (m) =>
      m.markedTo === user.seat &&
      m.status !== "ACTIONED"
  );

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  function logAudit(action: string, target: string) {
    // Audit records are server-generated only.
    console.info("[audit]", {
      action,
      target,
      actorUid: authUser?.uid || user.id,
    });
  }

  // ---------------------------------------------------------------------------
  // Mail
  // ---------------------------------------------------------------------------

  function importMail(id: string) {
    const item = mail.find((m) => m.id === id);

    if (!item) {
      return;
    }

    const newId =
      "IL-2026-" +
      String(9000 + incoming.length).slice(-4);

    incomingCol.upsert({
      id: newId,
      ownerUid: authUser?.uid || user.id,
      department: user.department || "Unassigned",
      wing: user.wing,
      subject: item.subject,
      from: item.from,
      dept: "Email Import",
      date: item.date,
      classification: "Routine",
      locked: true,
      content: item.body,
    });

    mailCol.upsert({
      ...item,
      ownerUid: authUser?.uid || user.id,
      department: user.department || "Unassigned",
      wing: user.wing,
      imported: true,
      linkedIncomingLetterId: newId,
    } as MailItem);

    logAudit("IMPORTED_MAIL", item.subject);

    setTab("incoming");
  }

  function createDocumentFromMail(id: string) {
    const item = mail.find((m) => m.id === id);

    if (!item) {
      return;
    }

    let letterId = item.linkedIncomingLetterId;

    if (!letterId) {
      letterId =
        "IL-2026-" +
        String(9000 + incoming.length).slice(-4);

      incomingCol.upsert({
        id: letterId,
        ownerUid: authUser?.uid || user.id,
        department: user.department || "Unassigned",
        wing: user.wing,
        subject: item.subject,
        from: item.from,
        dept: "Email Import",
        date: item.date,
        classification: "Routine",
        locked: true,
        content: item.body,
      });

      mailCol.upsert({
        ...item,
        imported: true,
        linkedIncomingLetterId: letterId,
      });

      logAudit("IMPORTED_MAIL", item.subject);
    }

    setActiveLetterForEditor(letterId);
    logAudit("DRAFTED_FROM_MAIL", item.subject);
    setTab("editor");
  }

  function draftDirectFromLetter(letterId: string) {
    setActiveLetterForEditor(letterId);
    logAudit("DRAFTED_FROM_LETTER", letterId);
    setTab("editor");
  }

  function handleMailFetched(items: MailItem[]) {
    items.forEach((item) => {
      mailCol.upsert({
        ...item,
        ownerUid: authUser?.uid || user.id,
        department: user.department || "Unassigned",
        wing: user.wing,
      } as MailItem);
    });

    logAudit(
      "SYNCED_MAILBOX",
      `${items.length} message(s)`
    );
  }

  function handleMailAccountConnected(
    account: MailAccount
  ) {
    logAudit(
      "CONNECTED_MAILBOX",
      account.officeEmail
    );
  }

  function handleMailAccountDisconnected(
    accountId: string
  ) {
    logAudit(
      "DISCONNECTED_MAILBOX",
      accountId
    );
  }

  function handleMailAccountJoined(
    accountId: string
  ) {
    logAudit(
      "JOINED_MAILBOX",
      accountId
    );
  }

  function handleMailAccountLeft(
    accountId: string
  ) {
    logAudit(
      "LEFT_MAILBOX",
      accountId
    );
  }

  // ---------------------------------------------------------------------------
  // Marking workflow
  // ---------------------------------------------------------------------------

  function createMarking({
    incomingLetterId,
    markedTo,
    instructions,
  }: {
    incomingLetterId: string;
    markedTo: string;
    instructions: string;
  }) {
    const id =
      "MK-" +
      Date.now().toString().slice(-8);

    markingsCol.upsert({
      id,
      incomingLetterId,
      markedBy: user.seat,
      markedTo,
      instructions,
      status: "PENDING",
      markedAt: new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", " "),
      linkedDocumentId: null,
    });

    logAudit(
      "MARKED",
      `${incomingLetterId} → ${markedTo}`
    );
  }

  function actionMarking(
    markingId: string,
    linkedDocumentId: string
  ) {
    const marking = markings.find(
      (x) => x.id === markingId
    );

    if (!marking) {
      return;
    }

    markingsCol.upsert({
      ...marking,
      status: "ACTIONED",
      linkedDocumentId,
    });
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  async function verifyPayment(
    id: string,
    status: "VERIFIED" | "REJECTED"
  ) {
    try {
      if (status === "VERIFIED") {
        await adminActions.verifyPayment(id);
      } else {
        await adminActions.rejectPayment(id);
      }
    } catch (err: any) {
      alert(
        err?.message ||
          "Could not update payment status."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  function upsertDocument(
    doc: DocumentRecord
  ) {
    documentsCol.upsert(doc);
  }

  // ---------------------------------------------------------------------------
  // Style samples
  // ---------------------------------------------------------------------------

  function saveStyleSample(
    title: string,
    docType: DocType,
    text: string
  ) {
    const id =
      "STYLE-" +
      Date.now().toString().slice(-8);

    styleSamplesCol.upsert({
      id,
      ownerSeat: user.seat,
      ownerUid: authUser?.uid || user.id,
      title,
      docType,
      sampleText: text,
      createdAt: new Date().toISOString(),
    });

    logAudit(
      "SAVED_STYLE_SAMPLE",
      title
    );

    setActiveStyleSample(id);

    return id;
  }

  function saveAsTemplate(
    title: string,
    description: string,
    docType: DocType,
    paras: string[]
  ) {
    const id =
      "TPL-P-" +
      Date.now().toString().slice(-8);

    templatesCol.upsert({
      id,
      scope: "PERSONAL",
      type: docType,
      title,
      description,
      owner: user.seat,
      ownerUid: authUser?.uid || user.id,
      department:
        user.department || "Unassigned",
      paras,
    });

    logAudit(
      "SAVED_TEMPLATE",
      title
    );
  }

  function setActiveStyleSample(
    sampleId: string | null
  ) {
    if (isRealAuth) {
      profileCol.upsert({
        ...user,
        activeStyleSampleId: sampleId,
      });
    } else {
      setDemoUser((prev) => ({
        ...prev,
        activeStyleSampleId: sampleId,
      }));
    }

    if (sampleId) {
      logAudit(
        "SET_ACTIVE_STYLE_SAMPLE",
        sampleId
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  function uploadRule({
    category,
    title,
    sourceNote,
    fullText,
  }: {
    category: string;
    title: string;
    sourceNote: string;
    fullText: string;
  }) {
    const id =
      "RULE-" +
      Date.now().toString().slice(-8);

    rulesCol.upsert({
      id,
      category,
      title,
      sourceNote,
      fullText,
      status: "PENDING_VERIFICATION",
      uploadedBy: user.seat,
      uploadedAt: new Date()
        .toISOString()
        .slice(0, 10),
      origin: "USER_UPLOAD",
    });

    logAudit(
      "UPLOADED_RULE",
      title
    );
  }

  async function verifyRule(id: string) {
    try {
      await adminActions.verifyRule(id);
    } catch (err: any) {
      alert(
        err?.message ||
          "Could not verify this rule."
      );
    }
  }

  async function rejectRule(id: string) {
    try {
      await adminActions.rejectRule(id);
    } catch (err: any) {
      alert(
        err?.message ||
          "Could not reject this rule."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Circular scraper
  // ---------------------------------------------------------------------------

  async function runScraper(
    sourceKey: ScrapeSourceKey
  ) {
    const result =
      await scrapeCircularsNow(sourceKey);

    logAudit(
      "SCRAPER_RUN",
      `${sourceKey} — ${result.written} new circular(s) found`
    );

    return result;
  }

  async function publishCircular(
    id: string
  ) {
    try {
      await adminActions.publishCircular(id);
    } catch (err: any) {
      alert(
        err?.message ||
          "Could not publish this circular as a rule."
      );
    }
  }

  async function dismissCircular(
    id: string
  ) {
    try {
      await adminActions.dismissCircular(id);
    } catch (err: any) {
      alert(
        err?.message ||
          "Could not dismiss this circular."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Admin notification count
  // ---------------------------------------------------------------------------

  const pendingReviewCount =
    rules.filter(
      (r) =>
        r.status === "PENDING_VERIFICATION" &&
        r.origin === "USER_UPLOAD"
    ).length +
    circulars.filter(
      (c) => c.status === "PENDING_REVIEW"
    ).length;

  // ===========================================================================
  // AUTH GATING
  // ===========================================================================

  if (
    isProductionBuild &&
    (!firebaseConfigured ||
      !securityConfigured)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-6">
        <div className="max-w-xl bg-white border border-brick/20 rounded-sm p-8 text-center">
          <h1 className="font-display text-2xl text-navy mb-2">
            Portal configuration incomplete
          </h1>

          <p className="text-sm text-ink/60">
            Production configuration is missing.
            Set all required environment variables
            and redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (isRealAuth && !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <p className="text-sm text-ink/50 font-mono">
          Loading…
        </p>
      </div>
    );
  }

  if (isRealAuth && !authUser) {
    return <Login />;
  }

  // ===========================================================================
  // MAIN APPLICATION
  // ===========================================================================

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ------------------------------------------------------------------- */}
      {/* Sidebar */}
      {/* ------------------------------------------------------------------- */}

      <Sidebar
        tab={tab}
        setTab={setTab}
        isDeptAdmin={isDeptAdmin}
        myMarkingsCount={myMarkings.length}
      />

      {/* ------------------------------------------------------------------- */}
      {/* Main area */}
      {/* ------------------------------------------------------------------- */}

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* --------------------------------------------------------------- */}
        {/* Top Bar */}
        {/* --------------------------------------------------------------- */}

        <div
          className="shrink-0 transition-transform duration-300 ease-out z-20"
          style={{
            transform: topBarVisible
              ? "translateY(0)"
              : "translateY(-100%)",
          }}
        >
          <TopBar
            user={user}
            setUser={setDemoUser}
            notificationCount={
              isDeptAdmin
                ? pendingReviewCount
                : 0
            }
            onNotificationClick={() =>
              setTab("rules")
            }
            isRealAuth={isRealAuth}
            onSignOut={() => signOutUser()}
          />

          {/* New / unassigned user notice */}

          {isRealAuth &&
            user.role === "USER" &&
            user.designation.startsWith(
              "Unassigned"
            ) && (
              <div className="bg-brick/10 text-[11px] text-brick text-center py-1.5 font-mono">
                Your account is registered but not
                yet set up by an Admin — most
                features are read-only until then.
              </div>
            )}
        </div>

        {/* --------------------------------------------------------------- */}
        {/* Main scroll area */}
        {/* --------------------------------------------------------------- */}

        <main
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto px-8 py-7 max-w-6xl w-full mx-auto"
        >
          {/* Dashboard */}

          {tab === "dashboard" && (
            <Dashboard
              user={user}
              myMarkings={myMarkings}
              incoming={incoming}
              files={files}
              onGoto={setTab}
            />
          )}

          {/* Lazy-loaded tabs */}

          <Suspense fallback={<TabFallback />}>
            {/* Search */}

            {tab === "search" && (
              <GlobalSearch
                files={files}
                incoming={incoming}
                documents={documents}
                templates={templates}
                rules={rules}
              />
            )}

            {/* Incoming Letters */}

            {tab === "incoming" && (
              <IncomingLetters
                user={user}
                mail={mail}
                incoming={incoming}
                mailAccounts={mailAccounts}
                onImport={importMail}
                onCreateDocument={
                  createDocumentFromMail
                }
                onDraftDirect={
                  draftDirectFromLetter
                }
                onMark={(letterId) => {
                  setTab("marking");
                  setActiveLetterForEditor(
                    letterId
                  );
                }}
                onMailAccountConnected={
                  handleMailAccountConnected
                }
                onMailAccountDisconnected={
                  handleMailAccountDisconnected
                }
                onMailAccountJoined={
                  handleMailAccountJoined
                }
                onMailAccountLeft={
                  handleMailAccountLeft
                }
                onMailFetched={
                  handleMailFetched
                }
              />
            )}

            {/* Marking */}

            {tab === "marking" && (
              <MarkingWorkflow
                user={user}
                incoming={incoming}
                markings={markings}
                onCreateMarking={
                  createMarking
                }
                preselectedLetter={
                  activeLetterForEditor
                }
                onDraftResponse={(letterId) => {
                  setActiveLetterForEditor(
                    letterId
                  );
                  setTab("editor");
                }}
              />
            )}

            {/* Document Editor */}

            {tab === "editor" && (
              <DocumentEditor
                user={user}
                incoming={incoming}
                preselectedLetter={
                  activeLetterForEditor
                }
                markings={markings}
                documents={documents}
                templates={templates}
                onLinkMarking={
                  actionMarking
                }
                onUpsertDocument={
                  upsertDocument
                }
                onLogAudit={logAudit}
                styleSamples={styleSamples}
                onSaveStyleSample={
                  saveStyleSample
                }
                onSetActiveStyle={
                  setActiveStyleSample
                }
                onSaveAsTemplate={
                  saveAsTemplate
                }
                attachments={attachments}
                authUid={
                  authUser?.uid || user.id
                }
                applyTemplateOnMount={
                  pendingTemplate
                }
                onTemplateConsumed={() =>
                  setPendingTemplate(null)
                }
              />
            )}

            {/* Templates */}

            {tab === "templates" && (
              <TemplatesLibrary
                templates={templates}
                user={user}
                onUseTemplate={(tpl) => {
                  setPendingTemplate(tpl);
                  setTab("editor");
                }}
              />
            )}

            {/* Files */}

            {tab === "files" && (
              <FilesRegister
                files={files}
                user={user}
                canMoveAny={isDeptAdmin}
              />
            )}

            {/* Rules */}

            {tab === "rules" && (
              <RulesLibrary
                user={user}
                isDeptAdmin={isDeptAdmin}
                rules={rules}
                circulars={circulars}
                onUploadRule={uploadRule}
                onVerifyRule={verifyRule}
                onRejectRule={rejectRule}
                onRunScraper={runScraper}
                onPublishCircular={
                  publishCircular
                }
                onDismissCircular={
                  dismissCircular
                }
              />
            )}

            {/* Admin */}

            {tab === "admin" && (
              <AdminPanel
                isAdmin={isAdmin}
                isDeptAdmin={isDeptAdmin}
                subs={subs}
                onVerify={verifyPayment}
                auditLog={auditLog}
                users={
                  isRealAuth
                    ? usersForAdmin
                    : DEMO_USERS
                }
                isRealAuth={isRealAuth}
                myDepartment={
                  user.department
                }
                onUpdateUser={async (
                  uid,
                  patch
                ) => {
                  if (isRealAuth) {
                    await updateUser(
                      uid,
                      patch
                    );
                  } else {
                    const existing =
                      DEMO_USERS.find(
                        (u) => u.id === uid
                      );

                    if (existing) {
                      void adminUsersCol.upsert(
                        {
                          ...existing,
                          ...patch,
                        }
                      );
                    }
                  }
                }}
              />
            )}
          </Suspense>
        </main>

        {/* --------------------------------------------------------------- */}
        {/* Footer */}
        {/* --------------------------------------------------------------- */}

        <footer className="text-center text-[11px] text-navy/50 py-4 font-mono tracking-wide">
          हरियाणा परिवहन विभाग · Transport Department,
          Haryana&nbsp; · &nbsp;Prototype build v6.2 spec
          · Firebase-backed
        </footer>
      </div>
    </div>
  );
}