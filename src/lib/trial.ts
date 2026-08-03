/**
 * How long a new shop's free trial runs.
 *
 * Mirrors `AuthService.TRIAL_DAYS` on the backend, which is what actually decides
 * the window. It lives here because the site used to state two different answers —
 * the homepage stat row said "14 days" and the pricing lede said "fourteen unbilled
 * days", while the trial page, the pricing tiers, the FAQ, the refunds policy and
 * the backend all said seven. Anything user-facing that names the trial length
 * should read this rather than spell out a number.
 */
export const TRIAL_DAYS = 7;

/**
 * The same number spelled out, for display headings that set it in words.
 *
 * The pricing page's closing heading read "Fourteen days." long after the rest of the
 * page had been corrected to seven — a numeral-driven fix missed it because the word
 * form was hardcoded. Kept beside the number so the two cannot drift again.
 */
export const TRIAL_DAYS_WORD = "Seven";
