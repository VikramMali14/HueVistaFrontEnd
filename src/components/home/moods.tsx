"use client";

import { useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";

interface MoodShade {
  name: string;
  code: string;
  hex: string;
  light?: boolean;
}

interface Mood {
  id: string;
  label: string;
  line: string;
  shades: ReadonlyArray<MoodShade>;
}

const MOODS: ReadonlyArray<Mood> = [
  {
    id: "calm",
    label: "Calm",
    line: "Rooms that lower their voice.",
    shades: [
      { name: "Porcelain", code: "AP-N108", hex: "#e8e6df", light: true },
      { name: "Dove", code: "AP-9812", hex: "#c9cfd2", light: true },
      { name: "Mist", code: "AP-9820", hex: "#aebcc4", light: true },
      { name: "Rain", code: "AP-9904", hex: "#8c98a8" },
      { name: "Quiet Blue", code: "AP-9931", hex: "#5f7382" },
    ],
  },
  {
    id: "earthy",
    label: "Earthy",
    line: "Baked clay, warm sand, late sun.",
    shades: [
      { name: "Champagne", code: "AP-2215", hex: "#dac1a3", light: true },
      { name: "Saffron", code: "AP-2208", hex: "#c9a17a", light: true },
      { name: "Terracotta", code: "AP-1428", hex: "#b96b48" },
      { name: "Walnut", code: "AP-3304", hex: "#8a6446" },
      { name: "Umber", code: "AP-3340", hex: "#5a4030" },
    ],
  },
  {
    id: "bold",
    label: "Bold",
    line: "One wall that does the talking.",
    shades: [
      { name: "Saffron Deep", code: "AP-2230", hex: "#b8884a" },
      { name: "Oxblood", code: "AP-3318", hex: "#7a3a2f" },
      { name: "Indigo Night", code: "AP-5519", hex: "#3a4870" },
      { name: "Deep Teal", code: "AP-5560", hex: "#2f3b3a" },
      { name: "Ink", code: "AP-0007", hex: "#1f262d" },
    ],
  },
  {
    id: "fresh",
    label: "Fresh",
    line: "Morning air, windows open.",
    shades: [
      { name: "Lime Wash", code: "AP-7780", hex: "#e6e9da", light: true },
      { name: "Mint Milk", code: "AP-7772", hex: "#d3ddd0", light: true },
      { name: "Eucalyptus", code: "AP-7741", hex: "#a9b8a4", light: true },
      { name: "Sage Whisper", code: "AP-7706", hex: "#7b8a72" },
      { name: "Fern", code: "AP-7733", hex: "#5b6c5b" },
    ],
  },
];

/**
 * A mood is easier to pick than a hex code. Switching moods remounts the
 * keyed strip, so each swatch replays its staggered pop (see .hv-mood-swatch).
 */
export function Moods() {
  const [mood, setMood] = useState<Mood>(MOODS[1]!);

  return (
    <section id="moods">
      <div className="reveal hv-mood-head">
        <Eyebrow>Where to begin</Eyebrow>
        <h2 className="display hv-mood-title">Start with <i>a feeling.</i></h2>
        <p className="hv-mood-line" aria-live="polite">{mood.line}</p>
      </div>

      <div className="reveal d1 hv-mood-pills" role="tablist" aria-label="Pick a mood">
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === mood.id}
            className="hv-mood-pill"
            data-active={m.id === mood.id || undefined}
            onClick={() => setMood(m)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* The reveal wrapper stays mounted; the keyed strip remounts per mood
          so every swatch replays its staggered pop. */}
      <div className="reveal d2">
        <div key={mood.id} className="hv-mood-strip">
          {mood.shades.map((s, i) => (
            <div
              key={s.code}
              className="hv-mood-swatch"
              data-light={s.light || undefined}
              style={{ background: s.hex, animationDelay: `${i * 70}ms` }}
            >
              <span className="hv-mood-swatch-name">{s.name}</span>
              <Mono className="hv-mood-swatch-code">{s.code}</Mono>
            </div>
          ))}
        </div>
      </div>

      <div className="reveal d2 hv-mood-cta">
        <LinkButton href="/catalogue" variant="ghost">Browse these in the catalogue <span className="arr">→</span></LinkButton>
      </div>
    </section>
  );
}
