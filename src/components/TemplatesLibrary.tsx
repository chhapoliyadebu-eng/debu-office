import React, { useState } from "react";
import { classNames, SealBadge } from "./common";
import { DocTemplate, DemoUser } from "../data/mockData";

export function TemplatesLibrary({
  templates,
  user,
  onUseTemplate,
}: {
  templates: DocTemplate[];
  user: DemoUser;
  onUseTemplate: (tpl: DocTemplate) => void;
}): JSX.Element {
  const [scope, setScope] = useState<"ALL" | "SYSTEM" | "PERSONAL">("ALL");

  const visible = templates.filter((t) => {
    if (t.scope === "PERSONAL" && t.owner && t.owner !== user.seat) return false;
    if (scope === "ALL") return true;
    return t.scope === scope;
  });

  return (
    <div className="rise-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-navy">Templates</h1>
        <div className="flex bg-paper-deep rounded-md p-1 text-sm">
          {(["ALL", "SYSTEM", "PERSONAL"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={classNames("px-4 py-1.5 rounded capitalize", scope === s && "bg-white shadow-sm")}>
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {visible.map((t) => (
          <div key={t.id} className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-brick uppercase">{t.type}</span>
              <SealBadge tone={t.scope === "SYSTEM" ? "navy" : "gold"}>{t.scope}</SealBadge>
            </div>
            <h3 className="font-display text-base text-navy">{t.title}</h3>
            <p className="text-xs text-ink/55 mt-1">{t.description}</p>
            <button onClick={() => onUseTemplate(t)} className="mt-3 text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-sm hover:bg-navy-deep">
              Use this template →
            </button>
          </div>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-ink/45">No templates in this scope yet.</p>}
    </div>
  );
}
