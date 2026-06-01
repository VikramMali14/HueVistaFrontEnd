import type { Metadata } from "next";
import { MobileUpload } from "./mobile-upload";

export const metadata: Metadata = {
  title: "Send a photo · HueVista",
  description: "Upload a photo from your phone to the colour finder.",
  robots: { index: false, follow: false },
};

export default async function MobileHandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MobileUpload sessionId={id} />;
}
