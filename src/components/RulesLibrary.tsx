import React, { useState } from "react";
import { classNames, SealBadge } from "./common";
import { DemoUser, RuleRecord, CircularRecord, SCRAPE_SOURCES, ScrapeSourceKey } from "../data/mockData";

export function RulesLibrary({
  user,
  isDeptAdmin,
  rules,
  circulars,
  onUploadRule,
  onVerifyRule,
  onRejectRule,
  onRunScraper,
  onPublishCircular,
  onDismissCircular,
}: {
  user: DemoUser;
  isDeptAdmin: boolean;
  rules: RuleRecord[];
  circulars: CircularRecord[];
  onUploadRule: (args: { category: string; title: string; sourceNote: string; fullText: string }) => void;
  onVerifyRule: (id: string) => void;
  onRejectRule: (id: string) => void;
  onRunScraper: (sourceKey: ScrapeSourceKey) => Promise<{ candidatesFound: number; written: number }>;
  onPublishCircular: (id: string) => void;
  onDismissCircular: (id: string) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [category, setCategory] = useState(rules[0]?.category || "");
  const [title, setTitle] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [fullText, setFullText] = useState("");
  const [scraping, setScraping] = useState<ScrapeSourceKey | null>(null);
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const verified = rules.filter((r) => r.status === "VERIFIED");
  const pending = rules.filter((r) => r.status === "PENDING_VERIFICATION");
  const pendingCirculars = circulars.filter((c) => c.status === "PENDING_REVIEW");

  async function checkNow(sourceKey: ScrapeSourceKey) {
    setScraping(sourceKey);
    setScrapeError(null);
    setScrapeMessage(null);
    try {
      const result = await onRunScraper(sourceKey);
      setScrapeMessage(
        result.written > 0
          ? `Found ${result.written} new circular(s) — check the list below.`
          : `Checked — nothing new on the source page right now (${result.candidatesFound} link(s) scanned).`
      );
    } catch (err: any) {
      setScrapeError(err.message || "Could not reach the source site right now.");
    }
    setScraping(null);
  }

  function submitUpload() {
    if (!title.trim() || !fullText.trim()) return;
    onUploadRule({ category, title, sourceNote, fullText });
    setTitle("");
    setSourceNote("");
    setFullText("");
    setShowUpload(false);
  }

  return (
    <div className="rise-in space-y-8">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-2xl text-navy">Rules Library</h1>
          <button onClick={() => setShowUpload((v) => !v)} className="text-xs font-semibold bg-brick text-white px-3 py-1.5 rounded-sm hover:bg-brick-deep">
            {showUpload ? "Cancel" : "+ Upload a rule"}
          </button>
        </div>
        <p className="text-sm text-ink/55">
          AI can only cite rules marked <span className="font-semibold text-seal">VERIFIED</span> here — it never invents rule text.
          Any user can suggest/upload a rule; an Admin must verify it before it becomes permanently citable for everyone.
        </p>
      </div>

      {showUpload && (
        <div className="bg-navy rounded-sm p-5 space-y-3">
          <h4 className="font-display text-sm text-[#e7ddc4]">Upload a rule for verification</h4>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-sm rounded-sm px-3 py-2 bg-white/95">
            {[...new Set(rules.map((r) => r.category))].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rule / order title" className="w-full text-sm rounded-sm px-3 py-2" />
          <input value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="Source reference (order no., gazette no., file name…)" className="w-full text-sm rounded-sm px-3 py-2" />
          <textarea
            value={fullText}
            onChange={(e) => setFullText(e.target.value)}
            rows={4}
            placeholder="Paste the verified rule text here (in production: upload the source PDF/document)"
            className="w-full text-sm rounded-sm px-3 py-2"
          />
          <button onClick={submitUpload} className="text-xs font-semibold bg-gold text-navy-deep px-4 py-2 rounded-sm">
            Submit for verification →
          </button>
          <p className="text-[10px] text-[#e7ddc4]/60">
            This stays "Pending Verification" — and is <em>not</em> citable by AI — until an Admin approves it below.
          </p>
        </div>
      )}

      <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm text-navy">Circular Scrapers — Multi-Source Sync</h3>
        </div>
        <p className="text-[11px] text-ink/50 mb-3">
          Scheduled scraper syncs both <strong>CS Haryana</strong> and <strong>Finance Department Haryana</strong> portals for new
          circulars. New items land here flagged for admin review — never auto-published — with conflict detection against
          existing verified rules.
        </p>
        {isDeptAdmin && (
          <div className="flex gap-2 mb-2">
            {SCRAPE_SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => checkNow(s.key)}
                disabled={scraping === s.key}
                className="text-xs font-semibold border border-navy text-navy px-3 py-1.5 rounded-sm hover:bg-navy/5 disabled:opacity-50"
              >
                {scraping === s.key ? "Checking…" : `Check ${s.label} now`}
              </button>
            ))}
          </div>
        )}
        {scrapeMessage && <p className="text-xs text-seal mb-3">{scrapeMessage}</p>}
        {scrapeError && <p className="text-xs text-brick mb-3">{scrapeError}</p>}
        {pendingCirculars.length === 0 && <p className="text-xs text-ink/40">No pending circulars right now.</p>}
        <div className="space-y-3">
          {pendingCirculars.map((c) => {
            const conflictRule = rules.find((r) => r.id === c.possibleConflictWith);
            const source = SCRAPE_SOURCES.find((s) => s.key === c.source);
            return (
              <div key={c.id} className="border border-[#e6dcc2] rounded-sm p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <SealBadge tone={c.source === "FINANCE_HARYANA" ? "gold" : "navy"}>{source?.label}</SealBadge>
                    </div>
                    <div className="text-sm font-medium text-ink mt-1">{c.title}</div>
                    <div className="text-xs text-ink/55 mt-1">{c.summary}</div>
                    <a href={c.sourceUrl} className="text-[10px] font-mono text-brick block mt-1" onClick={(e) => e.preventDefault()}>
                      {c.sourceUrl}
                    </a>
                    <div className="text-[10px] text-ink/40 mt-0.5">Fetched {c.fetchedAt}</div>
                    {conflictRule && (
                      <div className="mt-2 text-[11px] bg-brick/10 text-brick px-2 py-1 rounded-sm inline-block">
                        ⚠ May contradict/update existing rule: "{conflictRule.title}" — review before publishing
                      </div>
                    )}
                  </div>
                  {isDeptAdmin && (
                    <div className="flex gap-2 shrink-0 ml-3">
                      <button onClick={() => onPublishCircular(c.id)} className="text-xs bg-seal text-white px-3 py-1 rounded-sm">
                        Publish as rule
                      </button>
                      <button onClick={() => onDismissCircular(c.id)} className="text-xs border border-ink/30 text-ink/60 px-3 py-1 rounded-sm">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isDeptAdmin && pending.length > 0 && (
        <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-5">
          <h3 className="font-display text-sm text-navy mb-3">Pending rule verification ({pending.length})</h3>
          <div className="space-y-2">
            {pending
              .filter((r) => r.origin === "USER_UPLOAD")
              .map((r) => (
                <div key={r.id} className="flex items-start justify-between border-b border-[#e6dcc2] last:border-0 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-[11px] text-ink/50">
                      {r.category} · uploaded by {r.uploadedBy} · {r.uploadedAt}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <button onClick={() => onVerifyRule(r.id)} className="text-xs bg-seal text-white px-3 py-1 rounded-sm">
                      Verify
                    </button>
                    <button onClick={() => onRejectRule(r.id)} className="text-xs border border-brick text-brick px-3 py-1 rounded-sm">
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            {pending.filter((r) => r.origin === "STARTER").length > 0 && (
              <p className="text-[11px] text-ink/40 pt-2">
                + {pending.filter((r) => r.origin === "STARTER").length} starter categories still awaiting a first verified source
                document.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg text-navy mb-3">Verified Rules ({verified.length})</h3>
        {verified.length === 0 && <p className="text-sm text-ink/45">No verified rules yet — upload one above or wait for admin verification.</p>}
        <div className="grid grid-cols-2 gap-3">
          {verified.map((r) => (
            <div key={r.id} className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-ink/40 uppercase">{r.category}</span>
                <SealBadge tone="green">VERIFIED</SealBadge>
              </div>
              <div className="text-sm font-medium text-ink">{r.title}</div>
              <p className="text-xs text-ink/60 mt-1.5 line-clamp-3">{r.fullText}</p>
              <div className="text-[10px] text-ink/40 mt-2">
                {r.sourceNote} · verified by {r.verifiedBy} on {r.verifiedAt}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm text-ink/50 mb-2">Categories awaiting a first source ({rules.filter((r) => r.origin === "STARTER" && r.status !== "VERIFIED").length})</h3>
        <div className="grid grid-cols-2 gap-2">
          {rules
            .filter((r) => r.origin === "STARTER" && r.status !== "VERIFIED")
            .map((r) => (
              <div key={r.id} className="bg-white/50 border border-dashed border-[#d8cfb6] rounded-sm px-3 py-2 text-xs text-ink/50 flex items-center justify-between">
                {r.category}
                <SealBadge tone="gold">NO SOURCE YET</SealBadge>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
