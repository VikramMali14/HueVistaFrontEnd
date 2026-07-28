"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { encodeShadeCode, hasScheme, type ShadeCodeScheme } from "@/lib/shade-codes";

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

export interface ShadeLabels {
  /** True when the shop has a pattern — its codes replace the manufacturer's. */
  patterned: boolean;
  /** False when this shop hides paint names wherever a colour is shown. */
  showNames: boolean;
  /** The code to print for a real shade code. */
  codeOf: (code: string) => string;
  /** The name to print for a shade — its code when names are hidden. */
  nameOf: (shade: { name: string; code: string }) => string;
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
    const patterned = hasScheme(scheme);
    const showNames = scheme?.showNames !== false;
    const codeOf = (code: string) => (patterned ? encodeShadeCode(scheme, code) : code);
    return {
      patterned,
      showNames,
      codeOf,
      nameOf: (shade) => (showNames ? shade.name : codeOf(shade.code)),
    };
  }, [scheme]);
}
