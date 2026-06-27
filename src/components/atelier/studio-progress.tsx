"use client";

import { Spinner } from "@/components/ui/spinner";
import type { PipelineStage } from "./pipeline-bar";

interface ShadeChip {
  name: string;
  code: string;
  hex: string;
}

interface StudioProgressProps {
  done: Partial<Record<PipelineStage, boolean>>;
  /** Stage doing background work right now — shows a spinner on that step. */
  busy?: PipelineStage;
  /** The currently applied shade, surfaced as a chip on the right. */
  shade?: ShadeChip | null;
  /** Guests never see shade codes. */
  hideCode?: boolean;
  /** A public share link has been created. */
  shared?: boolean;
}

type PhaseKey = "upload" | "mask" | "recolor" | "share";

interface PhaseDef {
  key: PhaseKey;
  label: string;
  labelDone?: string;
  /** The pipeline stage whose `busy` flag lights this phase. */
  busyStage?: PipelineStage;
}

const PHASES: ReadonlyArray<PhaseDef> = [
  { key: "upload", label: "Photo uploaded" },
  { key: "mask", label: "Detecting walls", labelDone: "Walls detected", busyStage: "mask" },
  { key: "recolor", label: "Recolouring", labelDone: "Recoloured" },
  { key: "share", label: "Share", labelDone: "Shared" },
];

/**
 * Bottom breadcrumb that narrates the studio journey — photo → walls →
 * recolour → share — and surfaces the shade currently on the wall. Replaces
 * the old top step-bar so the canvas gets the full height.
 */
export function StudioProgress({ done, busy, shade, hideCode, shared }: StudioProgressProps) {
  const isDone = (p: PhaseDef) => (p.key === "share" ? Boolean(shared) : Boolean(done[p.key]));
  // The active phase is whatever's working in the background, otherwise the
  // first phase not yet complete.
  const busyIndex = busy ? PHASES.findIndex((p) => p.busyStage === busy) : -1;
  const firstPending = PHASES.findIndex((p) => !isDone(p));
  const activeIndex = busyIndex >= 0 ? busyIndex : firstPending;

  return (
    <div className="hv-studio-progress" role="group" aria-label="Studio progress">
      <ol className="hv-studio-progress-steps">
        {PHASES.map((p, i) => {
          const complete = isDone(p);
          const active = i === activeIndex && !complete;
          const busyHere = p.busyStage && busy === p.busyStage;
          const state = complete ? "done" : active ? "active" : "pending";
          return (
            <li key={p.key} className="hv-studio-progress-step" data-state={state}>
              {i > 0 && (
                <span className="hv-studio-progress-sep" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              )}
              <span className="hv-studio-progress-ico" aria-hidden>
                {busyHere ? (
                  <Spinner size={11} color="#a080ff" />
                ) : complete ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 6" />
                  </svg>
                ) : (
                  <span className="hv-studio-progress-bullet" />
                )}
              </span>
              <span className="hv-studio-progress-label">
                {complete && p.labelDone ? p.labelDone : p.label}
              </span>
            </li>
          );
        })}
      </ol>

      {shade && (
        <div className="hv-studio-progress-shade" title={`${shade.name}${hideCode ? "" : " · " + shade.code}`}>
          <span className="hv-studio-progress-shade-dot" style={{ background: shade.hex }} aria-hidden />
          <span className="hv-studio-progress-shade-name">{shade.name}</span>
          {!hideCode && <span className="hv-studio-progress-shade-code">{shade.code}</span>}
        </div>
      )}
    </div>
  );
}
