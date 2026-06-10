import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { WorkSpiral } from "@/components/work/work-spiral";

export const metadata: Metadata = {
  title: "Our work",
  description: "Rooms from the pilot — every shade a real catalogue code. Browse the projects in a 3D spiral.",
};

export default function WorkPage() {
  return (
    <>
      <SiteHeader />
      {/* Immersive full-viewport piece — no footer, no page gutters. */}
      <main className="hv-work-main">
        <WorkSpiral />
      </main>
    </>
  );
}
