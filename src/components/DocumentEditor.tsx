import React, { useEffect, useState } from "react";
import { classNames, SealBadge } from "./common";
import {
  DemoUser,
  IncomingLetter,
  Marking,
  DocumentRecord,
  DocType,
  DocTemplate,
  SignatureRecord,
  AttachmentRecord,
  DocVersion,
  StyleSample,
} from "../data/mockData";
import { draftNotingWithAI } from "../lib/claudeApi";
import { SignaturePad } from "./SignaturePad";
import { SharingPanel } from "./SharingPanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { resolveDocumentOwnership } from "../lib/documentOwnership";
import { VersionHistory } from "./VersionHistory";
import { StyleSamplePanel } from "./StyleSamplePanel";

const DEFAULTS: Record<DocType, string[]> = {
  NOTING: ["Facts of the case: ", "Analysis: ", "Suggestions: ", "Conclusion: "],
  LETTER: [
    "Sir/Madam, with reference to the subject cited above, it is stated that ",
    "It is therefore requested that necessary action be taken accordingly.",
    "This is for your information and necessary action please.",
  ],
  ENDORSEMENT: ["A copy of the above is forwarded to the following for information and necessary action:", "1. \n2. "],
};

const TYPE_LABEL: Record<DocType, string> = { NOTING: "नोटिंग", LETTER: "पत्र", ENDORSEMENT: "पृष्ठांकन (Endorsement)" };

