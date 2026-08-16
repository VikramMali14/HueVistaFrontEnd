"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { ALL, FilterBar, facetOptionsFrom, matchesQuery } from "@/components/ui/filter-bar";
import { api, HttpError } from "@/lib/api";
import type { AssignedProducts, ShopProduct } from "@/lib/types";

/**
 * The customer's "what my shop unlocked for me" page: the whole companies they may
 * browse in the studio, plus any individual products the retailer picked out. Read
 * only — the studio and API enforce the real access rules.
 */
export function AssignedProductsView() {
  // undefined = loading; "none" = the shop singled nothing out; "error" = the fetch failed.
  // The last two used to be one state, and they call for opposite advice — see below.
  const [data, setData] = useState<AssignedProducts | "none" | "error" | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getAssignedProducts()
      .then((d) => !cancelled && setData(d ?? "none"))
      .catch((err) => {
        if (cancelled) return;
        // 404 is the ordinary answer for a customer with no access code behind their
        // entitlement — a shop granted them projects directly, or they claimed guest
        // work. Nothing is wrong and nothing is missing; the whole catalogue is theirs.
        setData(err instanceof HttpError && err.status === 404 ? "none" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [query, setQuery] = useState("");
  const [company, setCompany] = useState(ALL);

  // Hooks run before the early returns below, so derive from a possibly-unloaded
  // `data` rather than reading it after the guards.
  const allProducts = useMemo(
    () => (data && data !== "error" && data !== "none" ? data.products ?? [] : []),
    [data],
  );
  const companyOptions = useMemo(
    () => facetOptionsFrom(allProducts, (p) => p.brandName),
    [allProducts],
  );
  const visibleProducts = useMemo(
    () =>
      allProducts.filter((p) => {
        if (company !== ALL && p.brandName !== company) return false;
        return matchesQuery(query, p.brandName, p.lineName, p.finish);
      }),
    [allProducts, query, company],
  );

  if (data === undefined) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your products…</Mono>
      </div>
    );
  }

  // The backend could not be reached. Telling a customer who demonstrably HAS a shop —
  // this page is only reachable with an entitlement — to go and fetch a code is advice
  // for a problem they do not have, and it hides the one thing that would fix this: a
  // reload. The two states were one, and it always gave the wrong half.
  if (data === "error") {
    return (
      <div>
        <Eyebrow>Your products</Eyebrow>
        <Lead style={{ marginTop: 16, maxWidth: "48ch" }}>
          We couldn&apos;t load your products just now — you&apos;re still signed in. Refresh
          the page to try again.
        </Lead>
      </div>
    );
  }

  if (data === "none") {
    return (
      <div>
        <Eyebrow>Your products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(32px, 4vw, 52px)", marginTop: 10 }}>
          Nothing <i>singled out.</i>
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "50ch" }}>
          Your shop hasn&apos;t picked particular companies or products for you, which means
          nothing is held back — every colour in the catalogue is yours to try in the studio.
        </Lead>
        <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="btn btn-brass" href="/studio">
            Start a room <span className="arr">→</span>
          </Link>
          <Link className="btn btn-ghost" href="/unlock">
            Add a shop code
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
          <div style={{ marginTop: 14 }}>
            <FilterBar
              query={query}
              onQueryChange={setQuery}
              searchPlaceholder="Search product or finish"
              facets={[
                {
                  id: "company",
                  label: "Company",
                  value: company,
                  onChange: setCompany,
                  allLabel: "All companies",
                  options: companyOptions,
                },
              ]}
              shown={visibleProducts.length}
              total={products.length}
              noun="product"
            />
          </div>
          {visibleProducts.length === 0 ? (
            <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
              No product matches these filters.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              {visibleProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
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
