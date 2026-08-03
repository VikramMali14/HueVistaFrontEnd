/**
 * Showcase content flag — the editorial pages that are still placeholder material.
 *
 * Three marketing sections were written as design placeholders and never filled in
 * with anything real:
 *
 *   /gallery      "A library of finished rooms" — twelve rooms that are flat CSS
 *                 gradients, not photographs, captioned with shade codes
 *                 (AP-1410, AP-1923, …) that return 404 from our own catalogue.
 *   /work         The same twelve invented projects as a 3D spiral, each with a
 *                 made-up city, a made-up credit line and a written customer story.
 *   /journal      Ten essays with invented bylines ("Ananya R.", "Vikram J.") and
 *                 no articles behind them — nothing to click through to — plus a
 *                 newsletter form that only sets a "Thank you ✓" and posts nowhere.
 *
 * Presenting those as a portfolio, a case-study library and a publication is a claim
 * about work that has not happened, so they are off by default. Set
 * `NEXT_PUBLIC_SHOWCASE_CONTENT=1` to bring them back — the intended use is once the
 * rooms are real photographs of real jobs and the essays actually exist.
 *
 * NEXT_PUBLIC on purpose: the site header and footer are client components and have
 * to decide whether to render the links, and the value is not a secret.
 */
export const SHOWCASE_CONTENT = process.env.NEXT_PUBLIC_SHOWCASE_CONTENT === "1";

/** Whether the placeholder editorial pages (/gallery, /work, /journal) are published. */
export function showcaseContentEnabled(): boolean {
  return SHOWCASE_CONTENT;
}
