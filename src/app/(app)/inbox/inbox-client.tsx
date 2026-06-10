"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { SupportConversation, SupportConversationSummary } from "@/lib/types";

export function SupportInbox() {
  const [list, setList] = useState<SupportConversationSummary[]>([]);
  const [active, setActive] = useState<SupportConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

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

  const open = useCallback(async (id: string) => {
    setError(null);
    try {
      setActive(await api.getSupportInbox(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the conversation.");
    }
  }, []);

  const sendReply = useCallback(async () => {
    if (!active || !reply.trim()) return;
    setBusy(true);
    try {
      const updated = await api.replySupport(active.id, { body: reply.trim() });
      setActive(updated);
      setReply("");
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }, [active, reply, loadList]);

  const resolve = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.resolveSupport(active.id);
      setActive(null);
      void loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve.");
    } finally {
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
          <p style={{ padding: 20, font: "400 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>Nothing waiting. 🎉</p>
        ) : (
          list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void open(c.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "14px 16px", borderBottom: "1px solid var(--rule)",
                background: active?.id === c.id ? "var(--surface)" : "transparent", border: "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ font: "400 16px/1.2 var(--serif)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject || "Support request"}</span>
                <Mono>{c.channel}</Mono>
              </div>
              <div style={{ marginTop: 4 }}><Mono>{c.requesterName} · {c.requesterRole}</Mono></div>
              <div style={{ marginTop: 6, font: "300 13px/1.4 var(--serif)", color: "var(--fg-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessage}</div>
            </button>
          ))
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
                <Mono>{active.status}</Mono>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void resolve()} disabled={busy}>Resolve</Button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
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
                  <span style={{ display: "block", font: "400 9px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", opacity: .6, marginBottom: m.sender === "SYSTEM" ? 0 : 4 }}>{m.sender}</span>
                  {m.body}
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--rule)", padding: 12, display: "flex", gap: 8 }}>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendReply(); } }}
                placeholder="Reply as a team member…"
                aria-label="Reply"
                style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--rule-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--fg)", font: "300 15px/1.3 var(--serif)" }}
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
