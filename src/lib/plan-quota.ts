/**
 * How a plan's project quota is read and shown.
 *
 * The same three questions get asked on five screens — is this plan unlimited, how big
 * is its allowance, and how much of it is left — and each screen used to answer them
 * itself. That drifted in two ways worth naming, because both were visible to a shop:
 *
 *  - The unlimited threshold was written out five times at two different values
 *    (`2147483647` and `2_000_000_000`), so a limit between them read as "unlimited" on
 *    some screens and as a raw ten-digit number on others. An admin can set any limit
 *    they like, so that range is reachable.
 *  - The dashboard banner summed the allowance without subtracting `reservedProjects`
 *    — projects already spoken for by access codes customers have not redeemed yet — so
 *    it promised capacity the portal (correctly) would not assign and creation would
 *    refuse.
 *
 * The backend is the authority on all of it: `Subscription#projectsRemaining` already
 * does this arithmetic, clamps unlimited, and ships as `projectsRemaining`. These
 * helpers exist so every screen asks it the same way, and so the fallbacks agree when
 * an older payload arrives without a field.
 */

import type { SubscriptionSummary } from "./types";

/**
 * At or above this, a limit means "unlimited" rather than a number worth showing.
 *
 * The backend stores `Integer.MAX_VALUE` for an unlimited tier. The floor sits below it
 * rather than testing equality because an admin-set limit near the ceiling is still
 * effectively unlimited, and rendering "2,000,000,000 projects" helps nobody.
 */
export const UNLIMITED_FLOOR = 2_000_000_000;

export function isUnlimited(limit: number | null | undefined): boolean {
  return limit != null && limit >= UNLIMITED_FLOOR;
}

/** "unlimited", or the number grouped for an Indian reader. */
export function formatLimit(limit: number | null | undefined): string {
  if (limit == null) return "—";
  return isUnlimited(limit) ? "unlimited" : limit.toLocaleString("en-IN");
}

/** "∞" for the compact places — a pill or a banner — where the word is too long. */
export function formatLimitSymbol(limit: number | null | undefined): string {
  if (limit == null) return "—";
  return isUnlimited(limit) ? "∞" : String(limit);
}

/**
 * Everything spendable this cycle: the plan's own allowance plus extras bought outright
 * and any leftover carried in from a plan this one replaced.
 *
 * This is the DENOMINATOR — what the shop has, before anything is taken out of it. It
 * is not what is left; see {@link projectsAvailable}.
 */
export function projectAllowance(sub: SubscriptionSummary): number {
  if (isUnlimited(sub.projectsLimit)) return sub.projectsLimit;
  return (
    sub.projectsLimit +
    (sub.purchasedProjectCredits ?? 0) +
    (sub.carriedProjectCredits ?? 0)
  );
}

/**
 * Projects the shop can still start right now.
 *
 * Prefers the backend's own figure, which is the number the quota gate actually
 * enforces. The local fallback is only for a payload that predates the field, and it
 * subtracts `reservedProjects` for the same reason the backend does: a hold behind an
 * unredeemed access code is already paid for and already spoken for, so counting it as
 * available promises capacity that creation will refuse.
 */
export function projectsAvailable(sub: SubscriptionSummary): number {
  if (isUnlimited(sub.projectsLimit)) return Number.POSITIVE_INFINITY;
  if (typeof sub.projectsRemaining === "number") return sub.projectsRemaining;
  return Math.max(
    0,
    projectAllowance(sub) - sub.projectsUsed - (sub.reservedProjects ?? 0),
  );
}
