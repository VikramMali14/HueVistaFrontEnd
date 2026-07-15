"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, HttpError } from "@/lib/api";
import type { SupportConversation, SupportMessage } from "@/lib/types";

/**
 * Floating in-app support chat. An AI agent answers; it hands off to a human
 * (status NEEDS_HUMAN) when it can't help or the user asks. Lives in the (app)
 * layout, so it's available to both retailers and customers while signed in.
 */
/** How often the open panel checks for new replies (agent messages arrive
 *  out-of-band — without polling the customer never sees them). */
const POLL_MS = 4000;

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [convo, setConvo] = useState<SupportConversation | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Guards: don't let a slow poll response clobber the conversation returned by
  // an in-flight send, and only bootstrap the previous conversation once.
  const sendingRef = useRef(false);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [convo, open, sending]);

  // First open: resume the most recent conversation that isn't resolved, so a
  // page reload (or coming back the next day) doesn't orphan the thread — and
  // the team's replies are actually seen.
  useEffect(() => {
    if (!open || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void (async () => {
      try {
        const list = await api.listSupport();
        const latest = list.find((c) => c.channel === "IN_APP" && c.status !== "RESOLVED");
        if (latest) setConvo(await api.getSupport(latest.id));
      } catch {
        /* not signed in / transient — start fresh on first message */
      }
    })();
  }, [open]);

  // While the panel is open, poll the active conversation so replies from the
  // other end (human agents, or a delayed AI answer) appear without the user
  // having to send another message.
  const convoId = convo?.id;
  useEffect(() => {
    if (!open || !convoId) return;
    const timer = setInterval(() => {
      if (sendingRef.current || document.hidden) return;
      void api
        .getSupport(convoId)
        .then((fresh) => {
          if (!sendingRef.current) {
            setConvo((cur) => (cur && cur.id === convoId ? fresh : cur));
          }
        })
        .catch(() => {
          /* transient network/auth hiccup — next tick retries */
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, convoId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    sendingRef.current = true;
    setError(null);
    setInput("");
    setPendingText(text);
    try {
      const next = convo
        ? await api.postSupport(convo.id, { body: text })
        : await api.startSupport({ message: text });
      setConvo(next);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        setError("Your session expired — please sign in again.");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
      setInput(text); // restore so the user doesn't lose their message
    } finally {
      sendingRef.current = false;
      setSending(false);
      setPendingText(null);
    }
  }, [input, sending, convo]);

  const requestHuman = useCallback(async () => {
    if (!convo) return;
    try {
      setConvo(await api.requestHumanSupport(convo.id));
    } catch {
      /* non-fatal */
    }
  }, [convo]);

  const needsHuman = convo?.status === "NEEDS_HUMAN";

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="hv-chat-fab"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 90,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "1px solid var(--rule-strong)",
          background: "var(--accent)",
          color: "var(--bg)",
          cursor: "pointer",
          boxShadow: "0 6px 24px rgba(0,0,0,.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform .2s var(--ease), box-shadow .2s var(--ease)",
        }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Support chat"
          className="hv-chat-pop"
          style={{
            position: "fixed",
            bottom: 88,
            right: 20,
            zIndex: 90,
            width: "min(380px, calc(100vw - 40px))",
            height: "min(560px, calc(100vh - 130px))",
            background: "var(--bg)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 12px 40px rgba(0,0,0,.32)",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--rule)", background: "var(--surface)" }}>
            <div style={{ font: "400 18px/1.1 var(--serif)", color: "var(--fg)" }}>HueVista support</div>
            <div style={{ font: "400 10px/1.3 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: needsHuman ? "var(--accent)" : "var(--fg-mute)", marginTop: 4 }}>
              {needsHuman ? "A team member will reply" : "AI assistant · replies instantly"}
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {!convo && (
              <p style={{ font: "400 15px/1.5 var(--serif)", color: "var(--fg-mute)", margin: 0 }}>
                Hi! Ask about access codes, projects, colours, billing — anything. I&apos;ll help, or pass you to a person.
              </p>
            )}
            {convo?.messages.map((m) => <Bubble key={m.id} message={m} />)}
            {/* Optimistic echo: the user's message stays visible while the round
                trip (which includes the AI reply) is in flight. */}
            {sending && pendingText && (
              <Bubble message={{ id: "pending", sender: "USER", body: pendingText }} />
            )}
            {sending && <Bubble message={{ id: "typing", sender: "AI", body: "…" }} />}
          </div>

          {error && (
            <div className="field-error" role="alert" style={{ margin: "0 16px 8px" }}>{error}</div>
          )}

          <div style={{ borderTop: "1px solid var(--rule)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder="Type a message…"
                aria-label="Message"
                style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--rule-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--fg)", font: "300 15px/1.3 var(--serif)" }}
              />
              <button type="button" onClick={() => void send()} disabled={sending || !input.trim()} className="btn btn-sm" style={{ whiteSpace: "nowrap" }}>
                Send
              </button>
            </div>
            {convo && !needsHuman && (
              <button type="button" onClick={() => void requestHuman()} style={{ alignSelf: "flex-start", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
                Talk to a human
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ message }: { message: SupportMessage }) {
  if (message.sender === "SYSTEM") {
    return (
      <div style={{ alignSelf: "center", font: "400 10px/1.4 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)", textAlign: "center", maxWidth: "90%" }}>
        {message.body}
      </div>
    );
  }
  const isUser = message.sender === "USER";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        padding: "9px 12px",
        borderRadius: 12,
        background: isUser ? "var(--accent)" : "var(--surface)",
        color: isUser ? "var(--bg)" : "var(--fg)",
        border: isUser ? "none" : "1px solid var(--rule)",
        font: "300 15px/1.45 var(--serif)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {message.sender === "AGENT" && (
        <span style={{ display: "block", font: "400 9px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>Team</span>
      )}
      {message.body}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}
