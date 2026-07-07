/**
 * Money helpers for the in-store kiosk feature. All backend amounts are paise;
 * all retailer-facing inputs are rupees.
 */

/** The platform base kept from every kiosk payment — also the price floor. */
export const STORE_MIN_PRICE_PAISE = 5000;

/** Smallest wallet payout a retailer may request. */
export const MIN_REDEMPTION_PAISE = 5000;

/** "₹79" / "₹79.50" from paise. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees.toLocaleString("en-IN") : rupees.toFixed(2)}`;
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

/** Error message (or null) for a kiosk price the retailer wants to charge. */
export function validateStorePrice(value: string): string | null {
  const paise = parseRupeesToPaise(value);
  if (paise === null) return "Enter a price in rupees, e.g. 79.";
  if (paise < STORE_MIN_PRICE_PAISE) {
    return `The minimum price is ${formatRupees(STORE_MIN_PRICE_PAISE)} per image.`;
  }
  return null;
}
