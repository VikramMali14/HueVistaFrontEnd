"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import type { MaskReport, MaskReportIssue, MaskReportStatus } from "@/lib/types";

interface MaskReportsProps {
  /** Null = the queue could not be loaded (outage / expired session) — shown as
   *  an error, never as "no reports". The two mean opposite things. */
  initial: MaskReport[] | null;
  updateAction: (
    reportId: string,
    body: { status?: MaskReportStatus; adminNote?: string },
  ) => Promise<{ report?: MaskReport; error?: string }>;
}

const ISSUE_LABEL: Record<MaskReportIssue, string> = {
  MASK_NOT_GENERATED_PROPERLY: "Walls not detected properly",
  IMAGE_NOT_CLEANED_PROPERLY: "Photo not cleaned up properly",
  OTHER: "Something else",
};

const STATUS_LABEL: Record<MaskReportStatus, string> = {
  NEW: "New",
  IN_REVIEW: "Being looked at",
  RESOLVED: "Resolved",
};

function when(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The admin queue for "the AI got this wrong".
 *
 * Every row is a run that succeeded as far as the backend is concerned — it
 * returned SEGMENTED, wrote its regions and passed every check — and was
 * nonetheless wrong on screen. That is the only thing this page exists to
 * surface, so each row leads with what the user ticked and follows with the
 * state the run was actually in when they ticked it.
 *
 * The snapshot line matters more than it looks: the first instinct on a bad mask
 * is to re-run segmentation, and that overwrites the project's own status, mode
 * and region count. The numbers here are from the reported run, not from
 * whatever the project looks like now.
 */
export function MaskReports({ initial, updateAction }: MaskReportsProps) {
  const [reports, setReports] = useState(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (initial === null) {
    return (
      <p className="field-error" role="alert">
        Could not load the reports — refresh the page, or sign in again if it keeps happening.
      </p>
    );
  }

  function run(reportId: string, body: { status?: MaskReportStatus; adminNote?: string }) {
    setBusyId(reportId);
    startTransition(async () => {
      setError(null);
      const res = await updateAction(reportId, body);
      setBusyId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.report) {
        setReports((prev) => prev.map((r) => (r.id === reportId ? res.report! : r)));
      }
    });
  }

  if (reports.length === 0) {
    return (
      <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
        Nothing reported. Reports land here when someone presses &ldquo;Report a problem&rdquo; in
        the studio after a run.
      </p>
    );
  }

  // New first — they are the ones nobody has looked at.
  const ordered = [...reports].sort((a, b) => {
    const rank = (s: MaskReportStatus) => (s === "NEW" ? 0 : s === "IN_REVIEW" ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-busy={pending}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {ordered.map((r) => {
        const busy = busyId === r.id;
        return (
          <article
            key={r.id}
            style={{
              border: "1px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
              padding: "18px 20px",
              opacity: r.status === "RESOLVED" ? 0.62 : 1,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
              <Mono brass={r.status === "NEW"}>{STATUS_LABEL[r.status]}</Mono>
              <Mono>{when(r.createdAt)}</Mono>
              <span style={{ flex: 1 }} />
              {r.projectId && (
                // Straight into THIS room's masks — the viewer is where "is this
                // actually wrong?" gets answered, and it can now open a room the
                // admin does not own, which is every room that ever gets reported.
                <Link
                  href={`/admin/mask-viewer?project=${encodeURIComponent(r.projectId)}`}
                  style={{ font: "500 12px/1 var(--mono)", color: "var(--accent-soft)" }}
                >
                  Open the masks →
                </Link>
              )}
            </div>

            <h3 style={{ font: "400 20px/1.3 var(--serif)", margin: "10px 0 4px" }}>
              {r.issues.map((i) => ISSUE_LABEL[i] ?? i).join(" · ") || "No issue named"}
            </h3>

            <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "0 0 10px" }}>
              {r.projectName ?? "Untitled room"}
              {r.projectId ? ` · ${r.projectId}` : ""}
              {" — "}
              {r.reporterName ?? "Walk-in customer"}
              {r.reporterEmail ? ` · ${r.reporterEmail}` : ""}
              {r.shopName ? ` · via ${r.shopName}` : ""}
              {r.reporterRole ? ` · ${r.reporterRole.toLowerCase()}` : ""}
            </p>

            {r.note && (
              <p
                style={{
                  font: "400 15px/1.55 var(--serif)",
                  color: "var(--fg)",
                  borderLeft: "2px solid var(--rule-strong)",
                  paddingLeft: 12,
                  margin: "0 0 12px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {r.note}
              </p>
            )}

            {/* The reported RUN, not the project's current state — a re-run since
                then has overwritten all of this on the project itself. */}
            <p style={{ font: "400 12px/1.5 var(--mono)", color: "var(--fg-mute)", margin: "0 0 14px" }}>
              at report time · status {r.projectStatus ?? "—"} · mode {r.maskMode ?? "AUTO"} ·{" "}
              {r.regionCount ?? 0} region{(r.regionCount ?? 0) === 1 ? "" : "s"} · clean-up{" "}
              {r.hadCleanedImage ? "ran" : "did not run"}
            </p>

            {r.status === "RESOLVED" && r.resolvedByName && (
              <Mono style={{ display: "block", marginBottom: 10 }}>
                Resolved by {r.resolvedByName} · {when(r.resolvedAt)}
              </Mono>
            )}

            {r.adminNote && (
              <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "0 0 12px" }}>
                <span style={{ color: "var(--fg-mute)" }}>Note: </span>
                {r.adminNote}
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
                <label className="field-label" htmlFor={`note-${r.id}`}>
                  Internal note
                </label>
                <input
                  id={`note-${r.id}`}
                  type="text"
                  maxLength={2000}
                  placeholder={r.adminNote ? "Replace the note…" : "What did you find?"}
                  value={notes[r.id] ?? ""}
                  disabled={busy}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
              </div>
              {(notes[r.id] ?? "").trim() !== "" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => {
                    run(r.id, { adminNote: notes[r.id] });
                    setNotes((n) => ({ ...n, [r.id]: "" }));
                  }}
                >
                  Save note
                </button>
              )}
              {r.status !== "IN_REVIEW" && r.status !== "RESOLVED" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => run(r.id, { status: "IN_REVIEW" })}
                >
                  I&rsquo;m on it
                </button>
              )}
              {r.status !== "RESOLVED" ? (
                <button
                  type="button"
                  className="btn btn-brass btn-sm"
                  disabled={busy}
                  onClick={() => run(r.id, { status: "RESOLVED" })}
                >
                  {busy ? "Saving…" : "Mark resolved"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => run(r.id, { status: "NEW" })}
                >
                  Re-open
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
