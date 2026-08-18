"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

/** Where a bug report lands, said out loud so it doesn't read as a message into a void. */
const SUPPORT_EMAIL = "support@huevista.org";

/** The longest description we'll take. Matches the report dialog's own note field. */
const MAX_NOTE = 2000;

/**
 * What we can see about the run without asking the user a single question.
 *
 * This is the whole reason the button is worth building rather than pointing people at
 * an e-mail address. "It broke" is not a bug report and never becomes one over e-mail:
 * the reply asking which browser, which room, what the screen was doing costs a day and
 * usually goes unanswered. Every field here is something the person reporting could in
 * principle type and won't — so we take it ourselves, and what they have to write is
 * only the part we genuinely cannot know: what they expected to happen.
 *
 * Nothing here is collected that the account does not already send us on every request
 * (the URL they are on, the browser making the call), and the whole block is shown to
 * them in the dialog before they press send rather than attached silently.
 */
function collectContext(): string {
  const lines: string[] = [];
  // Read straight off the browser rather than through the router hooks: this only ever
  // runs after a click, so the location is real, and `useSearchParams` would drag a
  // Suspense boundary requirement into the navbar for a string we already have.
  lines.push(`Page: ${window.location.pathname}${window.location.search}`);
  const projectId = new URLSearchParams(window.location.search).get("project");
  if (projectId) lines.push(`Project: ${projectId}`);
  lines.push(`Screen: ${window.innerWidth}×${window.innerHeight} (dpr ${window.devicePixelRatio})`);
  lines.push(`Browser: ${window.navigator.userAgent}`);
  if (window.navigator.onLine === false) lines.push("Network: offline at the time of reporting");
  lines.push(`When: ${new Date().toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  return lines.join("\n");
}

/**
 * "Report a bug" — the studio's channel for anything that is simply broken.
 *
 * <b>Why the studio needed its own.</b> The floating support bubble is deliberately
 * switched off in here (see support-widget): the studio is a workspace where every
 * corner is already spoken for by the canvas, the shade tray and the apply bar, and a
 * pinned bubble only ever covers one of them. That left the one screen where people
 * spend real time as the one screen with no way to say something is wrong — and the
 * existing "Report a problem" dialog is not a substitute, because it reports a bad AI
 * RUN and needs a finished run to attach itself to. A button that saves nothing, an
 * upload that never returns, a wall that will not take a colour: none of those produce
 * a run to complain about, and all of them are what people actually want to report.
 *
 * <b>What it sends.</b> One support conversation, escalated straight to a human. The
 * AI agent behind the support channel is good at "how do I…" and can do nothing useful
 * with "the canvas went blank", so routing a bug through it costs a round trip and
 * annoys the person who already knows they need a person. If that escalation fails the
 * report has still landed, and saying "we couldn't send it" over a message we DID send
 * would be the worse lie of the two — so the send succeeds on the conversation alone.
 */
export function BugReportButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        title="Something broken? Tell us what happened"
      >
        <BugIcon />
        <span>Bug</span>
      </button>
      {open && <BugReportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function BugReportDialog({ onClose }: { onClose: () => void }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Frozen at open. The context is a snapshot of the moment they hit the button, and a
  // value that re-read itself on every keystroke would describe the wrong moment by the
  // time it was sent.
  const [context] = useState(collectContext);

  // Escape closes — but not mid-send, when closing would leave the user unsure whether
  // the report went.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const send = useCallback(async () => {
    const description = note.trim();
    if (!description || sending) return;
    setSending(true);
    setError(null);
    try {
      const convo = await api.startSupport({
        subject: "Bug report — Studio",
        message: `${description}\n\n— — —\nWhat we could see from here:\n${context}`,
      });
      // A bug is not a question, so it goes to a person rather than round the AI agent
      // first. Best-effort on purpose: the report is already filed by this point, and
      // telling someone their message failed when it did not is the worse error.
      await api.requestHumanSupport(convo.id).catch(() => {});
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not send that just now. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }, [note, context, sending]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      onClick={() => !sending && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--rule-strong)",
          padding: 28,
          maxWidth: 520,
          width: "100%",
          maxHeight: "86vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {sent ? (
          <>
            <Mono brass>Thank you — we have it</Mono>
            <p style={{ font: "400 16px/1.5 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>
              Your report is with our team, along with everything above about the screen you
              were on. If we need more we&rsquo;ll reply on this account, or you can reach us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--fg)" }}>
                {SUPPORT_EMAIL}
              </a>
              . Your work is untouched — nothing was closed or discarded to send this.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {/* Newly mounted when `sent` flips, so autoFocus fires here rather than
                  leaving focus on a Send button that no longer exists. */}
              <Button variant="brass" size="sm" onClick={onClose} autoFocus>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <Mono brass>Report a bug</Mono>
            <p style={{ font: "400 16px/1.45 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>
              Something not working? Tell us what you were doing and what happened instead.
              We take the technical details ourselves, so a sentence is genuinely enough.
            </p>

            <div className="field">
              <label className="field-label" htmlFor="hv-bug-note">
                What went wrong?
              </label>
              <textarea
                id="hv-bug-note"
                rows={5}
                maxLength={MAX_NOTE}
                value={note}
                disabled={sending}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. I picked a colour and pressed Apply, and the wall stayed grey"
                autoFocus
                style={{ width: "100%", resize: "vertical", font: "400 15px/1.5 var(--sans)" }}
              />
            </div>

            {/* Shown, not attached silently. It is all information the account already
                sends us on every request, and somebody about to hand us their browser
                and the room they are in is owed the chance to read it first. */}
            <details style={{ border: "1px solid var(--rule)", padding: "10px 12px" }}>
              <summary style={{ cursor: "pointer", font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                Sent with your report
              </summary>
              <pre
                style={{
                  margin: "10px 0 0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  font: "400 12px/1.55 var(--mono)",
                  color: "var(--fg-mute)",
                }}
              >
                {context}
              </pre>
            </details>

            {error && (
              <p className="field-error" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button
                variant="brass"
                size="sm"
                onClick={() => void send()}
                // A report with nothing written in it cannot be triaged — the context
                // block says where they were, never what went wrong there.
                disabled={note.trim().length === 0 || sending}
              >
                {sending ? (
                  <>
                    <Spinner size={14} color="currentColor" decorative /> Sending…
                  </>
                ) : (
                  "Send report"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BugIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M8 12H3M21 12h-5M8 17l-4 2M20 19l-4-2M8 8 4.5 5.5M16 8l3.5-2.5" />
      <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0" />
    </svg>
  );
}
