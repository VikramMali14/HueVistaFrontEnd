/**
 * Money helpers for the in-store kiosk feature. All backend amounts are paise;
 * all retailer-facing inputs are rupees.
 *
 * Reward points share the paise unit deliberately — one point is one rupee of spending
 * power inside HueVista — so the same formatter reads them.
 */

/** "₹79" / "₹79.50" from paise. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees.toLocaleString("en-IN") : rupees.toFixed(2)}`;
}

/** "39 points" from paise of point value — 1 point = ₹1 = 100 paise. */
export function formatPoints(paise: number): string {
  const points = Math.round(paise / 100);
  return `${points.toLocaleString("en-IN")} point${points === 1 ? "" : "s"}`;
}

/**
 * Parses a retailer-typed rupee amount ("79", "79.5", "₹ 79") to paise.
 * Returns null for anything that isn't a positive amount with at most 2 decimals.
 */
export function parseRupeesToPaise(value: string): number | null {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(parseFloat(cleaned) * 100);
  return paise > 0 ? paise : null;
}
