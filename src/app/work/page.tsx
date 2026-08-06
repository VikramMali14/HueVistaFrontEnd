import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { showcaseContentEnabled } from "@/lib/showcase";
import { SiteHeader } from "@/components/layout/site-header";
import { WorkSpiral } from "@/components/work/work-spiral";

export const metadata: Metadata = {
  title: "Our work",
  description: "Rooms from the pilot — every shade a real catalogue code. Browse the projects in a 3D spiral.",
};

export default function WorkPage() {
  // Invented projects, no real imagery — see lib/showcase.
  // Backstop behind the middleware gate, not the primary one.
  if (!showcaseContentEnabled()) notFound();
  return (
    <>
      <SiteHeader />
      {/* Immersive full-viewport piece — no footer, no page gutters. */}
      <main id="main" className="hv-work-main">
        <WorkSpiral />
      </main>
    </>
  );
}
