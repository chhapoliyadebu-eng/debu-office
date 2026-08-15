import React from "react";
import { DocVersion } from "../data/mockData";

export function VersionHistory({ versions, onRestore }: { versions: DocVersion[]; onRestore: (v: DocVersion) => void }) {
  if (versions.length === 0) {
    return <p className="text-[11px] text-ink/45">No saved versions yet — save the document to create version 1.</p>;
  }
  return (
    <div className="space-y-2">
      {[...versions].reverse().map((v) => (
        <div key={v.version} className="flex items-center justify-between text-xs bg-[#f4efe1] rounded-sm px-3 py-2">
          <div>
            <span className="font-mono font-semibold text-navy">v{v.version}</span>{" "}
            <span className="text-ink/50">
              · {v.savedBy} · {new Date(v.savedAt).toLocaleString()}
            </span>
            {v.note && <div className="text-ink/60 mt-0.5">{v.note}</div>}
          </div>
          <button onClick={() => onRestore(v)} className="text-brick font-semibold hover:underline shrink-0 ml-3">
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
