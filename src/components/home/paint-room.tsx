"use client";

import { useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";

interface Shade {
  name: string;
  code: string;
  hex: string;
}

const SHADES: ReadonlyArray<Shade> = [
  { name: "Terracotta", code: "AP-1428", hex: "#b96b48" },
  { name: "Sage Whisper", code: "AP-7706", hex: "#7b8a72" },
  { name: "Slate", code: "AP-9904", hex: "#3e4a52" },
  { name: "Saffron", code: "AP-2208", hex: "#c9a17a" },
  { name: "Oxblood", code: "AP-3318", hex: "#7a3a2f" },
  { name: "Bone China", code: "AP-N101", hex: "#e9e2d2" },
];

/**
 * A live, clickable demo: pick a chip and the wall repaints with a
 * paint-spread wipe. Two layers — the base holds the previous shade, the
 * keyed coat animates a clip-path circle over it (see .hv-room-coat).
 */
export function PaintRoom() {
  const [shade, setShade] = useState<Shade>(SHADES[0]!);
  const [prev, setPrev] = useState<Shade>(SHADES[0]!);

  const pick = (next: Shade) => {
    if (next.code === shade.code) return;
    setPrev(shade);
    setShade(next);
  };

  return (
    <section id="paint-room" className="hv-room full-bleed">
      <div className="hv-room-inner">
        <div className="hv-room-copy reveal">
          <Eyebrow>Try it here</Eyebrow>
          <h2 className="display hv-room-title">Go on —<br /><i>paint it.</i></h2>
          <p className="hv-room-lead">
            Tap a shade. The wall changes — the light and shadows stay
            exactly where they were. This is what your customer sees at
            the counter, with their own photo.
          </p>

          <div className="hv-room-chips" role="group" aria-label="Pick a wall colour">
            {SHADES.map((s) => (
              <button
                key={s.code}
                type="button"
                className="hv-room-chip"
                data-active={s.code === shade.code || undefined}
                style={{ background: s.hex }}
                onClick={() => pick(s)}
                aria-label={`Paint the wall ${s.name}`}
                aria-pressed={s.code === shade.code}
              />
            ))}
          </div>
          <div className="hv-room-shade" aria-live="polite">
            <span className="hv-room-shade-name">{shade.name}</span>
            <Mono>{shade.code}</Mono>
          </div>

          <LinkButton href="/trial" variant="ghost">Now try your own photo <span className="arr">→</span></LinkButton>
        </div>

        <div className="hv-room-stage reveal d1" aria-hidden>
          <div className="hv-room-scene">
            <div className="hv-room-wall" style={{ background: prev.hex }} />
            <div key={shade.code} className="hv-room-coat" style={{ background: shade.hex }} />
            <div className="hv-room-light" />
            <div className="hv-room-frame"><span /></div>
            <div className="hv-room-skirting" />
            <div className="hv-room-floor" />
            <div className="hv-room-shadow" />
            <div className="hv-room-grain ph-grain" />
            <span className="hv-room-tag">{shade.name} · {shade.code}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
