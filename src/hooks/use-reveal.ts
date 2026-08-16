"use client";

import { useEffect } from "react";

/**
 * Mounts a single IntersectionObserver that watches every `.reveal`
 * element on the page and adds the `.in` class when they enter view.
 *
 * Sections that mount late are picked up too. A `.reveal` only ever reaches
 * `opacity: 1` by gaining `.in`, so anything rendered after this effect first
 * ran — a branch gated on `mounted`, a capability check, data arriving — would
 * otherwise stay invisible for good. The home page's mood gallery did exactly
 * that: it swaps in once `mounted && !reduceMotion && webglOk`, long after the
 * one-shot querySelectorAll had run, and so sat at opacity 0 over a live WebGL
 * canvas along with its "drag, scroll or swipe" hint. Re-scan on DOM changes
 * rather than at mount alone.
 */
export function useReveal(deps: ReadonlyArray<unknown> = []) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );

    let cancelled = false;
    let queued = false;
    // observe() on an already-observed element is a no-op, so re-scanning
    // wholesale is safe and keeps this to one observer for the whole page.
    const scan = () => {
      queued = false;
      if (cancelled) return;
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    };
    scan();

    // Coalesce mutation bursts into one scan per frame — pages like the studio
    // rewrite a lot of DOM, and a querySelectorAll per mutation record is waste.
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      mo.disconnect();
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
