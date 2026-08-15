import React, { useState } from "react";
import { classNames, StatusPill } from "./common";
import { DEPOTS, DemoUser, Role, PaymentVerification, AuditEntry } from "../data/mockData";

export function AdminPanel({
  isAdmin,
  isDeptAdmin,
  subs,
  onVerify,
  auditLog,
  users,
  isRealAuth,
  myDepartment,
  onUpdateUser,
}: {
  isAdmin: boolean;
  isDeptAdmin: boolean;
  subs: PaymentVerification[];
  onVerify: (id: string, status: "VERIFIED" | "REJECTED") => void;
  auditLog: AuditEntry[];
  users: DemoUser[];
  isRealAuth: boolean;
  myDepartment?: string;
  onUpdateUser: (uid: string, patch: Partial<DemoUser>) => void;
}) {
  const [section, setSection] = useState<"payments" | "depots" | "users" | "audit">("payments");
  if (!isDeptAdmin) {
    return <div className="rise-in text-sm text-ink/60">Aapke paas admin panel access nahi hai.</div>;
  }
  return (
    <div className="rise-in">
      <h1 className="font-display text-2xl text-navy mb-1">Admin Panel</h1>
      <p className="text-sm text-ink/55 mb-6">Master data · Rules · Users · Subscription verification (Section 65)</p>

      <div className="flex gap-1 mb-5">
        {(
          [
            ["payments", "UTR Verification"],
            ["depots", "Depots / Wings"],
            ["users", "Users"],
            ["audit", "Audit Log"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setSection(k)}
            className={classNames("tab-folder px-5 py-2 text-sm font-medium", section === k ? "bg-navy text-white" : "bg-paper-deep text-ink/70")}
          >
            {l}
          </button>
        ))}
      </div>

      {section === "payments" && (
        <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f4efe1] text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">UTR</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-t border-[#e6dcc2]">
                  <td className="px-4 py-3">{s.user}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.utr}</td>
                  <td className="px-4 py-3">{s.amount}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status === "VERIFIED" ? "ACTIONED" : s.status === "REJECTED" ? "RETURNED" : "PENDING"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "PENDING" && isAdmin && (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => onVerify(s.id, "VERIFIED")} className="text-xs bg-seal text-white px-3 py-1 rounded-sm">
                          Verify
                        </button>
                        <button onClick={() => onVerify(s.id, "REJECTED")} className="text-xs border border-brick text-brick px-3 py-1 rounded-sm">
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === "depots" && (
        <div className="grid grid-cols-4 gap-2">
          {DEPOTS.map((d) => (
            <div key={d} className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm px-3 py-2 text-sm">
              {d}
            </div>
          ))}
        </div>
      )}

      {section === "users" && (
        <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm overflow-hidden">
          {isRealAuth && (
            <div className="px-4 py-2 text-[11px] text-ink/50 bg-[#f4efe1]">
              {isAdmin
                ? "Real registered accounts — edit role/designation/wing inline. New sign-ups start as \"Unassigned\"."
                : `Officers in your department (or newly-registered "Unassigned" sign-ups) — edit designation/wing/seat inline to onboard them. Role changes and moving someone to a different department need an ADMIN.`}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-[#f4efe1] text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                {isRealAuth && <th className="text-left px-4 py-3">Email</th>}
                <th className="text-left px-4 py-3">Designation</th>
                <th className="text-left px-4 py-3">Wing/Depot</th>
                <th className="text-left px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                // A DEPARTMENT_ADMIN may only edit USER-role accounts that
                // are already in their own department, or still
                // "Unassigned" (onboarding a brand-new sign-up) — mirrors
                // the backend's PATCH /api/users/:uid authorization exactly.
                const deptAdminCanEditThisRow =
                  isDeptAdmin && !isAdmin && u.role === "USER" && (u.department === myDepartment || u.department === "Unassigned");
                const editable = isRealAuth && (isAdmin || deptAdminCanEditThisRow);

                return editable ? (
                  <tr key={u.id} className="border-t border-[#e6dcc2]">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink/60">{u.email}</td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={u.designation}
                        onBlur={(e) => e.target.value !== u.designation && onUpdateUser(u.id, { designation: e.target.value })}
                        className="w-full text-sm border-b border-transparent hover:border-[#d8cfb6] focus:border-brick focus:outline-none bg-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={u.wing}
                        onBlur={(e) => e.target.value !== u.wing && onUpdateUser(u.id, { wing: e.target.value })}
                        className="w-full text-sm border-b border-transparent hover:border-[#d8cfb6] focus:border-brick focus:outline-none bg-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={(e) => onUpdateUser(u.id, { role: e.target.value as Role })}
                          className="text-[11px] font-mono text-navy border border-[#d8cfb6] rounded-sm px-1.5 py-1"
                        >
                          <option value="USER">USER</option>
                          <option value="DEPARTMENT_ADMIN">DEPARTMENT_ADMIN</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      ) : (
                        <span className="text-[10px] font-mono text-navy" title="Only an ADMIN can change a user's role">{u.role}</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className="border-t border-[#e6dcc2]">
                    <td className="px-4 py-3">
                      {u.name} {u.nameHi && <span className="font-hindi text-ink/50">({u.nameHi})</span>}
                    </td>
                    {isRealAuth && <td className="px-4 py-3 font-mono text-xs text-ink/60">{u.email}</td>}
                    <td className="px-4 py-3">{u.designation}</td>
                    <td className="px-4 py-3">{u.wing}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-navy">{u.role}</span>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                    No registered users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "audit" && (
        <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f4efe1] text-ink/60 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Actor</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Target</th>
                <th className="text-left px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((a) => (
                <tr key={a.id} className="border-t border-[#e6dcc2]">
                  <td className="px-4 py-3">{a.actor}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-mono text-navy bg-navy/5 px-2 py-0.5 rounded">{a.action}</span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{a.target}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/50">{a.at}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink/40">
                    No audit events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
