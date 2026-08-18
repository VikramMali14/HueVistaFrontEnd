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
   * Whether the paint COMPANY may be printed against an individual shade.
   *
   * False for every customer, guest, painter and share-link viewer, and unlike
   * {@link showNames} that is not a per-shop choice. A shade is identified by its
   * company, its name and its code together, so hiding two of the three while stamping
   * "Asian Paints" on the swatch withholds nothing — one call to that company resolves
   * the colour.
   *
   * This says nothing about the company as a FILTER. Customers still pick which
   * companies they are browsing, because they will be buying from a shop that stocks
   * some and not others, and the picker names them. What goes is the per-shade
   * attribution.
   *
   * Absent means yes — the default for shop staff, and for an older backend that does
   * not send the field, whose viewers are resolved by `showRealCodes` anyway.
   */
  showBrands?: boolean;
  /**
   * Whether this viewer may see the manufacturer's own shade codes.
   *
   * True for shop staff and administrators. False for everyone else — customers,
   * guests, painters, share-link viewers — and for them {@link displayCodeOf} returns
   * the platform-wide HV code instead, which names no company and no shade and can
   * only be read back by a HueVista shop.
   *
   * Absent means FALSE, deliberately. An older backend, a failed fetch and a viewer
   * we could not resolve all land here, and the safe answer to "should this person see
   * the real code" is no: withholding costs a shop one lookup, while leaking hands away
   * the only thing the scheme protects.
   */
  showRealCodes?: boolean;
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

/**
 * The code to PRINT for a shade, for whoever is looking at it.
 *
 * The one rule, in one place, because a colour appears on a dozen surfaces — the
 * studio, the catalogue, the finder, a saved board, a forwarded share link — and the
 * scheme is only worth anything if every one of them agrees. A single screen that
 * prints the manufacturer's code undoes it everywhere.
 *
 * Three answers, in this order:
 *
 * 1. SHOP STAFF AND ADMINS get the manufacturer's own code. They have to open the
 *    right tin, and the codes exist to be read by them rather than hidden from them.
 *
 * 2. ANYONE UNDER A SHOP THAT RUNS ITS OWN PATTERN gets that pattern. A shop which
 *    took the trouble to set up a prefix, pair and suffix has decided how its
 *    customers see a colour, and that decision outranks the platform default for the
 *    customers it issued codes to — they are that shop's customers, holding that
 *    shop's card, and the numbering on it should be the shop's own. This is resolved
 *    per viewer on the server: their own shop for staff, the issuing shop for a
 *    customer or guest, so a code handed over the counter carries that counter's
 *    numbering wherever the customer looks at it.
 *
 * 3. EVERYONE ELSE gets the HV code — global, opaque, and readable at any HueVista
 *    shop rather than only the one that issued the board. That is the right default
 *    for a customer with no shop behind them, and for the customers of a shop that
 *    never set a pattern up, because it means the nearest shop can serve them.
 *
 * The trade between 2 and 3 is deliberate and it is the shop's to make: a pattern
 * keeps the numbering theirs, at the cost of only they can read it; an HV code can be
 * read anywhere, at the cost of not being theirs.
 */
export function displayCodeOf(
  scheme: ShadeCodeScheme | null | undefined,
  shade: { code: string; hvCode?: string | null },
): string {
  if (scheme?.showRealCodes) return shade.code;
  if (hasScheme(scheme)) return encodeShadeCode(scheme, shade.code);
  return shade.hvCode || shade.code;
}

/**
 * Whether the codes this viewer is being shown can be read at ANY HueVista shop.
 *
 * True for HV codes, false for a shop's own pattern — which only the shop that
 * invented it can decode. The distinction has to be said out loud wherever a code
 * leaves the screen and goes somewhere we cannot follow it: a printed colour board, a
 * forwarded share link. Telling a customer to take a shop-pattern code to any shop
 * would send them to a counter that cannot help them.
 */
export function codesAreUniversal(scheme: ShadeCodeScheme | null | undefined): boolean {
  return !scheme?.showRealCodes && !hasScheme(scheme);
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
