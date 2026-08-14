import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { WorkSpiral } from "@/components/work/work-spiral";
import { fetchWorkProjects } from "@/lib/free-projects-server";
import { cardOfWork, WORKS } from "@/lib/work";
import { workCardOf } from "@/lib/work-published";

export const metadata: Metadata = {
  title: "Our work",
  description: "Rooms from the pilot — every shade a real catalogue code. Browse the projects in a 3D spiral.",
};

export default async function WorkPage() {
  // Rooms an admin filed under "Our work" in /admin/free-projects. These are real
  // photographs with real shade codes, so when there are any they ARE the
  // portfolio and the built-in demonstration projects below never render —
  // showing invented rooms beside real ones is worse than showing fewer rooms.
  // Same rule as /gallery, which has worked this way since it went live.
  const published = await fetchWorkProjects();
  const items = published.length > 0 ? published.map(workCardOf) : WORKS.map(cardOfWork);

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
        <WorkSpiral items={items} />
      </main>
    </>
  );
}
