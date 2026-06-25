import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { SiteHeader } from "@/components/layout/site-header";
import { Visualizer } from "@/components/atelier/visualizer";
import { fetchCatalogue } from "@/lib/catalogue";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Guest studio",
  description: "Visualise your room as a guest — no account needed.",
};

/** Reads the JSON brand-array from the guest brands cookie; [] on anything malformed. */
function parseAllowedBrands(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b): b is string => typeof b === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Guest creator. Requires an active guest session (redeemed shop code → hv_guest
 * cookie); otherwise we send them to redeem. The Visualizer runs in `guest` mode:
 * one project, manual regions, shade codes hidden — the shop reads the real codes
 * from the access code.
 */
export default async function StudioPage() {
  const jar = await cookies();
  if (!jar.get(config.guestCookie)?.value) redirect("/redeem");

  let shades: PaintShade[];
  try {
    const live = await fetchCatalogue();
    shades = live.length > 0 ? live : [...SHADES];
  } catch {
    shades = [...SHADES];
  }

  // The shop can restrict which paint companies this guest may browse (chosen at
  // code-issue time, stored in a sibling cookie). Limit the studio's shades to
  // those brands; an empty/absent cookie means no restriction. We keep the full
  // set if the filter would empty it, so a stale brand name never leaves a guest
  // with nothing to paint.
  const allowedBrands = parseAllowedBrands(jar.get(config.guestBrandsCookie)?.value);
  if (allowedBrands.length > 0) {
    const allowed = new Set(allowedBrands);
    const scoped = shades.filter((s) => allowed.has(s.brand));
    if (scoped.length > 0) shades = scoped;
  }

  return (
    <>
      <SiteHeader />
      <main className="hv-studio-page">
        <Visualizer guest shades={shades} />
      </main>
    </>
  );
}
