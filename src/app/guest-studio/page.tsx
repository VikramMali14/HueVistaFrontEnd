import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { SiteHeader } from "@/components/layout/site-header";
import { Visualizer } from "@/components/atelier/visualizer";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Guest studio",
  description: "Visualise your room as a guest — no account needed.",
};

/**
 * Guest creator. Requires an active guest session (redeemed shop code → hv_guest
 * cookie); otherwise we send them to redeem. The Visualizer runs in `guest` mode:
 * one project, manual regions, shade codes hidden — the shop reads the real codes
 * from the access code.
 */
export default async function StudioPage() {
  const jar = await cookies();
  if (!jar.get(config.guestCookie)?.value) redirect("/unlock");

  // Already narrowed to the companies this guest's code unlocks: getCatalogueOrSample
  // sends the guest token, and the backend resolves the restriction from the code.
  //
  // This used to be done HERE instead, by filtering against a hv_guest_brands cookie —
  // which is to say it was not done at all. The cookie sits in the guest's own browser,
  // so deleting it lifted the restriction; and the filter deliberately fell open
  // ("keep the full set if it would empty") so one renamed company silently returned the
  // whole catalogue. The cookie is still written, but only so the picker can label what
  // the shop chose — it is no longer what decides.
  const shades = await getCatalogueOrSample();

  return (
    <>
      <SiteHeader />
      <main id="main" className="hv-studio-page">
        <Visualizer guest shades={shades} />
      </main>
    </>
  );
}
