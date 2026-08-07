import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { getCatalogueOrSample } from "@/lib/catalogue";
import { ColorFinder } from "@/components/catalogue/color-finder";
import { requireFeatureOrLock, requireRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Colour finder",
  description: "Upload a photograph and pull the nearest paint shade codes from any colour in it.",
};

export default async function ColorFinderPage() {
  // A counter tool. A customer has no counter to use it at and a distributor doesn't
  // sell paint over one — the nav offers it to neither, and this agrees with the nav.
  await requireRole(["RETAILER", "ADMIN"]);

  // Two ways this page can be closed, and they want opposite treatment.
  //
  // The shop's DISTRIBUTOR not granting it is somebody else's decision; nothing here
  // can lift it, so that stays a bounce (inside requireFeatureOrLock).
  //
  // The shop's own PLAN not including it is the shop's decision to reverse — and the
  // page used to vanish for exactly the shops who had never seen what they were
  // missing. A free counter was told "not included" on a dashboard and left to
  // imagine the rest. So the page opens: real heading, real tool, real explanation of
  // what it does, and the subscription case made at the moment they reach for it.
  // The backend still refuses the matching endpoints, which is what makes showing the
  // shell safe rather than a hole.
  const { planLocked } = await requireFeatureOrLock("COLOR_FINDER");

  // Live catalogue from the backend; falls back to the bundled sample if unreachable.
  const shades = await getCatalogueOrSample();
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Tool · Colour finder</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          From the photo. <i>To the can.</i>
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
          Upload any photograph, click a colour in it, and we match it to the nearest catalogue
          shade — code intact. Or take the palette we pull from the image automatically.
        </Lead>
      </header>
      <ColorFinder shades={shades} locked={planLocked} />
      <p className="finder-foot" style={{ marginTop: 20, font: "400 16px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
        {planLocked ? (
          <>
            Matching a colour you already have a code for is on every plan.{" "}
            <Link href="/catalogue" style={{ color: "var(--accent)" }}>
              Look a code up in the catalogue →
            </Link>
          </>
        ) : (
          <>
            Know the hex already?{" "}
            <Link href="/catalogue" style={{ color: "var(--accent)" }}>
              Match a colour by code on the catalogue →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
