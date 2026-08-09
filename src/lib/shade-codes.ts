/**
 * Shade-code scheme: a shop's ONE pattern for customer-facing shade codes,
 * replacing a custom code per shade.
 *
 * The customer code is derived, never stored:
 *
 *     customer code = PREFIX + code[0..2] + PAIR + code[2..] + SUFFIX
 *
 * e.g. shade L124 with prefix "AB", pair "XY", suffix "CD" → ABL1XY24CD.
 * EVERYONE under the shop sees the encoded codes — staff, painters, entitled
 * customers and guests alike — because the pattern replaces the manufacturer's
 * numbering rather than masking it for outsiders. The counter reads the real shade
 * straight off the customer's screen or PDF, and the portal's decoder does the
 * reverse without opening any project.
 */

export interface ShadeCodeScheme {
  /** Up to 4 characters placed before the shade code. */
  prefix: string;
  /** Up to 2 characters inserted after the first two characters of the code. */
  infix: string;
  /** Up to 4 characters placed after the shade code. */
  suffix: string;
  /**
   * Whether paint NAMES are shown anywhere under this shop. Independent of the
   * pattern — a shop can hide "Asian Paints Ivory Mist" without running its own
   * codes, and hiding names is usually the point of running them. Absent means
   * yes, which is the default everywhere.
   */
  showNames?: boolean;
  /**
   * Patterns the shop has stopped using, newest first. Present only on the shop's own
   * fetch of its settings — the studio never needs them, because nothing is ever ENCODED
   * with a retired pattern.
   */
  retired?: ReadonlyArray<RetiredShadeCodeScheme>;
  /** When the live pattern was last changed — the moment it came into use. */
  updatedAt?: string | null;
  /** When this shop first set up customer codes. Anchors the oldest pattern's window. */
  firstSetAt?: string | null;
}

/** A pattern the shop no longer issues codes under, but whose codes still exist. */
export interface RetiredShadeCodeScheme {
  prefix: string;
  infix: string;
  suffix: string;
  /** When it went out of use — what dates an old colour board. */
  retiredAt?: string | null;
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

/** What a decode attempt found: the real code, and which pattern read it. */
export interface DecodeResult {
  code: string;
  /** null when the CURRENT pattern read it; otherwise the retired one that did. */
  via: RetiredShadeCodeScheme | null;
}

/**
 * Decode against the live pattern first, then every pattern the shop has retired.
 *
 * A shop's numbering does not live only on our screens — it is printed on colour boards,
 * quoted on estimates and photographed off the counter. Changing the pattern used to make
 * every code already in circulation unreadable, so a customer walking in with last
 * season's card was told their code was invalid by the shop that printed it. Trying the
 * retired patterns too is what keeps those codes honest.
 *
 * Current first, then newest-retired first, so a code that two patterns could both read
 * resolves to the most recent shop meaning rather than the oldest.
 */
export function decodeShadeCodeAnyScheme(
  scheme: ShadeCodeScheme,
  customerCode: string,
): DecodeResult | null {
  const live = decodeShadeCode(scheme, customerCode);
  if (live) return { code: live, via: null };
  for (const past of scheme.retired ?? []) {
    const code = decodeShadeCode({ ...past }, customerCode);
    if (code) return { code, via: past };
  }
  return null;
}

/** One pattern and the stretch of time codes were issued under it. */
export interface SchemePeriod {
  prefix: string;
  infix: string;
  suffix: string;
  /** When it came into use. Null only when the shop's records don't reach back that far. */
  from: string | null;
  /** When it went out of use, or null for the pattern in use now. */
  to: string | null;
  /** True for the one codes are being issued under today. */
  live: boolean;
}

/**
 * Every pattern this shop has ever issued codes under, newest first, each with the
 * window it was live for.
 *
 * The windows are DERIVED rather than stored, and they can be: a pattern runs from the
 * moment the one before it was retired until it is retired itself, so the retirement
 * dates alone chain the whole history together end to end. The oldest window is
 * anchored by `firstSetAt` — when the shop first turned codes on — and the newest has
 * no end because it has not ended.
 *
 * Why a shop needs this and not just "which pattern read your code": a customer walks
 * in with a card, the counter reads its code, and the next question is always how old
 * the quote is. "Read with a pattern you used between March and August" answers that;
 * "read with an older pattern" does not.
 */
export function schemeTimeline(scheme: ShadeCodeScheme | null | undefined): SchemePeriod[] {
  if (!scheme) return [];
  // Oldest first, so each window can take its start from the one before it. The wire
  // order is newest-first, and a missing date sorts oldest — it can only be the first.
  const past = [...(scheme.retired ?? [])].sort((a, b) =>
    (a.retiredAt ?? "").localeCompare(b.retiredAt ?? ""),
  );

  const periods: SchemePeriod[] = [];
  let from = scheme.firstSetAt ?? null;
  for (const p of past) {
    periods.push({
      prefix: p.prefix,
      infix: p.infix,
      suffix: p.suffix,
      from,
      to: p.retiredAt ?? null,
      live: false,
    });
    from = p.retiredAt ?? from;
  }

  if (hasScheme(scheme)) {
    periods.push({
      prefix: scheme.prefix,
      infix: scheme.infix,
      suffix: scheme.suffix,
      // The last retirement is when this one started. Falling back to updatedAt covers
      // the shop that has never changed its pattern, where there is nothing to chain to.
      from: from ?? scheme.updatedAt ?? null,
      to: null,
      live: true,
    });
  }

  return periods.reverse();
}
