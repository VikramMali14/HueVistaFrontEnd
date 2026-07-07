import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { ProductManager } from "@/components/app/product-manager";
import { ColorFinder } from "@/components/catalogue/color-finder";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Products",
  description: "Build your paint product catalogue.",
};

export default async function ProductsPage() {
  // Retailer/admin only.
  await requireRole(["RETAILER", "ADMIN"]);
  // Shades feed the embedded colour finder; falls back to the bundled sample.
  const shades = await getCatalogueOrSample();
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Catalogue · Products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Your paint products
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
          Pick a company, choose interior or exterior, tick the lines you stock, and fill in each
          product&apos;s photo, price, coverage, finish and quality. Add a brand or line if it&apos;s not listed.
        </Lead>
      </header>
      <ProductManager />

      <section style={{ marginTop: 96, paddingTop: 64, borderTop: "1px solid var(--rule)" }}>
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Tool · Colour finder</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(32px, 4vw, 56px)", marginTop: 12 }}>
            Match a customer&apos;s photo
          </h2>
          <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
            Upload their photograph, click a colour in it, and quote the nearest catalogue shade —
            code intact — without leaving your products.
          </Lead>
        </header>
        <ColorFinder shades={shades} />
      </section>
    </div>
  );
}
