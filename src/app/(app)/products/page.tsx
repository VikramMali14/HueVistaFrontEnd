import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { ProductManager } from "@/components/app/product-manager";

export const metadata: Metadata = {
  title: "Products",
  description: "Build your paint product catalogue.",
};

export default async function ProductsPage() {
  // Retailer/admin only.
  await requireRole(["RETAILER", "ADMIN"]);
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Catalogue · Products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Your paint <i>products.</i>
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
          Pick a company, choose interior or exterior, tick the lines you stock, and fill in each
          product&apos;s photo, price, coverage, finish and quality. Add a brand or line if it&apos;s not listed.
        </Lead>
      </header>
      <ProductManager />
    </div>
  );
}
