import type { Metadata } from "next";
import { requireAccessToken, requireFeature } from "@/lib/auth";
import { AiImages } from "@/components/app/ai-images";

export const metadata: Metadata = {
  title: "My AI images",
  description:
    "Every photorealistic image you have made from your colour boards — download any of "
    + "them on their own, or as a one-page PDF with the shades printed underneath.",
};

/**
 * The account's AI images, gathered from every room it owns.
 *
 * Same gate as the studio and the render page it sits beside: these images are made by a
 * studio project, so a shop whose distributor did not sell it the studio has no images
 * here and no business on the page. The backend applies the identical rule to
 * `GET /api/me/renders`, so a hidden tab and a blocked endpoint can never disagree.
 */
export default async function AiImagesPage() {
  await requireAccessToken();
  await requireFeature("STUDIO");

  return <AiImages />;
}
