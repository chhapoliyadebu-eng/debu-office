import React, { useState } from "react";
import { StyleSample, DocType, DemoUser } from "../data/mockData";

export function StyleSamplePanel({
  user,
  docType,
  savedSamples,
  activeSample,
  activeSampleText,
  onChangeActiveSample,
  onSaveSample,
  onSetActiveStyle,
}: {
  user: DemoUser;
  docType: DocType;
  savedSamples: StyleSample[];
  activeSample: StyleSample | undefined;
  activeSampleText: string;
  onChangeActiveSample: (text: string) => void;
  onSaveSample: (title: string, text: string) => string;
  onSetActiveStyle: (sampleId: string | null) => void;
}) {
  const [editing, setEditing] = useState(!activeSample);
  const [pasteText, setPasteText] = useState(activeSampleText);

  const relevantSamples = savedSamples.filter((s) => s.ownerSeat === user.seat);

  // ---- Sticky default is already active: show it, don't ask again ----
  if (activeSample && !editing) {
    return (
      <div>
        <p className="text-[11px] text-seal mb-2">
          ✓ Using your style: <span className="font-semibold">"{activeSample.title}"</span> — applied automatically to every
          generation until you change it.
        </p>
        <div className="flex gap-3">
          <button onClick={() => { setPasteText(""); setEditing(true); }} className="text-[11px] text-navy font-semibold hover:underline">
            Use a different sample
          </button>
          <button onClick={() => { onSetActiveStyle(null); onChangeActiveSample(""); }} className="text-[11px] text-brick hover:underline">
            Stop using a style sample
          </button>
        </div>
      </div>
    );
  }

  // ---- No sticky default yet (or user chose to replace it) — ask once ----
  function useThisSample() {
    if (!pasteText.trim()) return;
    const autoTitle = `${docType.charAt(0)}${docType.slice(1).toLowerCase()} style — ${new Date().toLocaleDateString("en-IN")}`;
    const id = onSaveSample(autoTitle, pasteText);
    onChangeActiveSample(pasteText);
    onSetActiveStyle(id);
    setEditing(false);
  }

  function pickSaved(sample: StyleSample) {
    onChangeActiveSample(sample.sampleText);
    onSetActiveStyle(sample.id);
    setEditing(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink/50">
        Apna pehle likha hua Noting/Letter yahan de do — AI usi phrasing/tone/structure mein naya draft banayegi. Ek baar dene ke
        baad, ye <strong>automatically har baar reuse</strong> hogi — dobara dena nahi padega, jab tak aap khud koi dusra sample na
        do.
      </p>

      {relevantSamples.length > 0 && (
        <div className="space-y-1">
          {relevantSamples.map((s) => (
            <button key={s.id} onClick={() => pickSaved(s)} className="w-full text-left text-xs hover:bg-white/10 px-2 py-1.5 rounded-sm text-[#e7ddc4]">
              <span className="font-medium">{s.title}</span>
              <span className="text-[#e7ddc4]/50 ml-2">{s.sampleText.slice(0, 40)}…</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={5}
        placeholder="Apna purana noting/letter yahan paste karo…"
        className="w-full text-xs border border-[#d8cfb6] rounded-sm px-2 py-1.5 focus:outline-none text-ink"
      />
      <div className="flex gap-2">
        <button onClick={useThisSample} className="text-[11px] font-semibold bg-gold text-navy-deep px-3 py-1.5 rounded-sm">
          Use this as my style →
        </button>
        {activeSample && (
          <button onClick={() => setEditing(false)} className="text-[11px] text-[#e7ddc4]/70 hover:underline">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
