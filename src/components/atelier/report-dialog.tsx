"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MaskReportIssue } from "@/lib/types";

interface ReportDialogProps {
  /** True while the photo clean-up produced an image — decides whether the
   *  "photo wasn't cleaned up properly" option is worth offering at all. */
  hadCleanedImage: boolean;
  /**
   * The clean-up stage FAILED on this run — it was asked for and produced nothing.
   * Distinct from `hadCleanedImage` being false, which usually means it was never
   * asked for at all: the option has to be offered here (there is no cleaned image,
   * and that IS the complaint), and it needs to describe a clean that didn't happen
   * rather than one that came out badly.
   */
  cleanFailed?: boolean;
  /**
   * Ticked on open. Set when the run FAILED and the backend named the stage, so
   * someone who has just been told "we couldn't pick out the walls" doesn't have to
   * re-describe it — they press Send. Still editable: the user may know better.
   */
  presetIssues?: MaskReportIssue[];
  /** Fires the report. Resolves on success, rejects with a message-bearing error. */
  onSubmit: (issues: MaskReportIssue[], note: string) => Promise<void>;
  onClose: () => void;
}

/** Where a report lands, said out loud so it doesn't read as a message into a void. */
const SUPPORT_EMAIL = "support@huevista.org";

/** The options, in the order the pipeline runs — clean-up, then wall detection. */
const OPTIONS: ReadonlyArray<{
  id: MaskReportIssue;
  label: string;
  hint: string;
  /** Only shown when the clean-up stage actually produced something. */
  needsCleanedImage?: boolean;
}> = [
  {
    id: "IMAGE_NOT_CLEANED_PROPERLY",
    label: "The photo wasn't cleaned up properly",
    hint: "Furniture smeared, edges warped, or the room looks damaged after the tidy-up.",
    needsCleanedImage: true,
  },
  {
    id: "MASK_NOT_GENERATED_PROPERLY",
    label: "The walls weren't detected properly",
    hint: "Walls missed or merged, colour spilling onto furniture, or nothing was found.",
  },
  {
    id: "OTHER",
    label: "Something else",
    hint: "Tell us below and we'll take a look.",
  },
];

/**
 * "Report a problem" — the studio's channel for an AI run that came out wrong.
 *
 * This exists because the pipeline cannot fail this way on its own. A run that
 * puts the walls in the wrong places still returns SEGMENTED, still writes its
 * regions, and passes every check the backend makes; from the server's side it is
 * indistinguishable from a good run. The only party who can tell the difference is
 * the person looking at their own room, so the whole design goal here is to make
 * saying so take one press and no typing.
 *
 * Hence: the note is optional and a ticked box alone is a complete report. Asking
 * for a written description would filter out exactly the reports worth having —
 * the ones from a customer standing at a shop counter who is not going to compose
 * a paragraph about it.
 */
export function ReportDialog({
  hadCleanedImage,
  cleanFailed = false,
  presetIssues,
  onSubmit,
  onClose,
}: ReportDialogProps) {
  // Initialiser, not an effect: the preset is what the dialog opens WITH, and the
  // user's ticking from that moment on is theirs to keep.
  const [picked, setPicked] = useState<Set<MaskReportIssue>>(() => new Set(presetIssues ?? []));
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Escape closes — but not mid-send, when the report is already in flight and
  // closing would leave the user unsure whether it went.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const toggle = useCallback((id: MaskReportIssue) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The clean-up option shows when there is a clean to judge — or when the clean is
  // exactly what failed, which is the one case where its absence is the complaint.
  const options = OPTIONS.filter(
    (o) => !o.needsCleanedImage || hadCleanedImage || cleanFailed,
  ).map((o) =>
    o.id === "IMAGE_NOT_CLEANED_PROPERLY" && cleanFailed
      ? { ...o, label: "The photo clean-up didn't come through",
          hint: "The tidy-up never finished, so the walls were never looked for." }
      : o,
  );

  const send = useCallback(async () => {
    if (picked.size === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit([...picked], note.trim());
      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not send the report. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }, [picked, note, onSubmit, sending]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem with this room"
      onClick={() => !sending && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
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
          maxWidth: 480,
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
              Your report has gone to our team at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--fg)" }}>
                {SUPPORT_EMAIL}
              </a>{" "}
              along with this room, so they can see exactly what you saw. In the meantime you can
              mark the walls yourself — press <strong style={{ fontWeight: 500 }}>Add a wall</strong>{" "}
              in the colour panel and click the surfaces you want to paint.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {/* Newly mounted when `sent` flips, so autoFocus fires here and
                  focus doesn't get stranded on the Send button that vanished. */}
              <Button variant="brass" size="sm" onClick={onClose} autoFocus>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <Mono brass>Report a problem</Mono>
            <p style={{ font: "400 16px/1.45 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>
              Didn&rsquo;t come out right? Tell us what went wrong and our team will check this
              room. Tick everything that applies.
            </p>

            <fieldset
              disabled={sending}
              style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}
            >
              <legend className="sr-only">What went wrong</legend>
              {options.map((o, i) => (
                <label
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: sending ? "default" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(o.id)}
                    onChange={() => toggle(o.id)}
                    // Focus lands on the first option rather than staying on the
                    // button that opened the dialog — ticking one is the whole task.
                    autoFocus={i === 0}
                    style={{ flexShrink: 0, position: "relative", top: 3 }}
                  />
                  <span>
                    <span style={{ display: "block", font: "500 15px/1.35 var(--sans)", color: "var(--fg)" }}>
                      {o.label}
                    </span>
                    <span style={{ display: "block", font: "400 13px/1.45 var(--serif)", color: "var(--fg-mute)" }}>
                      {o.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="field">
              <label className="field-label" htmlFor="hv-report-note">
                Anything else? (optional)
              </label>
              <textarea
                id="hv-report-note"
                rows={3}
                maxLength={2000}
                value={note}
                disabled={sending}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. the ceiling was painted as a wall"
                style={{ width: "100%", resize: "vertical", font: "400 15px/1.5 var(--sans)" }}
              />
            </div>

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
                // A report naming no problem cannot be triaged — the backend
                // rejects it too, so the button says so before the round trip.
                disabled={picked.size === 0 || sending}
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
