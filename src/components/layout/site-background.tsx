"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The fluid sim is WebGL/three.js — keep it out of SSR and out of the initial
// server payload. It only ever mounts on the client, on marketing routes.
const LiquidEther = dynamic(() => import("@/components/ui/liquid-ether"), { ssr: false });

// Where the ambient liquid backdrop is allowed. Deliberately NOT on forms,
// the catalogue, legal, share links or the signed-in app — those stay calm and
// fast. "/" matches exactly; the rest match the section and its sub-pages.
const MARKETING_ROUTES = ["/method", "/pricing", "/work", "/gallery", "/journal"] as const;

function isMarketingRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

// Brand-tuned palettes — warm brass over the charcoal/linen base, NOT the
// vibrant violet from the reference. The velocity→colour ramp runs low→high,
// so still water stays transparent and only motion reveals the metal.
const PALETTE_DARK = ["#4a3a1f", "#b89968", "#e7d4a6"];
const PALETTE_LIGHT = ["#d8c39a", "#b89968", "#7d6234"];

type Theme = "dark" | "light";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * Ambient fluid backdrop layered behind the page (z-index:-1). Mounts only on
 * marketing routes, re-tints itself to the active theme, and yields entirely to
 * `prefers-reduced-motion`. Pointer events pass straight through to the page.
 */
export function SiteBackground() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(readTheme());

    // Re-tint when the theme toggle flips data-theme on <html>.
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, []);

  if (!mounted || reducedMotion || !isMarketingRoute(pathname)) return null;

  // Stable module-level array refs (not fresh literals), so navigating between
  // marketing routes never re-inits the sim — only an actual theme change does.
  const colors = theme === "light" ? PALETTE_LIGHT : PALETTE_DARK;

  return (
    <div className="site-bg" data-theme-bg={theme} aria-hidden>
      <LiquidEther
        // A full-viewport fixed backdrop can't pause on scroll, so the per-frame
        // cost is kept low: no viscous solver, fewer pressure iterations, lower
        // resolution. It still pauses on tab-hidden and is off under reduced motion.
        colors={colors}
        resolution={0.35}
        mouseForce={12}
        cursorSize={90}
        isViscous={false}
        iterationsPoisson={16}
        BFECC
        autoDemo
        autoSpeed={0.4}
        autoIntensity={1.6}
        takeoverDuration={0.25}
        autoResumeDelay={2500}
        autoRampDuration={0.6}
      />
    </div>
  );
}
