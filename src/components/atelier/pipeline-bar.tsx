"use client";

export type PipelineStage = "upload" | "clean" | "mask" | "refine" | "recolor";

interface PipelineBarProps {
  current: PipelineStage;
  done: Partial<Record<PipelineStage, boolean>>;
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

export function PipelineBar({ current, done }: PipelineBarProps) {
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
                  background: isDone ? "var(--fg)" : isCurrent ? "var(--surface-soft)" : "transparent",
                  border: "1px solid " + (isDone || isCurrent ? "var(--fg)" : "var(--rule-strong)"),
                  color: isDone ? "var(--bg)" : isCurrent ? "var(--fg)" : "var(--fg-mute)",
                  font: "600 11px/1 var(--sans)",
                }}
              >
                {isDone ? "✓" : s.step}
              </span>
              <span
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  color: isDone || isCurrent ? "var(--fg)" : "var(--fg-mute)",
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
