"use client";

import { Mono } from "@/components/ui/eyebrow";
import { t } from "@/lib/i18n";
import type { UiLocale, UiVariant } from "@/lib/types";

export type PipelineStage = "upload" | "clean" | "mask" | "refine" | "recolor";

interface PipelineBarProps {
  current: PipelineStage;
  done: Partial<Record<PipelineStage, boolean>>;
  variant?: UiVariant;
  locale?: UiLocale;
}

interface StageDef {
  id: PipelineStage;
  roman: string;
  step: string;
  premium: { name: string; hint: string };
  classicKey: "pipeline.upload" | "pipeline.clean" | "pipeline.mask" | "pipeline.refine" | "pipeline.recolor";
}

const STAGES: ReadonlyArray<StageDef> = [
  {
    id: "upload",
    roman: "I",
    step: "1",
    premium: { name: "Upload", hint: "classified · indoor / 1024px copy" },
    classicKey: "pipeline.upload",
  },
  {
    id: "clean",
    roman: "II",
    step: "2",
    premium: { name: "Clean", hint: "Nano Banana Pro · wires · debris" },
    classicKey: "pipeline.clean",
  },
  {
    id: "mask",
    roman: "III",
    step: "3",
    premium: { name: "Auto-mask", hint: "Nano Banana · colour-coded" },
    classicKey: "pipeline.mask",
  },
  {
    id: "refine",
    roman: "IV",
    step: "4",
    premium: { name: "Refine", hint: "SAM 2 · click any point" },
    classicKey: "pipeline.refine",
  },
  {
    id: "recolor",
    roman: "V",
    step: "5",
    premium: { name: "Recolour", hint: "WebGL · 60 fps" },
    classicKey: "pipeline.recolor",
  },
];

export function PipelineBar({ current, done, variant = "premium", locale = "en" }: PipelineBarProps) {
  const isClassic = variant === "classic";
  return (
    <div
      className="hv-pipeline r-scroll-x"
      data-variant={variant}
      style={{
        display: "flex",
        alignItems: "center",
        padding: isClassic ? "10px 16px" : "14px 24px",
        borderBottom: "1px solid var(--rule)",
        background: isClassic ? "var(--surface-soft)" : "var(--surface-overlay)",
        gap: 12,
      }}
    >
      {STAGES.map((s, i, arr) => {
        const isDone = done[s.id];
        const isCurrent = s.id === current;
        const label = isClassic ? t(locale, s.classicKey) : s.premium.name;
        return (
          <div
            key={s.id}
            className="hv-pipeline-step"
            aria-current={isCurrent ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: isClassic ? 110 : 140 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                {isClassic ? (
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: isDone
                        ? "var(--accent)"
                        : isCurrent
                          ? "var(--surface)"
                          : "transparent",
                      border: "1px solid " + (isDone || isCurrent ? "var(--accent)" : "var(--rule-strong)"),
                      color: isDone ? "var(--bg)" : isCurrent ? "var(--accent)" : "var(--fg-mute)",
                      font: "600 11px/1 var(--sans, system-ui)",
                    }}
                  >
                    {isDone ? "✓" : s.step}
                  </span>
                ) : (
                  <span className="roman">{s.roman}.</span>
                )}
                <span
                  style={{
                    fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
                    fontSize: isClassic ? 13 : 16,
                    fontWeight: isClassic ? 500 : 400,
                    color: isDone || isCurrent ? "var(--fg)" : "var(--fg-mute)",
                  }}
                >
                  {label}
                </span>
                {!isClassic && (isDone || isCurrent) && (
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: isDone ? "var(--accent)" : "var(--accent-soft)",
                    }}
                  />
                )}
              </div>
              {!isClassic && (
                <Mono style={{ fontSize: 9, letterSpacing: ".18em" }}>{s.premium.hint}</Mono>
              )}
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
        @media (max-width: 768px) {
          .hv-pipeline { padding: 10px 12px !important; }
          .hv-pipeline-rule { display: none; }
        }
      `}</style>
    </div>
  );
}
