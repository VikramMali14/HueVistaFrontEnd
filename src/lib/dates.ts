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

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
