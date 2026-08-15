import React from "react";
import { classNames } from "./common";
import { DemoUser, Marking, IncomingLetter, FileRecord } from "../data/mockData";
import type { TabKey } from "./Layout";

export function Dashboard({
  user,
  myMarkings,
  incoming,
  files,
  onGoto,
}: {
  user: DemoUser;
  myMarkings: Marking[];
  incoming: IncomingLetter[];
  files: FileRecord[];
  onGoto: (t: TabKey) => void;
}) {
  return (
    <div className="rise-in space-y-7">
      <div>
        <h1 className="font-display text-2xl text-navy">Namaste, {user.name.split(" ")[0]} ji</h1>
        <p className="text-sm text-ink/60 mt-1">
          {user.designation} · {user.wing}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <StatCard label="Marked to Me" value={myMarkings.length} tone="brick" onClick={() => onGoto("marking")} sub="Pending action" />
        <StatCard label="Incoming Letters" value={incoming.length} tone="navy" onClick={() => onGoto("incoming")} sub="This month" />
        <StatCard
          label="Open Files"
          value={files.filter((f) => f.status === "Open").length}
          tone="green"
          onClick={() => onGoto("files")}
          sub="In register"
        />
      </div>

      <div className="noting-sheet rounded-sm">
        <div className="noting-body">
          <h2 className="font-display text-lg text-navy mb-3">Marked to Me — Action Queue</h2>
          {myMarkings.length === 0 && <p className="text-sm text-ink/50">No pending markings. Aapki queue clear hai.</p>}
          {myMarkings.map((m) => (
            <div key={m.id} className="flex items-start justify-between py-3 border-b border-[#e6dcc2] last:border-0">
              <div>
                <div className="text-sm font-medium text-ink">{m.instructions}</div>
                <div className="text-xs text-ink/50 mt-1 font-mono">
                  {m.incomingLetterId} · marked by {m.markedBy} · {m.markedAt}
                </div>
              </div>
              <button onClick={() => onGoto("marking")} className="text-xs font-semibold text-brick hover:underline shrink-0 ml-4">
                Open →
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <QuickAction title="Upload / Import Letter" desc="Manual upload ya official inbox se import." onClick={() => onGoto("incoming")} />
        <QuickAction title="Draft a Noting" desc="Word-like editor, first-line indent, AI assist." onClick={() => onGoto("editor")} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
  sub,
}: {
  label: string;
  value: number;
  tone: "brick" | "navy" | "green";
  onClick: () => void;
  sub: string;
}) {
  const toneMap: Record<string, string> = {
    brick: "border-brick text-brick",
    navy: "border-navy text-navy",
    green: "border-seal text-seal",
  };
  return (
    <button onClick={onClick} className={classNames("text-left bg-[#fdfcf8] rounded-sm border-l-4 p-5 hover:shadow-md transition-shadow", toneMap[tone])}>
      <div className="text-3xl font-display">{value}</div>
      <div className="text-sm font-medium text-ink mt-1">{label}</div>
      <div className="text-[11px] text-ink/45 mt-0.5">{sub}</div>
    </button>
  );
}

function QuickAction({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-navy text-[#e7ddc4] rounded-sm p-5 hover:bg-navy-deep transition-colors">
      <div className="font-display text-base">{title}</div>
      <div className="text-xs text-[#e7ddc4]/70 mt-1.5">{desc}</div>
    </button>
  );
}
