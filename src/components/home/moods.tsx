"use client";

import { useEffect, useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import CircularGallery from "@/components/ui/circular-gallery";

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

// Lift a hex toward white by `amt` (0–1) for a soft top-light on each tile.
function lighten(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `rgb(${r},${g},${b})`;
}

// A pure (SSR-safe) SVG swatch tile: a subtle top-lit gradient of the shade.
// Kept as a data URI so it loads under the site CSP (img-src allows data:).
function swatchImage(hex: string): string {
  const top = lighten(hex, 0.18);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='${top}'/><stop offset='1' stop-color='${hex}'/>` +
    `</linearGradient></defs>` +
    `<rect width='800' height='600' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Canvas labels can't read CSS vars, so the gallery font is a plain system
// stack (no web-font fetch — that would trip the strict connect-src CSP).
const GALLERY_FONT = "600 26px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * "Start with a feeling." Pick a mood and its shades arc past in a curved,
 * draggable gallery. Each shade is a generated swatch tile; the gallery
 * re-tints its labels with the active theme.
 */
export function Moods() {
  const [mood, setMood] = useState<Mood>(MOODS[1]!);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // Default to the static strip; upgrade to the WebGL gallery only once we
  // know we're on the client AND motion is allowed AND a WebGL context is
  // actually obtainable. This gives SSR / no-JS / reduced-motion visitors a
  // real, legible fallback — and, crucially, visitors whose browser refuses a
  // WebGL context (blocklisted GPU drivers, remote desktops, battery-saver or
  // locked-down browsers): without the probe the gallery mounts an empty
  // canvas and the whole section renders blank.
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [webglOk, setWebglOk] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      setWebglOk(Boolean(gl));
      // Free the probe context right away — browsers cap live WebGL contexts.
      (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setWebglOk(false);
    }
    const read = (): "dark" | "light" =>
      document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onMq = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onMq);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const showGallery = mounted && !reduceMotion && webglOk;

  const textColor = theme === "light" ? "#2b2823" : "#eae8e3";

  const items = useMemo(
    () => mood.shades.map((s) => ({ image: swatchImage(s.hex), text: `${s.name} · ${s.code}` })),
    [mood],
  );

  return (
    <section id="moods">
      <div className="reveal hv-mood-head">
        <Eyebrow>Where to begin</Eyebrow>
        <h2 className="display hv-mood-title">Start with <i>a feeling.</i></h2>
        <p className="hv-mood-line" aria-live="polite">{mood.line}</p>
      </div>

      <div className="reveal d1 hv-mood-pills" role="group" aria-label="Pick a mood">
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={m.id === mood.id}
            className="hv-mood-pill"
            data-active={m.id === mood.id || undefined}
            onClick={() => setMood(m)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {showGallery ? (
        <>
          {/* Text alternative: the gallery is a WebGL canvas with no AT/keyboard
              access, so the shades are also exposed as a visually-hidden list. */}
          <ul className="sr-only" aria-label={`${mood.label} shades`}>
            {mood.shades.map((s) => (
              <li key={s.code}>{s.name} — {s.code}</li>
            ))}
          </ul>
          {/* theme is intentionally NOT in the key — textColor flows through as a
              prop, so a theme toggle re-tints without tearing down the WebGL
              context (which would risk the browser's context cap). */}
          <div className="reveal d2 hv-mood-gallery" aria-hidden="true">
            <CircularGallery
              key={mood.id}
              items={items}
              textColor={textColor}
              bend={2}
              borderRadius={0.06}
              scrollEase={0.05}
              scrollSpeed={2}
              font={GALLERY_FONT}
            />
          </div>
          <p className="hv-mood-hint reveal d3" aria-hidden="true">Drag, scroll or swipe to explore the shades →</p>
        </>
      ) : (
        // Static fallback: the original swatch strip. Serves SSR, no-JS and
        // prefers-reduced-motion without spinning up a WebGL context.
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
                <span className="mono hv-mood-swatch-code">{s.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
