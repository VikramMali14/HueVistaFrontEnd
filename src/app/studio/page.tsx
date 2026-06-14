import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { SiteHeader } from "@/components/layout/site-header";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
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
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "32px var(--gutter) 96px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "12px 16px",
            marginBottom: 28,
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            borderRadius: 8,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Mono brass>Guest session</Mono>
            <span style={{ font: "300 15px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
              Your room stays with the shop — sign in to keep it for yourself.
            </span>
          </span>
          <Link href="/sign-in?next=/studio" style={{ color: "var(--accent)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
            Sign in to save →
          </Link>
        </div>

        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Guest studio</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)" }}>Your room, your colours.</h1>
          <Lead style={{ marginTop: 16 }}>
            Upload a photo, outline a wall, and try shades on it. When you&apos;re happy, show your code at the
            counter — the shop reads the exact paints from it.
          </Lead>
        </header>

        <Visualizer guest shades={shades} />
      </main>
    </>
  );
}
