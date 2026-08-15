import React from "react";
import { classNames } from "./common";
import { DemoUser, DEMO_USERS } from "../data/mockData";

export const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "search", label: "Search" },
  { key: "incoming", label: "Incoming Letters" },
  { key: "marking", label: "Marking / Dak-Routing" },
  { key: "editor", label: "Document Editor" },
  { key: "templates", label: "Templates" },
  { key: "files", label: "Files Register" },
  { key: "rules", label: "Rules Library" },
  { key: "admin", label: "Admin Panel" },
] as const;

export type TabKey = (typeof NAV)[number]["key"];

export function Sidebar({
  tab,
  setTab,
  isDeptAdmin,
  myMarkingsCount,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  isDeptAdmin: boolean;
  myMarkingsCount: number;
}) {
  return (
    <aside className="w-64 shrink-0 h-screen overflow-y-auto bg-navy-deep text-[#e7ddc4] flex flex-col">
      <div className="px-6 pt-7 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-gold flex items-center justify-center font-display text-gold text-lg">
            हर
          </div>
          <div>
            <div className="font-hindi text-[15px] leading-tight">हरियाणा रोडवेज</div>
            <div className="text-[10px] tracking-[0.15em] text-[#e7ddc4]/60 uppercase">Drafting Portal</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-4">
        {NAV.filter((n) => n.key !== "admin" || isDeptAdmin).map((n) => (
          <button
            key={n.key}
            onClick={() => setTab(n.key)}
            className={classNames(
              "w-full text-left px-6 py-3 flex items-center justify-between text-sm transition-colors",
              tab === n.key ? "bg-brick/90 text-white" : "hover:bg-white/5 text-[#e7ddc4]/85"
            )}
          >
            <span>{n.label}</span>
            {n.key === "marking" && myMarkingsCount > 0 && (
              <span className="bg-gold text-navy-deep text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {myMarkingsCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-white/10 text-[10px] text-[#e7ddc4]/45 leading-relaxed">
        Section 43B compliant · Marking chain is append-only.
        <br />
        Original letter content is immutable.
      </div>
    </aside>
  );
}

export function TopBar({
  user,
  setUser,
  notificationCount = 0,
  onNotificationClick,
  isRealAuth,
  onSignOut,
}: {
  user: DemoUser;
  setUser: (u: DemoUser) => void;
  notificationCount?: number;
  onNotificationClick?: () => void;
  isRealAuth: boolean;
  onSignOut?: () => void;
}) {
  return (
    <div className="h-16 bg-[#fdfcf8] border-b border-[#d8cfb6] flex items-center justify-between px-8">
      <div className="font-display text-navy text-[15px]">
        Transport Department Official File &amp; Drafting System
      </div>
      <div className="flex items-center gap-3">
        {notificationCount > 0 && (
          <button onClick={onNotificationClick} className="relative text-navy hover:bg-navy/5 rounded-full p-2" title="Pending rule/circular reviews">
            <span className="text-lg">🔔</span>
            <span className="absolute -top-0.5 -right-0.5 bg-brick text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {notificationCount}
            </span>
          </button>
        )}

        {isRealAuth ? (
          <>
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-ink">{user.name}</div>
              <div className="text-[10px] text-ink/45 font-mono">{user.email}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center text-xs font-semibold">
              {user.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
            </div>
            <button onClick={onSignOut} className="text-xs text-ink/50 hover:text-brick border border-[#d8cfb6] rounded-sm px-2.5 py-1.5">
              Sign out
            </button>
          </>
        ) : (
          <>
            <label className="text-[11px] text-ink/60 font-medium">Demo role:</label>
            <select
              value={user.id}
              onChange={(e) => setUser(DEMO_USERS.find((u) => u.id === e.target.value)!)}
              className="text-sm border border-[#d8cfb6] rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brick/40"
            >
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.designation}
                </option>
              ))}
            </select>
            <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center text-xs font-semibold">
              {user.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
