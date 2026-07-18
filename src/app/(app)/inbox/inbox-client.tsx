"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { SupportConversation, SupportConversationSummary } from "@/lib/types";

// Human labels for backend enums — raw IN_APP / NEEDS_HUMAN / USER read as a debug build.
const CHANNEL_LABEL: Record<string, string> = { IN_APP: "In-app", WHATSAPP: "WhatsApp", VOICE: "Voice", EMAIL: "Email" };
const STATUS_LABEL: Record<string, string> = { OPEN: "Open", NEEDS_HUMAN: "Needs a human", RESOLVED: "Resolved" };
const SENDER_LABEL: Record<string, string> = { USER: "Customer", AI: "AI assistant", AGENT: "Team", SYSTEM: "System" };

function titleCase(s?: string | null): string {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
}

/** "now" / "5m" / "3h" / "2d" — how long a conversation has been waiting. */
function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor(Math.max(0, Date.now() - t) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Refresh cadences: the waiting list is cheap; the open thread needs to feel
 *  live — customer messages land between agent replies. */
const LIST_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 5_000;

export function SupportInbox() {
  const [list, setList] = useState<SupportConversationSummary[]>([]);
  const [active, setActive] = useState<SupportConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  // Two-step Resolve: closing a customer thread is one mis-click from the
  // header, so the first click only arms the confirm state.
  const [confirmResolve, setConfirmResolve] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Don't let a slow poll response overwrite the state a reply/resolve just set.
  const busyRef = useRef(false);

  // Opening a conversation (or receiving a reply) should show the LATEST message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length]);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      setList(await api.listSupportInbox());
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) { window.location.href = "/sign-in?next=/inbox"; return; }
      setError(e instanceof Error ? e.message : "Could not load the inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  // A poll that hits 401 means the session ended mid-shift: redirect like the
  // initial load does, instead of every tick failing silently forever.
  const pollFailed = useCallback((e: unknown) => {
    if (e instanceof HttpError && e.status === 401) {
      window.location.href = "/sign-in?next=/inbox";
    }
    /* anything else is transient — the next tick retries */
  }, []);

  // Live inbox: new escalations appear without pressing Refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || busyRef.current) return;
      void api.listSupportInbox().then(setList).catch(pollFailed);
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [pollFailed]);

  // Live thread: the customer's new messages appear while the agent has it open.
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(() => {
      if (document.hidden || busyRef.current) return;
      void api
        .getSupportInbox(activeId)
        .then((fresh) => {
          if (!busyRef.current) {
            setActive((cur) => (cur && cur.id === activeId ? fresh : cur));
          }
        })
        .catch(pollFailed);
    }, ACTIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, pollFailed]);

  const open = useCallback(async (id: string) => {
    setError(null);
    // An armed "Resolve?" must not carry over to a different thread.
    setConfirmResolve(false);
    try {
      setActive(await api.getSupportInbox(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the conversation.");
    }
  }, []);

  const sendReply = useCallback(async () => {
    if (!active || !reply.trim()) return;
    setBusy(true);
    busyRef.current = true;
    try {
      const updated = await api.replySupport(active.id, { body: reply.trim() });
      setActive(updated);
      setReply("");
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reply.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [active, reply, loadList]);

  const resolve = useCallback(async () => {
    if (!active) return;
    setConfirmResolve(false);
    setBusy(true);
    busyRef.current = true;
    try {
      await api.resolveSupport(active.id);
      setActive(null);
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [active, loadList]);

  if (loading) {
    return <div style={{ display: "inline-flex", gap: 10, alignItems: "center", color: "var(--fg-mute)" }}><Spinner size={14} color="var(--accent)" /> <Mono>Loading…</Mono></div>;
  }

  return (
    <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24, alignItems: "start" }}>
      {/* LIST */}
      <div style={{ border: "1px solid var(--rule)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono>{list.length} waiting</Mono>
          <button type="button" onClick={() => void loadList()} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>Refresh</button>
        </div>
        {list.length === 0 ? (
          <p style={{ padding: 20, font: "400 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>Nothing waiting — the inbox is clear.</p>
        ) : (
          <ul aria-label="Support conversations" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void open(c.id)}
                  aria-current={active?.id === c.id ? "true" : undefined}
                  style={{
                    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "14px 16px", borderBottom: "1px solid var(--rule)",
                    background: active?.id === c.id ? "var(--surface)" : "transparent", border: "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ font: "400 16px/1.2 var(--serif)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject || "Support request"}</span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <Mono>{CHANNEL_LABEL[c.channel] ?? c.channel}</Mono>
                      {c.updatedAt && <Mono>{relTime(c.updatedAt)}</Mono>}
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}><Mono>{c.requesterName} · {titleCase(c.requesterRole)}</Mono></div>
                  <div style={{ marginTop: 6, font: "300 13px/1.4 var(--serif)", color: "var(--fg-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessage}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* DETAIL */}
      <div style={{ border: "1px solid var(--rule)", minHeight: 320, display: "flex", flexDirection: "column" }}>
        {!active ? (
          <p style={{ padding: 24, font: "400 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>Select a conversation to read and reply.</p>
        ) : (
          <>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ font: "400 18px/1.1 var(--serif)" }}>{active.subject || "Support request"}</div>
                <Mono>{STATUS_LABEL[active.status] ?? active.status}</Mono>
              </div>
              {confirmResolve ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Mono>Close this thread?</Mono>
                  <Button size="sm" onClick={() => void resolve()} disabled={busy}>Yes, resolve</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResolve(false)}>Keep open</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmResolve(true)} disabled={busy}>Resolve</Button>
              )}
            </div>
            <div role="log" aria-label="Messages" style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
              {active.messages.map((m) => (
                <div key={m.id} style={{
                  alignSelf: m.sender === "USER" ? "flex-start" : m.sender === "SYSTEM" ? "center" : "flex-end",
                  maxWidth: "85%", padding: m.sender === "SYSTEM" ? 0 : "9px 12px",
                  borderRadius: 12,
                  background: m.sender === "AGENT" ? "var(--accent)" : m.sender === "SYSTEM" ? "transparent" : "var(--surface)",
                  color: m.sender === "AGENT" ? "var(--bg)" : "var(--fg)",
                  border: m.sender === "USER" ? "1px solid var(--rule)" : "none",
                  font: m.sender === "SYSTEM" ? "400 10px/1.4 var(--mono)" : "300 15px/1.45 var(--serif)",
                  letterSpacing: m.sender === "SYSTEM" ? ".12em" : undefined,
                  textTransform: m.sender === "SYSTEM" ? "uppercase" : undefined,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  <span style={{ display: "block", font: "400 9px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", opacity: .6, marginBottom: m.sender === "SYSTEM" ? 0 : 4 }}>
                    {SENDER_LABEL[m.sender] ?? m.sender}
                    {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}
                  </span>
                  {m.body}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div style={{ borderTop: "1px solid var(--rule)", padding: 12, display: "flex", gap: 8 }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
                placeholder="Reply as a team member… (Shift+Enter for a new line)"
                aria-label="Reply"
                rows={2}
                style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--rule-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--fg)", font: "300 15px/1.3 var(--serif)", resize: "none" }}
              />
              <Button size="sm" onClick={() => void sendReply()} disabled={busy || !reply.trim()}>Send</Button>
            </div>
          </>
        )}
      </div>
      {error && <div className="field-error" role="alert" style={{ gridColumn: "1 / -1" }}>{error}</div>}
    </div>
  );
}
