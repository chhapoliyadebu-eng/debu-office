import React, { useState } from "react";
import { classNames, SealBadge } from "./common";
import { MailItem, IncomingLetter, MailAccount, DemoUser } from "../data/mockData";
import { fetchInbox, sendOfficeMail } from "../lib/mailboxApi";
import { MailboxSettings } from "./MailboxSettings";

export function IncomingLetters({
  user,
  mail,
  incoming,
  mailAccounts,
  onImport,
  onMark,
  onCreateDocument,
  onDraftDirect,
  onMailAccountConnected,
  onMailAccountDisconnected,
  onMailAccountJoined,
  onMailAccountLeft,
  onMailFetched,
}: {
  user: DemoUser;
  mail: MailItem[];
  incoming: IncomingLetter[];
  mailAccounts: MailAccount[];
  onImport: (id: string) => void;
  onMark: (letterId: string) => void;
  onCreateDocument: (mailId: string) => void;
  onDraftDirect: (letterId: string) => void;
  onMailAccountConnected: (account: MailAccount) => void;
  onMailAccountDisconnected: (accountId: string) => void;
  onMailAccountJoined: (accountId: string) => void;
  onMailAccountLeft: (accountId: string) => void;
  onMailFetched: (items: MailItem[]) => void;
}) {
  const [view, setView] = useState<"inbox" | "letters" | "settings">("inbox");
  const [selectedMail, setSelectedMail] = useState<MailItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const canManageMailboxes = user.role === "ADMIN" || user.role === "DEPARTMENT_ADMIN";
  // Each officer sees the ONE office mailbox they've personally joined —
  // not just "whichever mailbox happens to be connected" — since several
  // different office mailboxes can now be connected at once.
  const connectedAccount = mailAccounts.find((a) => a.id === user.connectedMailboxId);

  async function syncNow() {
    if (!connectedAccount) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const messages = await fetchInbox(connectedAccount.id);
      onMailFetched(
        messages.map((m) => ({
          id: m.id,
          mailAccountId: connectedAccount.id,
          from: m.from,
          subject: m.subject,
          date: m.date,
          read: false,
          body: m.body,
          attachments: m.attachments,
          imported: false,
        }))
      );
    } catch (err: any) {
      setSyncError(err.message || "Sync failed.");
    }
    setSyncing(false);
  }

  return (
    <div className="rise-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-navy">Incoming Letters</h1>
        <div className="flex bg-paper-deep rounded-md p-1 text-sm">
          <button onClick={() => setView("inbox")} className={classNames("px-4 py-1.5 rounded", view === "inbox" && "bg-white shadow-sm")}>
            Official Mailbox
          </button>
          <button onClick={() => setView("letters")} className={classNames("px-4 py-1.5 rounded", view === "letters" && "bg-white shadow-sm")}>
            Incoming Letter Records
          </button>
          <button onClick={() => setView("settings")} className={classNames("px-4 py-1.5 rounded", view === "settings" && "bg-white shadow-sm")}>
            Mailbox Settings
          </button>
        </div>
      </div>

      {view === "settings" && (
        <MailboxSettings
          user={user}
          accounts={mailAccounts}
          canManage={canManageMailboxes}
          onConnected={onMailAccountConnected}
          onDisconnected={onMailAccountDisconnected}
          onJoined={onMailAccountJoined}
          onLeft={onMailAccountLeft}
        />
      )}

      {view === "inbox" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-mono text-ink/50">
              {connectedAccount ? (
                <>
                  {connectedAccount.officeEmail} — <SealBadge tone="green">CONNECTED</SealBadge>
                </>
              ) : (
                <span>You haven't joined an office mailbox yet — showing sample data. Join your branch's mailbox under "Mailbox Settings".</span>
              )}
            </div>
            <div className="flex gap-2">
              {connectedAccount && (
                <button onClick={syncNow} disabled={syncing} className="text-xs font-semibold border border-navy text-navy px-3 py-1.5 rounded-sm hover:bg-navy/5 disabled:opacity-50">
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              )}
              {connectedAccount && (
                <button onClick={() => setShowCompose(true)} className="text-xs font-semibold bg-brick text-white px-3 py-1.5 rounded-sm hover:bg-brick-deep">
                  Compose
                </button>
              )}
            </div>
          </div>
          {syncError && <p className="text-xs text-brick mb-2">{syncError}</p>}

          <div className="grid grid-cols-5 gap-5">
            <div className="col-span-2 bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm divide-y divide-[#e6dcc2] max-h-[520px] overflow-y-auto">
              {mail.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMail(m)}
                  className={classNames(
                    "w-full text-left px-4 py-3 hover:bg-[#f4efe1] transition-colors",
                    selectedMail?.id === m.id && "bg-[#f4efe1]",
                    !m.read && "font-semibold"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm truncate">{m.from}</span>
                    <span className="text-[10px] text-ink/40 font-mono shrink-0 ml-2">{m.date}</span>
                  </div>
                  <div className="text-xs text-ink/70 truncate mt-0.5">{m.subject}</div>
                  {m.imported && <SealBadge tone="green">IMPORTED</SealBadge>}
                </button>
              ))}
              {mail.length === 0 && <p className="text-xs text-ink/40 px-4 py-6">Inbox empty.</p>}
            </div>
            <div className="col-span-3 bg-[#fdfcf8] border border-[#d8cfb6] rounded-sm p-6">
              {!selectedMail && <p className="text-sm text-ink/45">Select a mail to preview.</p>}
              {selectedMail && (
                <div>
                  <h3 className="font-display text-lg text-navy">{selectedMail.subject}</h3>
                  <p className="text-xs text-ink/50 mt-1 font-mono">
                    From: {selectedMail.from} · {selectedMail.date}
                  </p>
                  <p className="text-sm mt-4 leading-relaxed">{selectedMail.body}</p>
                  {selectedMail.attachments.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {selectedMail.attachments.map((a) => (
                        <div key={a} className="text-xs font-mono bg-[#f4efe1] px-3 py-1.5 rounded inline-block mr-2">
                          📎 {a}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 pt-4 border-t border-[#e6dcc2] flex flex-wrap gap-2 items-center">
                    {selectedMail.imported ? (
                      <SealBadge tone="green">Already imported as Incoming Letter</SealBadge>
                    ) : (
                      <button onClick={() => onImport(selectedMail.id)} className="bg-navy text-white text-sm px-4 py-2 rounded-sm hover:bg-navy-deep">
                        Import as Incoming Letter →
                      </button>
                    )}
                    <button onClick={() => onCreateDocument(selectedMail.id)} className="bg-brick text-white text-sm px-4 py-2 rounded-sm hover:bg-brick-deep">
                      Create Noting / Letter from this →
                    </button>
                  </div>
                  <p className="text-[11px] text-ink/45 mt-2">
                    Original email content preserved unmodified — the sender/subject/body always stays locked once turned into an
                    Incoming Letter record (Section 12/13). "Create Noting / Letter" auto-imports if needed and drops you straight
                    into the Document Editor with this mail pre-selected.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "letters" && (
        <div className="space-y-3">
          {incoming.map((letter) => (
            <div key={letter.id} className="noting-sheet rounded-sm">
              <div className="noting-body !py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-brick">{letter.id}</span>
                      {letter.locked && <SealBadge tone="navy">🔒 Content locked</SealBadge>}
                    </div>
                    <h3 className="font-display text-base text-navy mt-1">{letter.subject}</h3>
                    <p className="text-xs text-ink/50 mt-0.5">
                      {letter.from} · {letter.dept} · {letter.date}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => onMark(letter.id)} className="text-xs font-semibold text-white bg-navy px-3 py-1.5 rounded-sm hover:bg-navy-deep">
                      Mark to Officer →
                    </button>
                    <button
                      onClick={() => onDraftDirect(letter.id)}
                      className="text-xs font-semibold text-white bg-brick px-3 py-1.5 rounded-sm hover:bg-brick-deep"
                    >
                      Draft Document →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCompose && connectedAccount && <ComposeModal accountId={connectedAccount.id} fromEmail={connectedAccount.officeEmail} onClose={() => setShowCompose(false)} />}
    </div>
  );
}

function ComposeModal({ accountId, fromEmail, onClose }: { accountId: string; fromEmail: string; onClose: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await sendOfficeMail(accountId, to, subject, body);
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Send failed.");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-navy-deep/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[#fdfcf8] rounded-sm w-full max-w-lg p-5 border border-[#d8cfb6]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base text-navy">Compose — sending as {fromEmail}</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-brick">
            ✕
          </button>
        </div>
        {sent ? (
          <div>
            <p className="text-sm text-seal">Mail sent successfully.</p>
            <button onClick={onClose} className="mt-3 text-xs font-semibold bg-navy text-white px-3 py-1.5 rounded-sm">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full text-sm border border-[#d8cfb6] rounded-sm px-3 py-2" />
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full text-sm border border-[#d8cfb6] rounded-sm px-3 py-2" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Message" className="w-full text-sm border border-[#d8cfb6] rounded-sm px-3 py-2" />
            {error && <p className="text-xs text-brick">{error}</p>}
            <button onClick={send} disabled={sending || !to || !subject} className="text-xs font-semibold bg-brick text-white px-4 py-2 rounded-sm hover:bg-brick-deep disabled:opacity-50">
              {sending ? "Sending…" : "Send →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
