import React, { useRef, useState } from "react";
import { SignatureRecord } from "../data/mockData";

export function SignaturePad({
  signedBy,
  signature,
  onSign,
  onClear,
}: {
  signedBy: string;
  signature: SignatureRecord | null;
  onSign: (sig: SignatureRecord) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<"TYPED" | "DRAWN">("TYPED");
  const [typedText, setTypedText] = useState(signedBy);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true;
    draw(e);
  }
  function stopDraw() {
    drawing.current = false;
  }
  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1b2a41";
    ctx.beginPath();
    ctx.arc(e.clientX - rect.left, e.clientY - rect.top, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  function clearCanvas() {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }

  function submitSignature() {
    if (mode === "TYPED") {
      if (!typedText.trim()) return;
      onSign({ signedBy, signedAt: new Date().toISOString(), mode: "TYPED", typedText });
    } else {
      const dataUrl = canvasRef.current?.toDataURL();
      onSign({ signedBy, signedAt: new Date().toISOString(), mode: "DRAWN", dataUrl });
    }
  }

  if (signature) {
    return (
      <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
        <div className="text-[11px] text-ink/50 mb-1">Signed by {signature.signedBy}</div>
        {signature.mode === "TYPED" ? (
          <div className="font-display italic text-lg text-navy">{signature.typedText}</div>
        ) : (
          <img src={signature.dataUrl} alt="signature" className="h-14" />
        )}
        <div className="text-[10px] font-mono text-ink/40 mt-1">{new Date(signature.signedAt).toLocaleString()}</div>
        <button onClick={onClear} className="text-[11px] text-brick hover:underline mt-2">
          Clear &amp; re-sign
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
      <div className="flex gap-1 mb-3 text-xs">
        <button onClick={() => setMode("TYPED")} className={mode === "TYPED" ? "font-semibold text-navy underline" : "text-ink/50"}>
          Type signature
        </button>
        <span className="text-ink/30">|</span>
        <button onClick={() => setMode("DRAWN")} className={mode === "DRAWN" ? "font-semibold text-navy underline" : "text-ink/50"}>
          Draw signature
        </button>
      </div>
      {mode === "TYPED" ? (
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          className="w-full font-display italic text-lg border-b border-[#d8cfb6] focus:outline-none px-1 py-1 bg-transparent"
        />
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            width={260}
            height={80}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            className="border border-dashed border-[#d8cfb6] rounded-sm bg-white cursor-crosshair"
          />
          <button onClick={clearCanvas} className="text-[11px] text-ink/50 hover:underline block mt-1">
            Clear pad
          </button>
        </div>
      )}
      <button onClick={submitSignature} className="mt-3 bg-navy text-white text-xs font-semibold px-3 py-1.5 rounded-sm">
        Apply signature
      </button>
    </div>
  );
}
