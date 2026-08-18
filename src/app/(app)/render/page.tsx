import type { Metadata } from "next";
import { requireAccessToken, requireFeature } from "@/lib/auth";
import { RenderProjectPicker } from "@/components/atelier/render-project-picker";
import { RenderStudio } from "@/components/atelier/render-studio";

export const metadata: Metadata = {
  title: "Your AI image",
  description:
    "Pick a room you have finished and one of its colour-board combinations, and see it "
    + "for real.",
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

  // No room named is a question this page can answer rather than one it should ask. It
  // used to be a dead end — "Which room?" and a link back to the dashboard — which sent
  // somebody who wanted another picture of a finished job away to go and find it.
  const { project } = await searchParams;
  if (!project) {
    return <RenderProjectPicker />;
  }

  return <RenderStudio projectId={project} />;
}
