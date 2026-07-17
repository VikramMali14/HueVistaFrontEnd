"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resnapMasksAction } from "@/lib/auth";
import type { ResnapSummary } from "@/lib/api";

/**
 * Admin maintenance control for POST /api/admin/maintenance/resnap-masks.
 * Re-runs the edge-snap over stored auto masks for up to `limit` projects that
 * have a cleaned canvas (oldest first). Idempotent — safe to run repeatedly to
 * walk a backlog. Shown on the /admin/migration page (ROLE_ADMIN only).
 */
export function ResnapMasks() {
  const [limit, setLimit] = useState(50);
  const [summary, setSummary] = useState<ResnapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      setError(null);
      setSummary(null);
      const res = await resnapMasksAction(limit);
      if (res.error) setError(res.error);
      else if (res.summary) setSummary(res.summary);
    });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 20 }}>
        <div className="field" style={{ maxWidth: 180 }}>
          <label className="field-label" htmlFor="resnap-limit">Projects per run</label>
          <input
            id="resnap-limit"
            name="resnap-limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
            disabled={pending}
          />
        </div>
        <Button type="button" variant="brass" onClick={run} disabled={pending} style={{ marginBottom: 2 }}>
          {pending
            ? <><Spinner size={14} color="currentColor" decorative /> Re-snapping…</>
            : <>Run re-snap pass <span className="arr">→</span></>}
        </Button>
      </div>

      <p style={{ marginTop: 12, font: "300 14px/1.6 var(--serif)", color: "var(--fg-mute)", maxWidth: "56ch" }}>
        Processes the oldest projects with a cleaned canvas, up to the count above (capped at 200 per run).
        Run it again to continue through a larger backlog — snapping an already-snapped mask does nothing.
      </p>

      {summary && (
        <div
          role="status"
          aria-live="polite"
          style={{ marginTop: 20, border: "1px solid var(--sage)", borderRadius: "var(--radius)", padding: "18px 20px" }}
        >
          <div style={{ font: "500 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)", marginBottom: 14 }}>
            Pass complete
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16 }}>
            <Stat label="Projects examined" value={summary.projectsExamined} />
            <Stat label="Regions re-snapped" value={summary.regionsResnapped} />
            <Stat label="Regions skipped" value={summary.regionsSkipped} />
            <Stat label="Failures" value={summary.failures} warn={summary.failures > 0} />
          </div>
          {summary.projectsExamined === 0 && (
            <p style={{ marginTop: 14, font: "300 14px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
              No projects with a cleaned canvas were left to process — the backlog is clear.
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 20 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div
        className="display"
        style={{ fontSize: "clamp(26px, 4vw, 34px)", lineHeight: 1, color: warn ? "var(--terracotta)" : "var(--fg)" }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, font: "400 12px/1.3 var(--sans)", color: "var(--fg-mute)" }}>{label}</div>
    </div>
  );
}
