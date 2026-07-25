"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { AssignedProducts, ShopProduct } from "@/lib/types";

/**
 * The customer's "what my shop unlocked for me" page: the whole companies they may
 * browse in the studio, plus any individual products the retailer picked out. Read
 * only — the studio and API enforce the real access rules.
 */
export function AssignedProductsView() {
  const [data, setData] = useState<AssignedProducts | null | "error" | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getAssignedProducts()
      .then((d) => !cancelled && setData(d ?? null))
      .catch(() => !cancelled && setData("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === undefined) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your products…</Mono>
      </div>
    );
  }

  if (data === "error" || data === null) {
    return (
      <div>
        <Eyebrow>Your products</Eyebrow>
        <Lead style={{ marginTop: 16, maxWidth: "48ch" }}>
          We couldn&apos;t find products for your account yet. Redeem a code from your shop to unlock
          your colours.
        </Lead>
        <p style={{ marginTop: 20 }}>
          <Link href="/redeem" style={{ color: "var(--accent)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
            Redeem a code →
          </Link>
        </p>
      </div>
    );
  }

  const brands = data.allowedBrands ?? [];
  const products = data.products ?? [];
  const allCompanies = brands.length === 0 && products.length === 0;

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <Eyebrow>Your products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(32px, 4vw, 52px)", marginTop: 10 }}>
          Picked for you{data.shopName ? <> by <i>{data.shopName}</i></> : null}
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "54ch" }}>
          {allCompanies
            ? "Your shop unlocked every company — browse any colour in the studio."
            : "These are the companies and products your shop unlocked for you. You'll see them in the studio when you pick colours."}
        </Lead>
      </header>

      {brands.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <Mono brass>Companies</Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {brands.map((name) => (
              <span
                key={name}
                style={{
                  padding: "8px 14px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 999,
                  font: "500 13px/1 var(--sans)",
                  color: "var(--fg-soft)",
                  background: "var(--surface-soft)",
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section>
          <Mono brass>Products</Mono>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
              marginTop: 14,
            }}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {!allCompanies && brands.length > 0 && products.length === 0 && (
        <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-mute)", marginTop: 8 }}>
          No individual products were singled out — you can browse everything from the companies above.
        </p>
      )}
    </div>
  );
}

function ProductCard({ product: p }: { product: ShopProduct }) {
  return (
    <div style={{ border: "1px solid var(--rule)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.imageUrl}
          alt={p.lineName ?? "Product"}
          style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ height: 140, background: "var(--surface-soft)" }} aria-hidden />
      )}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {p.brandName && <Mono>{p.brandName}</Mono>}
        <span style={{ font: "500 17px/1.2 var(--serif)", color: "var(--fg)" }}>{p.lineName ?? "Product"}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, font: "400 13px/1.3 var(--sans)", color: "var(--fg-mute)" }}>
          {p.finish && <span>{p.finish}</span>}
          {p.packSize && <span>· {p.packSize}</span>}
          {p.coverage && <span>· {p.coverage}</span>}
        </div>
        {p.price != null && (
          <span style={{ font: "500 15px/1 var(--sans)", color: "var(--accent)" }}>
            ₹{p.price}{p.priceUnit ? ` / ${p.priceUnit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
