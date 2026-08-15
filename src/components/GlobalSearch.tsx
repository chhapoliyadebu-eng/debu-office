import React, { useMemo, useState } from "react";
import { SealBadge } from "./common";
import {
  FileRecord,
  IncomingLetter,
  DocumentRecord,
  RuleRecord,
  DocTemplate,
} from "../data/mockData";
import { logRtiSearch } from "../lib/searchApi";

export function GlobalSearch({
  files,
  incoming,
  documents,
  templates,
  rules,
}: {
  files: FileRecord[];
  incoming: IncomingLetter[];
  documents: DocumentRecord[];
  templates: DocTemplate[];
  rules: RuleRecord[];
}) {
  const [q, setQ] = useState("");
  const [rtiMode, setRtiMode] = useState(false);
  const [rtiLogged, setRtiLogged] = useState(false);
  const [rtiLogging, setRtiLogging] = useState(false);
  const [rtiError, setRtiError] = useState<string | null>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;

    const fileHits = files.filter((f) => (f.fileNo + f.subject + f.branch).toLowerCase().includes(query));
    const letterHits = incoming.filter((l) => (l.id + l.subject + l.content + l.from).toLowerCase().includes(query));
    const docHits = documents.filter((d) => (d.title + d.paras.join(" ")).toLowerCase().includes(query));
    const ruleHits = rules.filter((r) => r.status === "VERIFIED" && (r.title + r.category + r.fullText).toLowerCase().includes(query));
    const templateHits = templates.filter((t) => (t.title + t.description).toLowerCase().includes(query));

    return { fileHits, letterHits, docHits, ruleHits, templateHits };
  }, [q, files, incoming, documents, templates, rules]);

  // A search must be re-logged if the query text changes after it was
  // logged, so the recorded query always matches what was actually typed.
  function handleQueryChange(next: string) {
    setQ(next);
    setRtiLogged(false);
    setRtiError(null);
  }

  async function recordForRti() {
    if (!results || !q.trim()) return;
    setRtiLogging(true);
    setRtiError(null);
    try {
      await logRtiSearch(q.trim(), {
        files: results.fileHits.length,
        letters: results.letterHits.length,
        documents: results.docHits.length,
        rules: results.ruleHits.length,
        templates: results.templateHits.length,
      });
      setRtiLogged(true);
    } catch (err: any) {
      setRtiError(err.message || "Could not log this search.");
    }
    setRtiLogging(false);
  }

  return (
    <div className="rise-in">
      <h1 className="font-display text-2xl text-navy mb-1">Search</h1>
      <p className="text-sm text-ink/55 mb-5">Search across files, incoming letters, drafted documents, rules and templates.</p>

      <div className="flex items-center gap-3 mb-6">
        <input
          value={q}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search everything…"
          autoFocus
          className="flex-1 text-sm border border-[#d8cfb6] rounded-md px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brick/30"
        />
        <label className="flex items-center gap-1.5 text-xs text-ink/60 shrink-0">
          <input type="checkbox" checked={rtiMode} onChange={(e) => { setRtiMode(e.target.checked); setRtiLogged(false); }} />
          RTI-flagged search
        </label>
      </div>

      {rtiMode && q && (
        <div className="mb-4 text-[11px] text-ink/60 bg-[#f4efe1] border border-[#d8cfb6] rounded-sm px-3 py-2 flex items-center justify-between gap-3">
          <span>
            {rtiLogged
              ? "✓ This search (query + result counts) has been recorded in the audit log for RTI purposes."
              : "This search is NOT yet recorded. Click below once you're satisfied this represents a thorough search."}
          </span>
          {!rtiLogged && (
            <button
              onClick={recordForRti}
              disabled={rtiLogging || !results}
              className="shrink-0 text-[11px] font-semibold bg-navy text-white px-2.5 py-1 rounded-sm hover:bg-navy-deep disabled:opacity-50"
            >
              {rtiLogging ? "Logging…" : "Log this search"}
            </button>
          )}
        </div>
      )}
      {rtiError && <p className="text-xs text-brick mb-4">{rtiError}</p>}


      {!results && <p className="text-sm text-ink/40">Type to search…</p>}

      {results && (
        <div className="space-y-6">
          <ResultBlock title="Files" count={results.fileHits.length}>
            {results.fileHits.map((f) => (
              <div key={f.fileNo} className="text-sm py-1.5 border-b border-[#e6dcc2] last:border-0">
                <span className="font-mono text-xs text-brick mr-2">{f.fileNo}</span>
                {f.subject}
              </div>
            ))}
          </ResultBlock>

          <ResultBlock title="Incoming Letters" count={results.letterHits.length}>
            {results.letterHits.map((l) => (
              <div key={l.id} className="text-sm py-1.5 border-b border-[#e6dcc2] last:border-0">
                <span className="font-mono text-xs text-brick mr-2">{l.id}</span>
                {l.subject}
              </div>
            ))}
          </ResultBlock>

          <ResultBlock title="Drafted Documents" count={results.docHits.length}>
            {results.docHits.map((d) => (
              <div key={d.id} className="text-sm py-1.5 border-b border-[#e6dcc2] last:border-0 flex items-center gap-2">
                <SealBadge tone="navy">{d.type}</SealBadge> {d.title}
              </div>
            ))}
          </ResultBlock>

          <ResultBlock title="Rules Library" count={results.ruleHits.length}>
            {results.ruleHits.map((r) => (
              <div key={r.id} className="text-sm py-1.5 border-b border-[#e6dcc2] last:border-0">
                {r.title}
              </div>
            ))}
          </ResultBlock>

          <ResultBlock title="Templates" count={results.templateHits.length}>
            {results.templateHits.map((t) => (
              <div key={t.id} className="text-sm py-1.5 border-b border-[#e6dcc2] last:border-0">
                {t.title}
              </div>
            ))}
          </ResultBlock>
        </div>
      )}
    </div>
  );
}

function ResultBlock({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
      <h3 className="font-display text-sm text-navy mb-2">
        {title} <span className="text-ink/40 font-sans text-xs">({count})</span>
      </h3>
      {children}
    </div>
  );
}
