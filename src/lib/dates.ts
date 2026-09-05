/**
 * One way to write a date.
 *
 * The app had four, often within a click of each other: "19 AUG 2026" on an access
 * code, "5 September 2026" on the plan card, "12 Aug" on a project tile and "10 Aug
 * 2026, 1:47 am" in a payment row. Nothing was wrong with any single one of them —
 * the cost is that a shop comparing a code's expiry with its plan's renewal has to
 * translate between two formats to do it, and a bare "12 Aug" cannot be compared
 * with either because it does not say which year.
 *
 * `en-IN` and IST throughout: the audience is India-only, so a date rendered on the
 * server and a date rendered in the browser have to agree, and the browser's own
 * zone is the thing that would make them differ.
 */

const ZONE = "Asia/Kolkata";

/** "5 Sep 2026" — the default for anything dated. */
export function formatDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: ZONE,
  });
}

/**
 * "5 Sep 2026, 1:47 am" — for rows where two entries can share a day and the order
 * within it is the point (payments, pattern changes).
 */
export function formatDateTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: ZONE,
  });
}

/**
 * Has a deadline we are showing already gone by?
 *
 * Every window in the product is recorded twice — as a date, and as a boolean the
 * backend stamps when a sweep gets round to it (`expired` on an access code, on a
 * customer's entitlement, on a subscription period). The two drift apart, because
 * only the boolean needs a sweep to stay true, and when they drift the screen puts
 * both halves side by side and contradicts itself: "expires 1 Jul" next to "ACTIVE",
 * read in September.
 *
 * So ask the date as well, and let either one close the window. A flag that says
 * expired is still believed — this can only ever agree with it, never overrule it —
 * and a missing or unparseable date leaves the flag to answer alone.
 *
 * `now` is a parameter so a component holding a mount-time clock stays pure across
 * re-renders rather than reading a moving `Date.now()` mid-paint.
 */
export function hasPassed(iso: string | null | undefined, now: number = Date.now()): boolean {
  const d = toDate(iso);
  return d !== null && d.getTime() <= now;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
