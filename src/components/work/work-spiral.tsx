"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WORKS } from "@/lib/work";

// Scroll distance that advances the spiral by one project.
const PX_PER_ITEM = 340;
// Helix geometry: angle and vertical drop between neighbouring cards.
const ANGLE_STEP = 0.62; // radians
const Y_STEP = 138; // px
const BASE_RADIUS = 520; // px — clamped to the viewport at runtime

/** Deterministic per-card noise in [-1, 1] — Math.random() would break hydration. */
function jitter(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function pose(i: number, p: number, radius: number) {
  const rel = i - p;
  const a = rel * ANGLE_STEP;
  const x = Math.sin(a) * radius + jitter(i, 1) * 28;
  const y = rel * Y_STEP + jitter(i, 2) * 16;
  const z = (Math.cos(a) - 1) * radius;
  const rotY = -a * 32 + jitter(i, 3) * 9;
  const rotX = jitter(i, 4) * 6;
  const rotZ = jitter(i, 5) * 4;
  const scale = Math.max(0.55, 1 + z / 1900);
  const opacity = Math.abs(rel) > 5.5 ? 0 : Math.max(0.16, 1 + z / 1500);
  const blur = Math.min(7, -z / 260);
  return {
    transform: `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    opacity,
    blur,
    z,
  };
}

/** Server-rendered pose at progress 0 — the rAF loop takes over after mount. */
function initialStyle(i: number, aspect: string): CSSProperties {
  const s = pose(i, 0, BASE_RADIUS);
  return {
    aspectRatio: aspect,
    transform: s.transform,
    opacity: s.opacity,
    filter: `blur(${s.blur.toFixed(2)}px)`,
    zIndex: 2000 + Math.round(s.z),
  };
}

export function WorkSpiral() {
  const [view, setView] = useState<"spiral" | "list">("spiral");
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const helixRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);

  // The spiral is pure motion — honour reduced-motion by starting in list view.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setView("list");
  }, []);

  useEffect(() => {
    if (view !== "spiral") return;
    let raf = 0;
    let vw = window.innerWidth;
    const onResize = () => { vw = window.innerWidth; };
    window.addEventListener("resize", onResize);
    const max = WORKS.length - 1;

    const tick = () => {
      const target = Math.max(0, Math.min(max, window.scrollY / PX_PER_ITEM));
      progress.current += (target - progress.current) * 0.09;
      const p = progress.current;
      const radius = Math.min(vw * 0.42, BASE_RADIUS);
      for (let i = 0; i < WORKS.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const s = pose(i, p, radius);
        el.style.transform = s.transform;
        el.style.opacity = String(s.opacity);
        el.style.filter = `blur(${s.blur.toFixed(2)}px)`;
        el.style.zIndex = String(2000 + Math.round(s.z));
        el.style.pointerEvents = s.opacity < 0.3 ? "none" : "auto";
      }
      if (counterRef.current) {
        counterRef.current.textContent = String(Math.min(max, Math.round(p)) + 1).padStart(2, "0");
      }
      // First frame done → fade the helix in (hides the radius snap on small screens).
      if (helixRef.current && !helixRef.current.dataset.ready) helixRef.current.dataset.ready = "1";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [view]);

  const switchView = (v: "spiral" | "list") => {
    setView(v);
    window.scrollTo({ top: 0 });
    progress.current = 0;
  };

  return (
    <div className="hv-work" data-view={view}>
      {view === "spiral" ? (
        <>
          <div className="hv-work-stage" role="region" aria-label="Our projects, arranged in a 3D spiral. Scroll to browse.">
            <div className="hv-work-helix" ref={helixRef}>
              {WORKS.map((w, i) => (
                <Link
                  key={w.slug}
                  href={`/work/${w.slug}`}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className="hv-work-card ph ph-grain"
                  data-tone={w.tone}
                  style={initialStyle(i, w.aspect)}
                  aria-label={`${w.title} — ${w.category}, ${w.location}. View project.`}
                >
                  <span className="hv-work-card-tag">{w.code} · {w.shadeName}</span>
                  <span className="hv-work-card-title">{w.title}</span>
                  <span className="hv-work-card-meta">{w.category} · {w.location} · {w.year}</span>
                </Link>
              ))}
            </div>
            <div className="hv-work-head">
              <span className="hv-work-head-title">Our work</span>
              <span className="hv-work-head-sub">Real rooms · only the wall has changed</span>
            </div>
            <div className="hv-work-count" aria-hidden>
              <span ref={counterRef}>01</span>&nbsp;/&nbsp;{String(WORKS.length).padStart(2, "0")}
            </div>
            <div className="hv-work-hint" aria-hidden>scroll</div>
          </div>
          {/* Tall spacer: the page's scrollbar drives the spiral. */}
          <div style={{ height: `calc(${(WORKS.length - 1) * PX_PER_ITEM}px + 100vh)` }} aria-hidden />
        </>
      ) : (
        <div className="hv-work-list">
          <header className="hv-work-list-head">
            <span className="hv-work-head-title">Our work</span>
            <span className="hv-work-head-sub">{WORKS.length} rooms · real photographs · catalogue shades</span>
          </header>
          <ol className="hv-work-rows">
            {WORKS.map((w, i) => (
              <li key={w.slug}>
                <Link href={`/work/${w.slug}`} className="hv-work-row">
                  <span className="hv-work-row-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="hv-work-row-swatch" style={{ background: w.swatch }} aria-hidden />
                  <span className="hv-work-row-title">{w.title}</span>
                  <span className="hv-work-row-code">{w.code}</span>
                  <span className="hv-work-row-loc">{w.location} · {w.year}</span>
                  <span className="hv-work-row-arr" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="hv-work-toggle" role="group" aria-label="View mode">
        <button
          type="button"
          data-active={view === "spiral" || undefined}
          aria-pressed={view === "spiral"}
          onClick={() => switchView("spiral")}
        >
          spiral
        </button>
        <span className="dot" aria-hidden />
        <button
          type="button"
          data-active={view === "list" || undefined}
          aria-pressed={view === "list"}
          onClick={() => switchView("list")}
        >
          list
        </button>
      </div>
    </div>
  );
}
