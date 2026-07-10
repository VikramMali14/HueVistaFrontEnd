/**
 * Shade-code scheme: a shop's ONE pattern for customer-facing shade codes,
 * replacing a custom code per shade.
 *
 * The customer code is derived, never stored:
 *
 *     customer code = PREFIX + code[0..2] + PAIR + code[2..] + SUFFIX
 *
 * e.g. shade L124 with prefix "AB", pair "XY", suffix "CD" → ABL1XY24CD.
 * Guests visualising under the shop see the encoded codes, so the counter can
 * read the real shade straight off the customer's screen or PDF — and the
 * portal's decoder does the reverse without opening any project.
 */

export interface ShadeCodeScheme {
  /** Up to 4 characters placed before the shade code. */
  prefix: string;
  /** Up to 2 characters inserted after the first two characters of the code. */
  infix: string;
  /** Up to 4 characters placed after the shade code. */
  suffix: string;
}

export const SCHEME_LIMITS = { prefix: 4, infix: 2, suffix: 4 } as const;

/** Letters and digits only — the parts get spliced into real codes. */
export const SCHEME_PART_RE = /^[A-Za-z0-9]*$/;

/** How many leading characters of the real code the pair is inserted after. */
export const INFIX_AT = 2;

export function normalizeSchemePart(value: string, max: number): string {
  return value.trim().toUpperCase().slice(0, max);
}

/** True when at least one part is set — an all-empty scheme means "none". */
export function hasScheme(scheme: ShadeCodeScheme | null | undefined): scheme is ShadeCodeScheme {
  return Boolean(scheme && (scheme.prefix || scheme.infix || scheme.suffix));
}

/**
 * Real shade code → customer code. Codes shorter than {@link INFIX_AT} keep
 * the pair after whatever is there — the parts always all appear, so decode
 * stays unambiguous.
 */
export function encodeShadeCode(scheme: ShadeCodeScheme, code: string): string {
  const clean = code.trim();
  if (!clean) return clean;
  const head = clean.slice(0, INFIX_AT);
  const tail = clean.slice(INFIX_AT);
  return `${scheme.prefix}${head}${scheme.infix}${tail}${scheme.suffix}`;
}

/**
 * Customer code → real shade code, or null when the input doesn't follow the
 * scheme (wrong prefix/suffix, or too short to contain the inserted pair).
 * Matching is case-insensitive; the returned code is uppercased.
 */
export function decodeShadeCode(scheme: ShadeCodeScheme, customerCode: string): string | null {
  let value = customerCode.trim().toUpperCase();
  if (!value) return null;

  const prefix = scheme.prefix.toUpperCase();
  const suffix = scheme.suffix.toUpperCase();
  const infix = scheme.infix.toUpperCase();

  if (prefix) {
    if (!value.startsWith(prefix)) return null;
    value = value.slice(prefix.length);
  }
  if (suffix) {
    if (!value.endsWith(suffix) || value.length < suffix.length) return null;
    value = value.slice(0, value.length - suffix.length);
  }
  if (infix) {
    // The pair sits after the first INFIX_AT chars of the real code — or after
    // the whole code when the code itself is shorter than INFIX_AT.
    const at = Math.min(INFIX_AT, Math.max(0, value.length - infix.length));
    if (value.slice(at, at + infix.length) !== infix) return null;
    value = value.slice(0, at) + value.slice(at + infix.length);
  }
  return value || null;
}
