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
      <main id="main" className="hv-work-main">
        {/* The spiral carries the page's meaning visually and has no headline of
            its own, which left the document with no h1 at all — a screen reader
            landed here with nothing naming the page. Visually hidden so the piece
            is untouched. */}
        <h1 className="sr-only">Our work</h1>
        <WorkSpiral />
      </main>
    </>
  );
}
