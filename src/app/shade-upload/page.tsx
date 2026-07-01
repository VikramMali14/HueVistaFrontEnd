import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { ShadeUploadForm } from "./shade-upload-form";

export const metadata: Metadata = {
  title: "Upload shades",
  description: "Bulk-upload a paint company's shades from a JSON array.",
};

/**
 * PUBLIC page. Pick a company (or add a new one), upload a JSON array of shades, and
 * they're added to the catalogue. A sample file documents the expected format.
 */
export default function ShadeUploadPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        <ShadeUploadForm />
      </main>
      <Footer />
    </>
  );
}
