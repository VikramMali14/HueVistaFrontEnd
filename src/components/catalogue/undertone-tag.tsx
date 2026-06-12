"use client";

import { undertone, type Undertone } from "@/lib/color-science";

/** Friendly display words — what a counter person would actually say. */
const LABELS: Record<Undertone, string> = {
  pinkish: "pinkish",
  peachy: "peachy",
  yellowish: "yellowish",
  greenish: "greenish",
  bluish: "bluish",
  violet: "violet",
  neutral: "neutral",
};

/** A faint dot of the undertone direction itself, so the word has a face. */
const DOTS: Record<Undertone, string> = {
  pinkish: "#c98a96",
  peachy: "#cf9a72",
  yellowish: "#c9b36a",
  greenish: "#8aa882",
  bluish: "#7e96b4",
  violet: "#9c86b0",
  neutral: "#9a968e",
};

/** Tiny "undertone: pinkish" chip used on cards, detail panels and compares. */
export function UndertoneTag({ hex, prefix = false }: { hex: string; prefix?: boolean }) {
  const tone = undertone(hex);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        font: "400 10px/1 var(--mono)",
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: "var(--fg-mute)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: DOTS[tone], flexShrink: 0 }} />
      {prefix ? `undertone · ${LABELS[tone]}` : LABELS[tone]}
    </span>
  );
}
