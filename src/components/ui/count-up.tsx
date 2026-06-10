"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /** Final number to land on. */
  value: number;
  /** Animation length in ms. */
  duration?: number;
  /** Custom formatter; defaults to Indian digit grouping. */
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Rolls a number up from 0 with an ease-out curve — but only once the element
 * is actually on screen, so the animation isn't wasted inside a still-hidden
 * .reveal section. SSR and reduced-motion render the final value directly.
 * tabular-nums keeps the layout steady while digits change.
 */
export function CountUp({ value, duration = 700, format, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const playedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    playedRef.current = false;
    let raf = 0;
    let start: number | null = null;
    const play = () => {
      if (playedRef.current) return;
      playedRef.current = true;
      const tick = (t: number) => {
        if (start === null) start = t;
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  const text = format ? format(shown) : shown.toLocaleString("en-IN");
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {text}
    </span>
  );
}
