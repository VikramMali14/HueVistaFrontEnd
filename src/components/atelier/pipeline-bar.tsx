"use client";

import { useEffect, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";

export type PipelineStage = "upload" | "clean" | "mask" | "refine" | "recolor";

interface PipelineBarProps {
  current: PipelineStage;
  done: Partial<Record<PipelineStage, boolean>>;
  /** Stage doing background work right now — shows a spinner on that step. */
  busy?: PipelineStage;
}

interface StageDef {
  id: PipelineStage;
  step: string;
  name: string;
}

const STAGES: ReadonlyArray<StageDef> = [
  { id: "upload", step: "1", name: "Add photo" },
  { id: "clean", step: "2", name: "Tidy up" },
  { id: "mask", step: "3", name: "Detect walls" },
  { id: "refine", step: "4", name: "Adjust" },
  { id: "recolor", step: "5", name: "Apply colour" },
];

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={up ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function PipelineBar({ current, done, busy }: PipelineBarProps) {
  // "Tidy up" (clean) is a toggle and "Adjust" (refine) only happens when the
  // user hand-draws a wall — the bar is ready once the CORE journey completes.
  const ready = Boolean(done.upload && done.mask && done.recolor && !busy);
  const [userExpanded, setUserExpanded] = useState(false);
  // Derived during render (not an effect) so the collapse happens in the same
  // frame ready flips — no expanded-bar flash, no double layout shift.
  const collapsed = ready && !userExpanded;
  const showBtnRef = useRef<HTMLButtonElement>(null);
  const hideBtnRef = useRef<HTMLButtonElement>(null);
  // Hand focus to the counterpart toggle so it isn't dropped on <body>.
  const focusAfterToggleRef = useRef<"show" | "hide" | null>(null);
  useEffect(() => {
    if (focusAfterToggleRef.current === "show") hideBtnRef.current?.focus();
    if (focusAfterToggleRef.current === "hide") showBtnRef.current?.focus();
    focusAfterToggleRef.current = null;
  });

  if (collapsed) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          height: 32,
          padding: "0 20px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--surface)",
        }}
      >
        <Mono style={{ color: "var(--accent)" }}>✓ Ready — colours apply instantly</Mono>
        <button
          ref={showBtnRef}
          type="button"
          onClick={() => {
            focusAfterToggleRef.current = "show";
            setUserExpanded(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: "4px 0",
            color: "var(--fg-mute)",
            font: "500 12px/1 var(--sans)",
            cursor: "pointer",
          }}
        >
          Show steps <Chevron />
        </button>
      </div>
    );
  }

  return (
    <div
      className="hv-pipeline r-scroll-x"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--surface)",
        gap: 12,
      }}
    >
      {STAGES.map((s, i, arr) => {
        const isDone = done[s.id];
        const isCurrent = s.id === current;
        const isBusy = busy === s.id;
        return (
          <div
            key={s.id}
            className="hv-pipeline-step"
            aria-current={isCurrent ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 120 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isDone && !isBusy ? "var(--fg)" : isCurrent ? "var(--surface-soft)" : "transparent",
                  border: "1px solid " + (isBusy ? "var(--accent)" : isDone || isCurrent ? "var(--fg)" : "var(--rule-strong)"),
                  color: isDone && !isBusy ? "var(--bg)" : isCurrent ? "var(--fg)" : "var(--fg-mute)",
                  font: "600 11px/1 var(--sans)",
                }}
              >
                {isBusy ? <Spinner size={12} color="var(--accent)" /> : isDone ? "✓" : s.step}
              </span>
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  color: isBusy ? "var(--accent)" : isDone || isCurrent ? "var(--fg)" : "var(--fg-mute)",
                }}
              >
                {s.name}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div
                className="hv-pipeline-rule"
                aria-hidden
                style={{ flex: 1, height: 1, background: "var(--rule)", minWidth: 24 }}
              />
            )}
          </div>
        );
      })}
      {ready && (
        <button
          ref={hideBtnRef}
          type="button"
          onClick={() => {
            focusAfterToggleRef.current = "hide";
            setUserExpanded(false);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            padding: "4px 0",
            color: "var(--fg-mute)",
            font: "500 12px/1 var(--sans)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Hide <Chevron up />
        </button>
      )}
      <style>{`
        /* On tablet/phone the 5 steps are wider than the panel and would clip.
           Wrap the steps onto multiple rows so every stage stays visible. */
        @media (max-width: 768px) {
          .hv-pipeline { padding: 12px !important; gap: 10px 16px !important; flex-wrap: wrap !important; }
          .hv-pipeline-rule { display: none !important; }
          .hv-pipeline-step { min-width: 0 !important; flex: 0 0 auto !important; }
        }
      `}</style>
    </div>
  );
}
