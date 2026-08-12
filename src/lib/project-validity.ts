import { formatDate } from "./dates";

/**
 * How long a bought project stays open, and how to say so.
 *
 * The window is server configuration (`app.project-credit.valid-days`), served on every
 * `ProjectPurchaseOptions` as `validDays` — so a screen that has those options should
 * quote them rather than a constant. {@link PROJECT_VALID_DAYS} is the fallback for the
 * moment before they arrive, and for the screens that never fetch them; it tracks the
 * server default, which is what every account is on.
 *
 * This lives in one place because the same sentence is owed in several: the studio, at
 * the moment the purchase is offered; the plan page, saying where a project is bought;
 * and the shop portal, where a bought project is assigned to a customer.
 */
export const PROJECT_VALID_DAYS = 30;

/** "30 Aug 2026" — a date the buyer can hold against a calendar, in the app's one
 *  date format so it lines up with the expiry dates on every other screen. */
export function formatValidUntil(date: Date): string {
  return formatDate(date.toISOString());
}

/**
 * The promise made at the moment of purchase: how long, and until when.
 *
 * Both halves matter. "30 days" alone leaves the buyer counting; a bare date leaves them
 * working out whether it is generous. Pass `from` when the caller already holds a
 * mount-time clock, so a render that quotes this stays pure.
 */
export function validityNote(validDays: number = PROJECT_VALID_DAYS, from: number = Date.now()): string {
  const until = new Date(from + validDays * 86_400_000);
  return `Valid ${validDays} days from purchase — open until ${formatValidUntil(until)}.`;
}
