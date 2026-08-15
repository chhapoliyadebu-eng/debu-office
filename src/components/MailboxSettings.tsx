import React, { useState } from "react";
import { SealBadge } from "./common";
import { MailAccount, DemoUser } from "../data/mockData";
import { connectMailbox, disconnectMailbox, joinMailbox, leaveMailbox } from "../lib/mailboxApi";

/**
 * Office mailboxes (Section 43A), post-redesign:
 *   - Multiple office mailboxes can exist at once — one per branch/depot,
 *     not one system-wide. A DEPARTMENT_ADMIN/ADMIN connects each one.
 *   - Any number of officers may JOIN the same office mailbox (a branch can
 *     have many users sharing its inbox/compose).
 *   - An individual officer may be joined to only ONE office mailbox at a
 *     time — joining a different one requires leaving the current one
 *     first (the backend also enforces this with a 409).
 */
export function MailboxSettings({
  user,
  accounts,
  canManage,
  onConnected,
  onDisconnected,
  onJoined,
  onLeft,
}: {
  user: DemoUser;
  accounts: MailAccount[];
  canManage: boolean; // DEPARTMENT_ADMIN or ADMIN — may connect new mailboxes / disconnect any
  onConnected: (account: MailAccount) => void;
  onDisconnected: (accountId: string) => void;
  onJoined: (accountId: string) => void;
  onLeft: (accountId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [branchOrSeat, setBranchOrSeat] = useState(user.seat);
  const [officeEmail, setOfficeEmail] = useState("");
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myMailboxId = user.connectedMailboxId || null;

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const { accountId } = await connectMailbox({
        branchOrSeat, officeEmail, imapHost, imapPort, smtpHost, smtpPort, username, password, connectedBy: user.name,
      });
      onConnected({
        id: accountId, branchOrSeat, officeEmail, provider: "IMAP_SMTP",
        status: "CONNECTED", connectedBy: user.name, connectedAt: new Date().toISOString(), memberUids: [],
      });
      setShowForm(false);
      setOfficeEmail("");
      setUsername("");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Connection failed.");
    }
    setLoading(false);
  }

  async function disconnect(accountId: string) {
    setBusyId(accountId);
    setError(null);
    try {
      await disconnectMailbox(accountId);
      onDisconnected(accountId);
    } catch (err: any) {
      setError(err.message || "Disconnect failed.");
    }
    setBusyId(null);
  }

  async function join(accountId: string) {
    setBusyId(accountId);
    setError(null);
    try {
      await joinMailbox(accountId);
      onJoined(accountId);
    } catch (err: any) {
      setError(err.message || "Join failed.");
    }
    setBusyId(null);
  }

  async function leave(accountId: string) {
    setBusyId(accountId);
    setError(null);
    try {
      await leaveMailbox(accountId);
      onLeft(accountId);
    } catch (err: any) {
      setError(err.message || "Leave failed.");
    }
    setBusyId(null);
  }

  return (
    <div className="bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-5">
      <h3 className="font-display text-sm text-navy mb-2">Office Mailboxes</h3>
      <p className="text-[11px] text-ink/50 mb-3">
        This is separate from your personal login — each entry below is a shared <em>office</em> mailbox (e.g. rto.ambala@hry.gov.in)
        for one branch/depot. Any number of officers can <strong>join</strong> the same office mailbox to see its inbox and send mail
        from that office ID. You can be joined to <strong>only one</strong> office mailbox at a time — leave your current one before
        joining a different office's mailbox. A DEPARTMENT_ADMIN/ADMIN connects each mailbox's credentials once; they're encrypted and
        stored only on the backend, never shown again.
      </p>

      {error && <p className="text-xs text-brick mb-2">{error}</p>}

      {accounts.length === 0 && !showForm && (
        <p className="text-xs text-ink/40 mb-3">No office mailboxes connected yet.</p>
      )}

      <div className="space-y-2 mb-3">
        {accounts.map((acc) => {
          const isMine = myMailboxId === acc.id;
          const memberCount = acc.memberUids?.length || 0;
          const disableJoin = !!myMailboxId && !isMine;
          return (
            <div key={acc.id} className="flex items-center justify-between text-sm bg-white/50 rounded-sm px-3 py-2.5">
              <div>
                <span className="font-mono text-xs">{acc.officeEmail}</span>
                <span className="text-ink/50 ml-2">· {acc.branchOrSeat}</span>
                <span className="text-ink/40 ml-2 text-[10px]">
                  {memberCount} officer{memberCount === 1 ? "" : "s"} joined
                </span>
              </div>
              <div className="flex items-center gap-3">
                <SealBadge tone={acc.status === "CONNECTED" ? "green" : acc.status === "ERROR" ? "brick" : "gold"}>{acc.status}</SealBadge>
                {isMine ? (
                  <button
                    onClick={() => leave(acc.id)}
                    disabled={busyId === acc.id}
                    className="text-xs font-semibold text-brick hover:underline disabled:opacity-50"
                  >
                    {busyId === acc.id ? "Leaving…" : "Leave"}
                  </button>
                ) : (
                  <button
                    onClick={() => join(acc.id)}
                    disabled={busyId === acc.id || disableJoin}
                    title={disableJoin ? "Leave your current office mailbox first" : undefined}
                    className="text-xs font-semibold text-navy hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busyId === acc.id ? "Joining…" : "Join"}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => disconnect(acc.id)}
                    disabled={busyId === acc.id}
                    className="text-xs text-ink/40 hover:underline hover:text-brick disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canManage && (
        !showForm ? (
          <button onClick={() => setShowForm(true)} className="text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-sm hover:bg-navy-deep">
            + Connect a new office mailbox
          </button>
        ) : (
          <div className="border-t border-[#e6dcc2] pt-4 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-ink/50">Branch / Office name</label>
                <input value={branchOrSeat} onChange={(e) => setBranchOrSeat(e.target.value)} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">Office email address</label>
                <input value={officeEmail} onChange={(e) => setOfficeEmail(e.target.value)} placeholder="rto.ambala@hry.gov.in" className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">IMAP host</label>
                <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">IMAP port</label>
                <input type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">SMTP host</label>
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">SMTP port</label>
                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">Password / App Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full text-sm border border-[#d8cfb6] rounded-sm px-2 py-1.5" />
              </div>
            </div>
            <p className="text-[10px] text-ink/40">
              For Gmail/Google Workspace, use an App Password (not the account password) — generate one under Google Account →
              Security → App Passwords, after enabling 2-Step Verification. One office/branch name can only have one active
              mailbox at a time — disconnect the old one first if you're replacing its credentials.
            </p>
            <div className="flex gap-2">
              <button onClick={submit} disabled={loading} className="text-xs font-semibold bg-brick text-white px-4 py-2 rounded-sm hover:bg-brick-deep disabled:opacity-50">
                {loading ? "Connecting…" : "Connect →"}
              </button>
              <button onClick={() => setShowForm(false)} className="text-xs text-ink/50 hover:underline">
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