export function DocumentEditor({
  user,
  incoming,
  preselectedLetter,
  markings,
  documents,
  templates,
  styleSamples,
  onLinkMarking,
  onUpsertDocument,
  onLogAudit,
  onSaveStyleSample,
  onSetActiveStyle,
  onSaveAsTemplate,
  attachments,
  authUid,
  applyTemplateOnMount,
  onTemplateConsumed,
}: {
  user: DemoUser;
  incoming: IncomingLetter[];
  preselectedLetter: string | null;
  markings: Marking[];
  documents: DocumentRecord[];
  templates: DocTemplate[];
  styleSamples: StyleSample[];
  onLinkMarking: (markingId: string, linkedDocumentId: string) => void;
  onUpsertDocument: (doc: DocumentRecord) => void;
  onLogAudit: (action: string, target: string) => void;
  onSaveStyleSample: (title: string, docType: DocType, text: string) => string;
  onSetActiveStyle: (sampleId: string | null) => void;
  onSaveAsTemplate: (title: string, description: string, docType: DocType, paras: string[]) => void;
  attachments: AttachmentRecord[];
  authUid: string;
  applyTemplateOnMount?: DocTemplate | null;
  onTemplateConsumed?: () => void;
}) {
  const [docId, setDocId] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>("NOTING");
  const [title, setTitle] = useState("Untitled Document");
  const [letterId, setLetterId] = useState<string>(preselectedLetter || incoming[0]?.id || "");
  const [toAddress, setToAddress] = useState("");
  const [refNo, setRefNo] = useState("");
  const [paras, setParas] = useState<string[]>(DEFAULTS.NOTING);
  const [signature, setSignature] = useState<SignatureRecord | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [krutiDev, setKrutiDev] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showMyDocs, setShowMyDocs] = useState(false);
  const [styleSampleText, setStyleSampleText] = useState("");

  const activeSample = styleSamples.find((s) => s.id === user.activeStyleSampleId);

  // Auto-load the user's sticky default style sample — no need to
  // paste/pick it again every time. It stays applied until the user
  // explicitly provides/picks a different one or clears it (see
  // StyleSamplePanel: "Use a different sample" / "Stop using a style sample").
  useEffect(() => {
    if (activeSample) setStyleSampleText(activeSample.sampleText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.activeStyleSampleId]);

  useEffect(() => {
    if (preselectedLetter) setLetterId(preselectedLetter);
  }, [preselectedLetter]);

  useEffect(() => {
    if (applyTemplateOnMount) {
      setDocId(null);
      setDocType(applyTemplateOnMount.type);
      setParas(applyTemplateOnMount.paras);
      setTitle(applyTemplateOnMount.title);
      setSignature(null);
      setVersions([]);
      onTemplateConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTemplateOnMount]);

  const letter = incoming.find((l) => l.id === letterId);
  const relatedMarking = markings.find((m) => m.incomingLetterId === letterId && m.markedTo === user.seat && m.status === "PENDING");
  // Always read live from `documents` (the real-time Firestore listener),
  // never from local state — sharedWith is written by the backend
  // (POST /api/documents/:id/share), so this is the only way the UI
  // reflects a share/revoke that just happened.
  const currentSharedWith = (docId && documents.find((d) => d.id === docId)?.sharedWith) || {};

  function startNewDocument(type: DocType) {
    setDocId(null);
    setDocType(type);
    setTitle(letter ? `${TYPE_LABEL[type]} — ${letter.subject}` : "Untitled Document");
    setToAddress("");
    setRefNo("");
    setParas(DEFAULTS[type]);
    setSignature(null);
    setVersions([]);
  }

  function openDocument(doc: DocumentRecord) {
    setDocId(doc.id);
    setDocType(doc.type);
    setTitle(doc.title);
    setLetterId(doc.letterId || letterId);
    setToAddress(doc.toAddress || "");
    setRefNo(doc.refNo || "");
    setParas(doc.paras);
    setSignature(doc.signature);
    setVersions(doc.versions);
    setShowMyDocs(false);
  }

  function applyTemplate(tpl: DocTemplate) {
    setDocType(tpl.type);
    setParas(tpl.paras);
    setTitle(tpl.title);
  }

  function updatePara(i: number, val: string) {
    setParas((prev) => prev.map((p, idx) => (idx === i ? val : p)));
  }
  function addPara() {
    setParas((prev) => [...prev, ""]);
  }

  async function draftWithAI() {
    if (!letter) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const text = await draftNotingWithAI({ letterSubject: letter.subject, letterContent: letter.content, styleSample: styleSampleText || undefined });
      const parts = text.split(/\n\s*\n/).filter(Boolean);
      setParas(parts.length ? parts : [text]);
    } catch (err: any) {
      setAiError("AI drafting failed: " + err.message);
    }
    setAiLoading(false);
  }

  function buildRecord(nextVersions: DocVersion[]): DocumentRecord {
    // See src/lib/documentOwnership.ts for why this is a separate,
    // independently-tested function rather than inline logic here — it
    // fixes a real bug that broke EDIT-permission document sharing.
    const existing = docId ? documents.find((d) => d.id === docId) : undefined;
    const ownership = resolveDocumentOwnership(existing, user);
    return {
      id: docId || "DOC-" + Date.now().toString().slice(-6),
      type: docType,
      title,
      letterId: letterId || null,
      toAddress: docType !== "NOTING" ? toAddress : undefined,
      refNo: docType !== "NOTING" ? refNo : undefined,
      paras,
      signature,
      versions: nextVersions,
      shares: [],
      sharedWith: currentSharedWith, // preserve — buildRecord's caller does a non-merge write, so this must be re-included on every save or a share would silently vanish on the next edit
      ...ownership,
      updatedAt: new Date().toISOString(),
      classification: "Routine",
    };
  }

  function saveDocument() {
    const newVersion: DocVersion = { version: versions.length + 1, paras, savedAt: new Date().toISOString(), savedBy: user.seat };
    const nextVersions = [...versions, newVersion];
    const record = buildRecord(nextVersions);
    setDocId(record.id);
    setVersions(nextVersions);
    onUpsertDocument(record);
    onLogAudit(docId ? "UPDATED_DOCUMENT" : "CREATED_DOCUMENT", `${record.type} — ${record.title}`);
    if (relatedMarking) {
      onLinkMarking(relatedMarking.id, record.id);
      onLogAudit("ACTIONED_MARKING", `${relatedMarking.id} via ${record.id}`);
    }
    alert("Saved as " + record.id + " (v" + newVersion.version + ")" + (relatedMarking ? " — marking " + relatedMarking.id + " → ACTIONED." : "."));
  }

  function persistSignature(sig: SignatureRecord | null) {
    if (!docId) return;
    const record = { ...buildRecord(versions), signature: sig };
    setSignature(sig);
    onUpsertDocument(record);
    onLogAudit(sig ? "SIGNED_DOCUMENT" : "CLEARED_SIGNATURE", `${docType} — ${title}`);
  }

  function handleShareChanged() {
    // No local state to update — `documents` (the real-time Firestore
    // listener in App.tsx) will refresh automatically once the backend
    // writes the new sharedWith map; currentSharedWith above re-derives
    // from it on next render.
    onLogAudit("SHARED_DOCUMENT", `${docId} — sharing updated`);
  }

  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");

  function submitSaveAsTemplate() {
    if (!templateTitle.trim()) return;
    onSaveAsTemplate(templateTitle.trim(), templateDesc.trim(), docType, paras);
    setShowSaveTemplate(false);
    setTemplateTitle("");
    setTemplateDesc("");
  }

  function restoreVersion(v: DocVersion) {
    setParas(v.paras);
  }

  const myDocs = documents.filter((d) => d.createdBy === user.seat);

  return (
    <div className="rise-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-navy">Document Editor</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMyDocs((v) => !v)} className="text-xs font-semibold border border-navy text-navy px-3 py-1.5 rounded-sm hover:bg-navy/5">
            My Documents ({myDocs.length})
          </button>
          <select value={docType} onChange={(e) => startNewDocument(e.target.value as DocType)} className="text-sm border border-[#d8cfb6] rounded-md px-3 py-1.5 bg-white">
            <option value="NOTING">Noting</option>
            <option value="LETTER">Letter</option>
            <option value="ENDORSEMENT">Endorsement</option>
          </select>
          <select value={letterId} onChange={(e) => setLetterId(e.target.value)} className="text-sm border border-[#d8cfb6] rounded-md px-3 py-1.5 bg-white">
            {incoming.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showMyDocs && (
        <div className="mb-5 bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
          <h4 className="font-display text-sm text-navy mb-2">My saved documents</h4>
          {myDocs.length === 0 && <p className="text-xs text-ink/45">Koi document abhi save nahi hua.</p>}
          <div className="space-y-1.5">
            {myDocs.map((d) => (
              <button key={d.id} onClick={() => openDocument(d)} className="w-full text-left text-sm hover:bg-[#f4efe1] px-2 py-1.5 rounded-sm flex items-center gap-2">
                <SealBadge tone="navy">{d.type}</SealBadge>
                <span className="flex-1">{d.title}</span>
                <span className="text-[10px] font-mono text-ink/40">v{d.versions.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {letter && (
        <div className="mb-4 text-sm bg-[#f4efe1] border border-[#d8cfb6] rounded-sm px-4 py-2.5">
          <span className="font-semibold">Re:</span> {letter.subject}
          {relatedMarking && (
            <span className="ml-3">
              <SealBadge tone="brick">Linked marking {relatedMarking.id} on save</SealBadge>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full font-display text-lg text-navy bg-transparent border-b border-[#d8cfb6] focus:outline-none pb-1" />

          <div id="print-area" className={classNames("noting-sheet rounded-sm", krutiDev && "font-mono")}>
            <div className="px-6 pt-5 pb-2 flex items-center justify-between border-b border-[#e6dcc2]">
              <div className="font-hindi text-sm text-navy">हरियाणा परिवहन विभाग — {TYPE_LABEL[docType]}</div>
              <div className="text-[10px] font-mono text-ink/40">{docType === "NOTING" ? "Legal" : "A4"} · print-ready</div>
            </div>

            {docType !== "NOTING" && (
              <div className="px-6 pt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-ink/50">{docType === "ENDORSEMENT" ? "Forwarded To" : "To"}</label>
                  <input value={toAddress} onChange={(e) => setToAddress(e.target.value)} className="w-full border-b border-[#e6dcc2] bg-transparent focus:outline-none py-1" />
                </div>
                <div>
                  <label className="text-ink/50">Reference No.</label>
                  <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className="w-full border-b border-[#e6dcc2] bg-transparent focus:outline-none py-1" />
                </div>
              </div>
            )}

            <div className="noting-body">
              {paras.map((p, i) => (
                <div key={i} className="mb-4">
                  <textarea
                    value={p}
                    onChange={(e) => updatePara(i, e.target.value)}
                    rows={3}
                    className="noting-para w-full resize-none bg-transparent focus:outline-none focus:bg-[#f4efe1]/50 text-sm leading-[1.85] rounded-sm px-1"
                  />
                </div>
              ))}
              <button onClick={addPara} className="text-xs text-brick font-semibold hover:underline">
                + Add paragraph
              </button>
              <div className="mt-8 pt-4 border-t border-dashed border-[#d8cfb6] text-xs text-ink/40">HOD stamp area · Senior officer blank area</div>
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-ink/60">
            <input type="checkbox" checked={krutiDev} onChange={(e) => setKrutiDev(e.target.checked)} />
            Kruti Dev preview (mock toggle)
          </label>
        </div>

        <div className="space-y-4">
          <div className="bg-navy rounded-sm p-5">
            <h4 className="font-display text-sm text-[#e7ddc4] mb-2">AI Drafting Assist</h4>
            <p className="text-[11px] text-[#e7ddc4]/65 mb-3">
              Calls your backend's <code className="font-mono">/api/ai/draft-noting</code> route (via OmniRoute).
            </p>

            <div className="bg-white/5 rounded-sm p-3 mb-3">
              <h5 className="text-[11px] font-semibold text-[#e7ddc4] mb-1.5">Write in my style</h5>
              <StyleSamplePanel
                user={user}
                docType={docType}
                savedSamples={styleSamples}
                activeSample={activeSample}
                activeSampleText={styleSampleText}
                onChangeActiveSample={setStyleSampleText}
                onSaveSample={(t, text) => onSaveStyleSample(t, docType, text)}
                onSetActiveStyle={onSetActiveStyle}
              />
            </div>

            <button onClick={draftWithAI} disabled={aiLoading} className="w-full bg-gold hover:opacity-90 disabled:opacity-50 text-navy-deep text-sm font-semibold px-4 py-2 rounded-sm">
              {aiLoading ? "Drafting…" : "Generate draft with AI"}
            </button>
            {aiError && <p className="text-[11px] text-red-300 mt-2">{aiError}</p>}
          </div>

          <button onClick={saveDocument} className="w-full bg-brick hover:bg-brick-deep text-white text-sm font-semibold px-4 py-2.5 rounded-sm">
            Save Document {relatedMarking ? "& Action Marking" : ""} →
          </button>
          <button onClick={() => window.print()} className="w-full border border-navy text-navy text-sm font-semibold px-4 py-2.5 rounded-sm hover:bg-navy/5">
            Print Preview (Puppeteer in prod)
          </button>

          <details className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4" open>
            <summary className="font-display text-sm text-navy cursor-pointer">Templates</summary>
            <div className="mt-2 space-y-1.5">
              {templates
                .filter((t) => t.type === docType && (t.scope === "SYSTEM" || t.owner === user.seat))
                .map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)} className="w-full text-left text-xs hover:bg-[#f4efe1] px-2 py-1.5 rounded-sm">
                    <span className="font-medium">{t.title}</span> <span className="text-ink/40">({t.scope})</span>
                  </button>
                ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[#e6dcc2]">
              {!showSaveTemplate ? (
                <button onClick={() => setShowSaveTemplate(true)} className="text-xs font-semibold text-navy hover:underline">
                  + Save current draft as a personal template
                </button>
              ) : (
                <div className="space-y-1.5">
                  <input
                    value={templateTitle}
                    onChange={(e) => setTemplateTitle(e.target.value)}
                    placeholder="Template title"
                    className="w-full text-xs border border-[#d8cfb6] rounded-sm px-2 py-1.5"
                  />
                  <input
                    value={templateDesc}
                    onChange={(e) => setTemplateDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    className="w-full text-xs border border-[#d8cfb6] rounded-sm px-2 py-1.5"
                  />
                  <div className="flex gap-2">
                    <button onClick={submitSaveAsTemplate} disabled={!templateTitle.trim()} className="text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-sm hover:bg-navy-deep disabled:opacity-50">
                      Save template
                    </button>
                    <button onClick={() => setShowSaveTemplate(false)} className="text-xs text-ink/50 hover:underline">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </details>

          <details className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
            <summary className="font-display text-sm text-navy cursor-pointer">Signature</summary>
            <div className="mt-2">
              {docId ? (
                <SignaturePad signedBy={user.name} signature={signature} onSign={persistSignature} onClear={() => persistSignature(null)} />
              ) : (
                <p className="text-[11px] text-ink/45">Document ko pehle Save karein, phir signature apply karein.</p>
              )}
            </div>
          </details>

          <details className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
            <summary className="font-display text-sm text-navy cursor-pointer">Sharing</summary>
            <div className="mt-2">
              {docId ? (
                <SharingPanel currentUser={user} docId={docId} sharedWith={currentSharedWith} onSharedChanged={handleShareChanged} />
              ) : (
                <p className="text-[11px] text-ink/45">Document ko pehle Save karein, phir share karein.</p>
              )}
            </div>
          </details>

          <details className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
            <summary className="font-display text-sm text-navy cursor-pointer">Attachments</summary>
            <div className="mt-2">
              <AttachmentsPanel user={user} authUid={authUid} linkedType="document" linkedId={docId} attachments={attachments} />
            </div>
          </details>

          <details className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
            <summary className="font-display text-sm text-navy cursor-pointer">Version History</summary>
            <div className="mt-2">
              <VersionHistory versions={versions} onRestore={restoreVersion} />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
