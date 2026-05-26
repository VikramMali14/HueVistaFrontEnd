"use client";

import { Mono } from "@/components/ui/eyebrow";

export type PipelineStage = "upload" | "clean" | "mask" | "refine" | "recolor";

interface PipelineBarProps {
  current: PipelineStage;
  done: Partial<Record<PipelineStage, boolean>>;
}

const STAGES: ReadonlyArray<{ id: PipelineStage; roman: string; name: string; hint: string }> = [
  { id: "upload", roman: "I", name: "Upload", hint: "classified · indoor / 1024px copy" },
  { id: "clean", roman: "II", name: "Clean", hint: "Nano Banana Pro · wires · debris" },
  { id: "mask", roman: "III", name: "Auto-mask", hint: "Nano Banana · colour-coded" },
  { id: "refine", roman: "IV", name: "Refine", hint: "SAM 2 · click any point" },
  { id: "recolor", roman: "V", name: "Recolour", hint: "WebGL · 60 fps" },
];

export function PipelineBar({ current, done }: PipelineBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid var(--rule)", background: "rgba(21,17,13,.6)" }}>
      {STAGES.map((s, i, arr) => {
        const isDone = done[s.id];
        const isCurrent = s.id === current;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span className="roman">{s.roman}.</span>
                <span style={{ fontFamily: "var(--serif)", fontSize: 16, color: isDone || isCurrent ? "var(--ivory)" : "var(--mute)" }}>{s.name}</span>
                {(isDone || isCurrent) && (<span style={{ width: 4, height: 4, borderRadius: "50%", background: isDone ? "var(--brass)" : "var(--brass-soft)" }} />)}
              </div>
              <Mono style={{ fontSize: 9, letterSpacing: ".18em" }}>{s.hint}</Mono>
            </div>
            {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />}
          </div>
        );
      })}
    </div>
  );
}
