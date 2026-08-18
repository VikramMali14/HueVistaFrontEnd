"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { ALL, FilterBar, facetOptionsFrom, matchesQuery } from "@/components/ui/filter-bar";
import { api, HttpError } from "@/lib/api";
import type { AssignedProducts, AssignedShop, ShopProduct } from "@/lib/types";

/**
 * The customer's "what my shops unlocked for me" page.
 *
 * <b>Shops, plural, and that is the change.</b> This used to show one: a shop name, its
 * companies, its products. The shape assumed a customer belongs to a shop, which is
 * wrong in the ordinary case rather than at some edge — nothing stops somebody redeeming
 * a code from the shop near work and another from the shop near home, and both were
 * separately paid for. With one slot to put them in, the second redemption looked like
 * it had REPLACED the first: same page, a different name at the top, the first shop's
 * paint gone.
 *
 * <b>One section per shop, each collapsible.</b> A customer with three shops has three
 * headings and can fold away the two they are not standing in. Expanded by default when
 * there is only one — collapsing the only thing on the page would be a control whose
 * whole effect is to empty it — and after that the first is open and the rest are shut,
 * so the page opens on the shop whose code was redeemed most recently rather than on a
 * wall of everything.
 *
 * Read only. The studio and the API enforce the real access rules; this just says what
 * they are.
 */
export function AssignedProductsView() {
  // undefined = loading; "none" = nothing singled out; "error" = the fetch failed.
  // The last two call for opposite advice — see below.
  const [data, setData] = useState<AssignedProducts | "none" | "error" | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getAssignedProducts()
      .then((d) => !cancelled && setData(d && d.shops?.length ? d : "none"))
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

  const shops = data && data !== "error" && data !== "none" ? data.shops : [];

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
          No shop has picked particular companies or products for you, which means nothing
          is held back — every colour in the catalogue is yours to try in the studio.
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

  const many = shops.length > 1;

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <Eyebrow>Your products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(32px, 4vw, 52px)", marginTop: 10 }}>
          {many ? (
            <>Picked for you by <i>{shops.length} shops</i></>
          ) : (
            <>Picked for you by <i>{shops[0]!.shopName}</i></>
          )}
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "56ch" }}>
          {many
            ? "Each shop you've redeemed a code from unlocks its own paint, and you keep all of "
              + "them. Fold a shop away to concentrate on the one you're buying from."
            : "These are the companies and products your shop unlocked for you. You'll see them "
              + "in the studio when you pick colours."}
        </Lead>
        {many && (
          <Mono style={{ display: "block", marginTop: 14, color: "var(--fg-mute)" }}>
            Redeeming another shop&rsquo;s code adds to this — it never replaces what you have
          </Mono>
        )}
      </header>

      {shops.map((shop, i) => (
        <ShopSection
          key={shop.shopId}
          shop={shop}
          collapsible={many}
          // The most recent redemption leads and starts open; the rest are folded. A
          // page that opens on every shop's whole catalogue at once is the thing the
          // folding exists to avoid.
          initiallyOpen={!many || i === 0}
        />
      ))}
    </div>
  );
}

/** One shop: its companies, its products, and a heading that folds the lot away. */
function ShopSection({
  shop,
  collapsible,
  initiallyOpen,
}: {
  shop: AssignedShop;
  collapsible: boolean;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState(ALL);

  const brands = useMemo(() => shop.allowedBrands ?? [], [shop.allowedBrands]);
  const products = useMemo(() => shop.products ?? [], [shop.products]);
  const companyOptions = useMemo(
    () => facetOptionsFrom(products, (p) => p.brandName),
    [products],
  );
  const visibleProducts = useMemo(
    () =>
      products.filter((p) => {
        if (company !== ALL && p.brandName !== company) return false;
        return matchesQuery(query, p.brandName, p.lineName, p.finish);
      }),
    [products, query, company],
  );

  // This shop singled nothing out at all — every company is browsable through it.
  const allCompanies = brands.length === 0 && products.length === 0;
  const bodyId = `hv-shop-${shop.shopId}`;

  return (
    <section style={{ marginBottom: 32, borderTop: "1px solid var(--rule)", paddingTop: 20 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={bodyId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              font: "500 22px/1.2 var(--serif)",
              color: "var(--fg)",
              textAlign: "left",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                transition: "transform .15s ease",
                transform: open ? "rotate(90deg)" : "none",
                color: "var(--fg-mute)",
                fontSize: 14,
              }}
            >
              ▶
            </span>
            {shop.shopName}
          </button>
        ) : (
          <h2 style={{ font: "500 22px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>
            {shop.shopName}
          </h2>
        )}
        <Mono style={{ color: "var(--fg-mute)", whiteSpace: "nowrap" }}>
          {allCompanies
            ? "every company"
            : [
                brands.length > 0 ? `${brands.length} ${brands.length === 1 ? "company" : "companies"}` : null,
                products.length > 0 ? `${products.length} ${products.length === 1 ? "product" : "products"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </Mono>
      </header>

      {open && (
        <div id={bodyId} style={{ marginTop: 18 }}>
          {allCompanies && (
            <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-mute)", margin: 0 }}>
              This shop unlocked every company — browse any colour in the studio.
            </p>
          )}

          {brands.length > 0 && (
            <div style={{ marginBottom: products.length > 0 ? 30 : 0 }}>
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
            </div>
          )}

          {products.length > 0 && (
            <div>
              <Mono brass>Products</Mono>
              <div style={{ marginTop: 14 }}>
                <FilterBar
                  query={query}
                  onQueryChange={setQuery}
                  searchPlaceholder="Search product or finish"
                  facets={[
                    {
                      id: `company-${shop.shopId}`,
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
            </div>
          )}

          {!allCompanies && brands.length > 0 && products.length === 0 && (
            <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-mute)", marginTop: 8 }}>
              No individual products were singled out — you can browse everything from the
              companies above.
            </p>
          )}
        </div>
      )}
    </section>
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
