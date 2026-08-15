import React from "react";
import type { MarkingStatus } from "../data/mockData";

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function SealBadge({
  tone = "navy",
  children,
}: {
  tone?: "navy" | "brick" | "green" | "gold";
  children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    navy: "text-navy",
    brick: "text-brick",
    green: "text-seal",
    gold: "text-gold",
  };
  return <span className={classNames("seal-badge font-mono", colorMap[tone])}>{children}</span>;
}

export function StatusPill({ status }: { status: MarkingStatus }) {
  const map: Record<MarkingStatus, string> = {
    PENDING: "bg-brick/10 text-brick",
    ACTIONED: "bg-seal/10 text-seal",
    RETURNED: "bg-gold/10 text-gold",
  };
  return (
    <span className={classNames("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", map[status])}>
      {status}
    </span>
  );
}
