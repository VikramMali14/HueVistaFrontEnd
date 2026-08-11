import type { Metadata } from "next";
import Link from "next/link";
import { requireAccessToken, requireFeature } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { RenderStudio } from "@/components/atelier/render-studio";

export const metadata: Metadata = {
  title: "Your AI image",
  description: "Pick one of your colour-board combinations and see the room for real.",
};

export default async function RenderPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  // Same gate as the studio: this is the last step of a studio project, so a shop whose
  // distributor did not sell it the studio has no business here either.
  await requireAccessToken();
  await requireFeature("STUDIO");

  const { project } = await searchParams;
  if (!project) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "96px var(--gutter)", textAlign: "center" }}>
        <Eyebrow>Your AI image</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(30px, 4vw, 48px)", margin: "16px 0 14px" }}>
          Which room?
        </h1>
        <Lead style={{ maxWidth: "44ch", margin: "0 auto 28px" }}>
          An AI image is made from one finished project&apos;s colour boards. Open the room
          you closed and we&apos;ll take it from there.
        </Lead>
        <Link className="btn btn-brass" href="/dashboard">
          Back to my rooms <span className="arr">→</span>
        </Link>
      </div>
    );
  }

  return <RenderStudio projectId={project} />;
}
