"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ArtShade {
  name: string;
  code: string;
  bg: string;
}

const SHADES: ReadonlyArray<ArtShade> = [
  {
    name: "Terracotta",
    code: "AP-1428",
    bg: "radial-gradient(ellipse at 30% 25%, rgba(255,235,210,.32), transparent 60%), linear-gradient(160deg, #b96b48 0%, #7a3a2f 55%, #2a100e 100%)",
  },
  {
    name: "Sage Whisper",
    code: "AP-7706",
    bg: "radial-gradient(ellipse at 30% 25%, rgba(255,250,235,.24), transparent 60%), linear-gradient(160deg, #8a9a85 0%, #5b6c5b 55%, #232d23 100%)",
  },
  {
    name: "Indigo Night",
    code: "AP-5519",
    bg: "radial-gradient(ellipse at 30% 25%, rgba(220,225,255,.22), transparent 60%), linear-gradient(160deg, #3a4870 0%, #1f284a 55%, #0c1226 100%)",
  },
  {
    name: "Slate",
    code: "AP-9904",
    bg: "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,.18), transparent 60%), linear-gradient(160deg, #6a7680 0%, #3e4a52 55%, #1f262d 100%)",
  },
  {
    name: "Walnut",
    code: "AP-3304",
    bg: "radial-gradient(ellipse at 30% 25%, rgba(255,220,180,.2), transparent 60%), linear-gradient(160deg, #8a6446 0%, #5a4030 55%, #2c1d12 100%)",
  },
];

const HOLD_MS = 5000;

/**
 * The sign-in art panel as a living wall: it drifts through real shades
 * while you type, one slow crossfade at a time. The dots jump straight
 * to a shade; auto-advance pauses for users who prefer reduced motion.
 */
export function AuthArt({ children }: { children: ReactNode }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SHADES.length), HOLD_MS);
    return () => clearInterval(t);
  }, []);

  const shade = SHADES[idx] ?? SHADES[0]!;

  return (
    <aside className="auth-art">
      <div className="auth-art-layers" aria-hidden>
        {SHADES.map((s, i) => (
          <div
            key={s.code}
            className="auth-art-layer"
            data-active={i === idx || undefined}
            style={{ background: s.bg }}
          />
        ))}
        <div className="auth-art-grain ph-grain" />
      </div>

      <div className="corner">
        <span key={shade.code} className="auth-art-label">{shade.name} · {shade.code}</span>
      </div>

      <div className="auth-art-mid">{children}</div>

      <div className="auth-art-foot">
        <div className="auth-art-dots" role="group" aria-label="Wall colour">
          {SHADES.map((s, i) => (
            <button
              key={s.code}
              type="button"
              className="auth-art-dot"
              data-active={i === idx || undefined}
              onClick={() => setIdx(i)}
              aria-label={`Show ${s.name}`}
              aria-pressed={i === idx}
            />
          ))}
        </div>
        <div className="corner">
          <span>HueVista</span>
          <span>Belgavi, India</span>
        </div>
      </div>
    </aside>
  );
}
