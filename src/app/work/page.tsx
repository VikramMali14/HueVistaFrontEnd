import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { WorkSpiral } from "@/components/work/work-spiral";

export const metadata: Metadata = {
  title: "Our work",
  description: "Rooms painted with HueVista — browse the projects in a 3D spiral. Real photographs, only the wall has changed.",
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
