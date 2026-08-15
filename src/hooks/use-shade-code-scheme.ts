"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { displayCodeOf, hasScheme, type ShadeCodeScheme } from "@/lib/shade-codes";

/**
 * The shop's way of presenting a colour, for any client component that shows one.
 *
 * The studio fetches this itself (it needs the value inside a much larger piece of
 * state); everything else — the colour finder, the shop's combinations — reads it
 * here so a shop's pattern reaches every screen instead of only the one that
 * happened to ask.
 *
 * The answer is per-account and stable for a session, so the in-flight promise is
 * shared: ten swatch lists mounting at once make one request, not ten.
 *
 * Fails to `null`, which every caller renders as "no pattern, names shown" — the
 * behaviour a signed-out visitor gets, and the only safe reading of a failure to
 * ask.
 */
let inFlight: Promise<ShadeCodeScheme | null> | null = null;
/** Whose answer `inFlight` holds. `null` is a signed-out visitor, which is a real key. */
let cachedFor: string | null = null;
let hasCached = false;

function fetchScheme(): Promise<ShadeCodeScheme | null> {
  if (!inFlight) {
    inFlight = api
      .getMyShadeCodeScheme()
      .then((scheme) => scheme ?? null)
      .catch(() => null);
  }
  return inFlight;
}

/** Reset between tests / after a sign-out, so the next reader asks again. */
export function resetShadeCodeSchemeCache() {
  inFlight = null;
  cachedFor = null;
  hasCached = false;
}

/**
 * Tell the cache whose session is current, clearing it when that changes.
 *
 * The cache lives at module scope and nothing was invalidating it. `resetShadeCodeSchemeCache`
 * existed but had no callers, and signing out is a server action that ends in a soft
 * navigation — the router cache clears, module state does not. So the pattern fetched
 * under one account survived into the next: sign out of shop A, sign in as shop B in the
 * same tab, and B's swatches rendered with A's prefix and A's `showNames`. For a shop
 * that hides paint names to run its own numbering, that surfaced another shop's names on
 * every colour.
 *
 * Called from the app shell, which is the only place that knows the current account.
 */
export function syncShadeCodeSchemeIdentity(userId: string | null) {
  if (hasCached && cachedFor === userId) return;
  hasCached = true;
  cachedFor = userId;
  inFlight = null;
}

export function useShadeCodeScheme(): ShadeCodeScheme | null {
  const [scheme, setScheme] = useState<ShadeCodeScheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScheme().then((s) => {
      if (!cancelled) setScheme(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return scheme;
}

/** What a swatch needs to know about the shade it is printing. */
export type LabelledShade = { code: string; hvCode?: string | null };

export interface ShadeLabels {
  /** True when the code shown is not the manufacturer's own — an HV code, or a pattern. */
  patterned: boolean;
  /** False when this shop hides paint names wherever a colour is shown. */
  showNames: boolean;
  /**
   * The code to print for a shade.
   *
   * Takes the whole shade, not just its code string, because the answer now depends on
   * the shade's own HV code and not only on the shop's pattern. A bare string is still
   * accepted for the callers that genuinely have nothing else — a region carrying only
   * an applied shade code — and falls back to the pattern for them.
   */
  codeOf: (shade: LabelledShade | string) => string;
  /** The name to print for a shade — its code when names are hidden. */
  nameOf: (shade: { name: string; code: string; hvCode?: string | null }) => string;
}

/**
 * How to label a colour on any screen under this shop.
 *
 * One place to ask, so a swatch reads the same in the studio, the finder, the
 * catalogue and a saved board. A signed-out visitor gets the plain catalogue:
 * they are not under any shop, so there is no pattern to apply and nothing to
 * hide.
 */
export function useShadeLabels(): ShadeLabels {
  const scheme = useShadeCodeScheme();
  return useMemo(() => {
    const showNames = scheme?.showNames !== false;
    const codeOf = (shade: LabelledShade | string) =>
      displayCodeOf(scheme, typeof shade === "string" ? { code: shade } : shade);
    return {
      // "Not the manufacturer's numbering" is what every caller actually asks this
      // for — it decides whether a code is safe to print raw. A viewer who is shown
      // HV codes is patterned whether or not their shop ever set a pattern up.
      patterned: !scheme?.showRealCodes || hasScheme(scheme),
      showNames,
      codeOf,
      nameOf: (shade) => (showNames ? shade.name : codeOf(shade)),
    };
  }, [scheme]);
}
