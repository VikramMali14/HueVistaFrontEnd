"use client";

import { useEffect } from "react";

/**
 * Mounts a single IntersectionObserver that watches every `.reveal`
 * element on the page and adds the `.in` class when they enter view.
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
    document
      .querySelectorAll(".reveal:not(.in)")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
