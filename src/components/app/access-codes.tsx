"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ALL, FilterBar, facetOptionsFrom, matchesQuery } from "@/components/ui/filter-bar";
import { useCopied } from "@/hooks/use-copied";
import { AssignableProjects } from "@/components/app/assignable-projects";
import { api, HttpError } from "@/lib/api";
import { site } from "@/lib/config";
import { PAINT_BRANDS, type AccessCode, type OrgResponse, type ProjectDetail, type ShopProduct } from "@/lib/types";

const FIXED_VALID_DAYS = 10;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "shop";
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}-${suffix}`;
}

/**
 * Retailer-facing: create your shop org (once) and issue customer access codes.
 * When you issue a code you name the customer, choose how many projects they get
 * (charged against your monthly image quota) and which companies / individual
 * products they may see. The customer redeems it at /redeem with no login — that
 * auto-creates their account and signs them in.
 *
 * `org` comes from the portal page's single org fetch (null = resolved, no
 * shop yet); when it's undefined (page fetch failed) the component falls back
 * to fetching the orgs itself.
 */
export function AccessCodes({ org: orgProp }: { org?: OrgResponse | null }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  // Top-ups on a code the customer already holds. Keyed by code id so two rows can
  // never share a spinner, and so the busy state survives the list re-rendering.
  const [toppingUp, setToppingUp] = useState<string | null>(null);

  const [shopName, setShopName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // The next code's assignment.
  const [customerName, setCustomerName] = useState("");
  const [projectQuota, setProjectQuota] = useState(1);
  // Paint companies a shop can unlock — the live list of companies that actually have
  // shades in the catalogue. Falls back to the well-known brands if the endpoint is
  // unreachable. Leaving none selected unlocks every company.
  const [companyOptions, setCompanyOptions] = useState<ReadonlyArray<string>>(PAINT_BRANDS);
  const [companies, setCompanies] = useState<string[]>([]);
  // Individual shop products the retailer can single out (in addition to whole companies).
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [justIssued, setJustIssued] = useState<string | null>(null);
  const { copied, copy: copyText } = useCopied();

  // The customer's rooms per code, fetched on demand ("View rooms"). The full view —
  // real shade codes included — which is the whole point of the code loop. A code can
  // carry several projects (one image charged per assigned project), so this is a list.
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Record<string, ProjectDetail[] | "loading" | "error">>({});

  // Issued-code filters. A busy shop accumulates hundreds of codes, so the
  // history is only usable with a search and status/company facets over it.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [companyFilter, setCompanyFilter] = useState(ALL);

  async function revoke(c: AccessCode) {
    if (!org) return;
    setError(null);
    setRevoking(c.id);
    try {
      const updated = await api.revokeAccessCode(org.id, c.id);
      setCodes((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      setConfirmRevoke(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel that code. Please try again.");
    } finally {
      setRevoking(null);
    }
  }

  /**
   * Add another project to a code the customer is already using — the "one more room"
   * moment at the counter, without making them type a second code. Needs a live plan:
   * each project reserves against the shop's monthly quota, and against the extras it
   * bought once that quota is spent.
   */
  async function addProject(c: AccessCode) {
    if (!org) return;
    setError(null);
    setToppingUp(c.id);
    try {
      const updated = await api.grantAccessCodeProjects(org.id, c.id, 1);
      setCodes((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add a project to that code.");
    } finally {
      setToppingUp(null);
    }
  }

  /**
   * Give a code another 10 days. Resets the window rather than stacking on it, so a
   * code never carries more than the 10 days the customer was promised — however many
   * times it is renewed. Free; only the deadline moves.
   */
  async function addDays(c: AccessCode) {
    if (!org) return;
    setError(null);
    setToppingUp(c.id);
    try {
      const updated = await api.extendAccessCode(org.id, c.id);
      setCodes((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not extend that code.");
    } finally {
      setToppingUp(null);
    }
  }

  const codeStatus = (c: AccessCode) =>
    c.used ? "redeemed" : c.revoked ? "cancelled" : c.expired ? "expired" : "active";

  const codeCompanyOptions = useMemo(
    () => facetOptionsFrom(codes, (c) => c.allowedBrands ?? []),
    [codes],
  );

  const visibleCodes = useMemo(
    () =>
      codes.filter((c) => {
        if (statusFilter !== ALL && codeStatus(c) !== statusFilter) return false;
        const brands = c.allowedBrands ?? [];
        // No restriction on the code means every company is unlocked, so such a
        // code belongs under any company the shop filters by.
        if (companyFilter !== ALL && brands.length > 0 && !brands.includes(companyFilter)) return false;
        return matchesQuery(query, c.code, c.customerName, brands.join(" "));
      }),
    [codes, query, statusFilter, companyFilter],
  );

  const viewRoom = useCallback((codeId: string) => {
    setOpenRoom((cur) => (cur === codeId ? null : codeId));
    setRooms((prev) => {
      if (prev[codeId] !== undefined && prev[codeId] !== "error") return prev;
      api
        .listProjectsForCode(codeId)
        .then((d) => setRooms((p) => ({ ...p, [codeId]: d ?? [] })))
        .catch(() => setRooms((p) => ({ ...p, [codeId]: "error" })));
      return { ...prev, [codeId]: "loading" };
    });
  }, []);

  const loadCodes = useCallback(async (orgId: string) => {
    try {
      setCodes(await api.listAccessCodes(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load codes.");
    }
  }, []);

  /**
   * Deep link from the dashboard: a customer's room there links here with the code it
   * was created under, so landing on the portal opens that code's rooms and scrolls to
   * them rather than dropping the shop at the top of a long list to hunt for it.
   *
   * Read from `window.location` rather than useSearchParams so the component needs no
   * Suspense boundary around it — it is already client-only, and this runs once after
   * the codes have arrived.
   */
  useEffect(() => {
    if (codes.length === 0 || openRoom !== null) return;
    const wanted = new URLSearchParams(window.location.search).get("code");
    if (!wanted || !codes.some((c) => c.id === wanted)) return;
    viewRoom(wanted);
    document.getElementById("active-codes")?.scrollIntoView({ block: "start" });
    // Runs on the first load of the code list only: openRoom in the guard makes a
    // second pass a no-op, and the shop closing the row must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  useEffect(() => {
    api
      .listShadeBrands()
      .then((brands) => {
        const names = brands.map((b) => b.name).filter(Boolean);
        if (names.length > 0) setCompanyOptions(names);
      })
      .catch(() => {}); // keep the static fallback
  }, []);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const retailer =
          orgProp !== undefined
            ? orgProp
            : ((await api.listMyOrgs()).find((o) => o.type === "RETAILER") ?? null);
        setOrg(retailer);
        if (retailer) {
          await loadCodes(retailer.id);
          api.listShopProducts(retailer.id).then(setProducts).catch(() => {});
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) {
          window.location.href = "/sign-in?next=/portal";
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load your shop.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCodes, orgProp]);

  const createShop = useCallback(async () => {
    if (!shopName.trim()) return;
    setCreatingOrg(true);
    setError(null);
    try {
      const created = await api.createOrganization({
        name: shopName.trim(),
        slug: slugify(shopName),
        type: "RETAILER",
      });
      setOrg(created);
      await loadCodes(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your shop.");
    } finally {
      setCreatingOrg(false);
    }
  }, [shopName, loadCodes]);

  const issue = useCallback(async () => {
    if (!org) return;
    if (!customerName.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    setIssuing(true);
    setError(null);
    try {
      const code = await api.createAccessCode(org.id, {
        customerName: customerName.trim(),
        projectQuota,
        // Omit when none are picked so the backend treats it as "all companies".
        allowedBrands: companies.length > 0 ? companies : undefined,
        allowedProductIds: productIds.length > 0 ? productIds : undefined,
      });
      setCodes((prev) => [code, ...prev]);
      setJustIssued(code.code);
      // Reset the per-customer fields for the next code; keep company/product picks
      // since a shop often issues several similar codes in a row.
      setCustomerName("");
      setProjectQuota(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue a code.");
    } finally {
      setIssuing(false);
    }
  }, [org, customerName, projectQuota, companies, productIds]);

  const toggleCompany = useCallback((name: string) => {
    setCompanies((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }, []);

  const toggleProduct = useCallback((id: string) => {
    setProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);

  const copy = useCallback((code: string) => copyText(code), [copyText]);

  // WhatsApp-ready message so the retailer never types the URL and instructions by hand.
  const copyMessage = useCallback((code: string) => {
    const message = `Your HueVista code: ${code}. Open ${window.location.origin}/redeem and enter it — no sign-up needed. Valid ${FIXED_VALID_DAYS} days.`;
    copyText("whatsapp-message", message);
  }, [copyText]);

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your shop…</Mono>
      </div>
    );
  }

  // No retailer org yet → one-time setup.
  if (!org) {
    return (
      <div style={{ border: "1px solid var(--rule)", padding: 24, maxWidth: 520 }}>
        <Mono brass>Set up your shop</Mono>
        <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "10px 0 18px" }}>
          Name your shop once. Then you can issue access codes for your customers.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Mehta Paint House"
            aria-label="Shop name"
            style={{ flex: 1, minWidth: 200, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 16px/1 var(--sans)" }}
          />
          <Button onClick={() => void createShop()} disabled={creatingOrg || !shopName.trim()}>
            {creatingOrg ? <><Spinner size={14} color="currentColor" /> Creating…</> : <>Create shop <span className="arr">→</span></>}
          </Button>
        </div>
        {error && <div className="field-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid var(--rule-strong)",
    background: "var(--surface)",
    color: "var(--fg)",
    font: "400 15px/1 var(--sans)",
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24, border: "1px solid var(--rule)", padding: 20, borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Mono brass>{org.name}</Mono>
          <span style={{ font: "400 12px/1 var(--mono)", letterSpacing: ".16em", color: "var(--fg-mute)" }}>
            NEW CODE · VALID {FIXED_VALID_DAYS} DAYS
          </span>
          {/* What there is to give away, counted where the giving happens. Extras the shop
              bought are part of it — assigning draws on the same pool painting does. */}
          <AssignableProjects />
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Mono>Customer name</Mono>
            <input
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setError(null); }}
              placeholder="e.g. Priya Sharma"
              aria-label="Customer name"
              style={{ ...inputStyle, minWidth: 220 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Mono>Projects</Mono>
            <input
              type="number"
              min={1}
              max={20}
              value={projectQuota}
              onChange={(e) => setProjectQuota(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              aria-label="Number of projects"
              style={{ ...inputStyle, width: 90 }}
            />
          </label>
          <Button onClick={() => void issue()} disabled={issuing || !customerName.trim()}>
            {issuing ? <><Spinner size={14} color="currentColor" /> Issuing…</> : <>Issue code <span className="arr">→</span></>}
          </Button>
          <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)", maxWidth: "34ch" }}>
            {projectQuota} project{projectQuota === 1 ? "" : "s"} will be taken from this
            month&rsquo;s allowance, or from the extra projects you&rsquo;ve bought once it runs out.
          </span>
        </div>

        {/* Which paint companies this customer may browse. None selected = all companies. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Mono>Companies</Mono>
          {companyOptions.map((name) => {
            const on = companies.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleCompany(name)}
                aria-pressed={on}
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: on ? "var(--surface-soft)" : "transparent",
                  border: "1px solid " + (on ? "var(--accent)" : "var(--rule)"),
                  color: on ? "var(--accent)" : "var(--fg-mute)",
                  font: "500 12px/1 var(--sans)",
                  borderRadius: 999,
                }}
              >
                {on ? "✓ " : ""}{name}
              </button>
            );
          })}
          <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
            {companies.length === 0 && productIds.length === 0 ? "All companies" : `${companies.length} compan${companies.length === 1 ? "y" : "ies"}`}
          </span>
        </div>

        {/* Individual products — pick specific listings on top of whole companies. */}
        {products.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Mono>Products</Mono>
            {products.map((p) => {
              const on = productIds.includes(p.id);
              const label = [p.brandName, p.lineName].filter(Boolean).join(" · ") || "Product";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  aria-pressed={on}
                  style={{
                    padding: "6px 12px",
                    cursor: "pointer",
                    background: on ? "var(--surface-soft)" : "transparent",
                    border: "1px solid " + (on ? "var(--accent)" : "var(--rule)"),
                    color: on ? "var(--accent)" : "var(--fg-mute)",
                    font: "500 12px/1 var(--sans)",
                    borderRadius: 999,
                  }}
                >
                  {on ? "✓ " : ""}{label}
                </button>
              );
            })}
            {productIds.length > 0 && (
              <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                {productIds.length} selected
              </span>
            )}
          </div>
        )}
      </div>

      {justIssued && (
        <div style={{ border: "1px solid var(--accent)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Mono brass>New code</Mono>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", fontSize: 18, color: "var(--accent)" }}>{justIssued}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(justIssued)}>
            {copied === justIssued ? "Copied" : "Copy"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyMessage(justIssued)}>
            {copied === "whatsapp-message" ? "Message copied" : "Copy message"}
          </button>
          <Mono>Share with your customer — they enter it at {site.redeemLabel}</Mono>
        </div>
      )}

      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {codes.length === 0 ? (
        <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
          No codes yet. Issue one above and share it with a customer.
        </p>
      ) : (
        <>
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Search code or customer"
          facets={[
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              onChange: setStatusFilter,
              allLabel: "Any status",
              options: [
                { value: "active", label: "Active", count: codes.filter((c) => codeStatus(c) === "active").length },
                { value: "redeemed", label: "Redeemed", count: codes.filter((c) => codeStatus(c) === "redeemed").length },
                { value: "expired", label: "Expired", count: codes.filter((c) => codeStatus(c) === "expired").length },
                { value: "cancelled", label: "Cancelled", count: codes.filter((c) => codeStatus(c) === "cancelled").length },
              ],
            },
            {
              id: "company",
              label: "Company",
              value: companyFilter,
              onChange: setCompanyFilter,
              allLabel: "All companies",
              options: codeCompanyOptions,
            },
          ]}
          shown={visibleCodes.length}
          total={codes.length}
          noun="code"
        />
        {visibleCodes.length === 0 ? (
          <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
            No code matches these filters.
          </p>
        ) : (
        <div role="table" aria-label="Access codes" style={{ border: "1px solid var(--rule)" }}>
          <div role="row" className="hv-cust-row hv-cust-head" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.1fr 0.7fr 1fr 0.9fr 0.8fr 1.4fr", padding: "16px 20px", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
            {["Code", "Customer", "Projects", "Expires", "Status", "Rooms", "Actions"].map((h) => <span key={h} role="columnheader"><Mono>{h}</Mono></span>)}
          </div>
          {visibleCodes.map((c, i) => {
            const status = codeStatus(c);
            const statusColor = status === "active" ? "var(--accent)" : "var(--fg-mute-deep)";
            const last = i === visibleCodes.length - 1;
            const room = rooms[c.id];
            const expanded = openRoom === c.id;
            return (
              <div key={c.id}>
                <div role="row" className="hv-cust-row" style={{ display: "grid", gridTemplateColumns: "1.2fr 1.1fr 0.7fr 1fr 0.9fr 0.8fr 1.4fr", padding: "18px 20px", borderBottom: last && !expanded ? "none" : "1px solid var(--rule)", alignItems: "center" }}>
                  <span role="cell" data-label="Code" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--accent)" }}>{c.code}</span>
                    {status === "active" && (
                      <button type="button" onClick={() => copy(c.code)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>
                        {copied === c.code ? "copied" : "copy"}
                      </button>
                    )}
                  </span>
                  <span role="cell" data-label="Customer" style={{ font: "400 15px/1.2 var(--sans)", color: "var(--fg-soft)" }}>{c.customerName || "—"}</span>
                  {/* Used vs assigned — the shop paid an image per assigned project,
                      so the quota has to be seen counting down as rooms are created. */}
                  <span role="cell" className="mono" data-label="Projects">
                    {c.projectsUsed ?? 0} / {c.projectQuota ?? 1}
                  </span>
                  <span role="cell" className="mono" data-label="Expires">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                  <span role="cell" data-label="Status" style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: statusColor }}>{status}</span>
                  <span role="cell" data-label="Rooms">
                    {c.used ? (
                      <button
                        type="button"
                        onClick={() => viewRoom(c.id)}
                        aria-expanded={expanded}
                        style={{ background: "transparent", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--fg-soft)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
                      >
                        {expanded ? "Hide" : "View rooms"}
                      </button>
                    ) : (
                      <span className="mono" style={{ color: "var(--fg-mute-deep)" }}>—</span>
                    )}
                  </span>
                  {/* Two different things live here. Topping up works on a code the
                      customer is ALREADY using — that is the point of it. Cancelling only
                      works before redemption, because pulling a code back afterwards
                      strands someone mid-visit at the counter. */}
                  <span role="cell" data-label="Actions" style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {(c.topUpAllowed ?? !c.revoked) && (
                      <>
                        <button
                          type="button"
                          onClick={() => void addProject(c)}
                          disabled={toppingUp === c.id}
                          title="Add one more project to this code — from this month's allowance, or from an extra you bought"
                          className="hv-code-action"
                        >
                          {toppingUp === c.id ? "…" : "+ Project"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void addDays(c)}
                          disabled={toppingUp === c.id}
                          title="Give this code a fresh 10 days — free, the projects are already paid for"
                          className="hv-code-action"
                        >
                          {toppingUp === c.id ? "…" : "+ 10 days"}
                        </button>
                      </>
                    )}
                    {c.editable ?? (!c.used && !c.revoked) ? (
                      confirmRevoke === c.id ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => revoke(c)}
                            disabled={revoking === c.id}
                            style={{ background: "transparent", border: "1px solid var(--terracotta)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--terracotta)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
                          >
                            {revoking === c.id ? "…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRevoke(null)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRevoke(c.id)}
                          title="Cancel this code and return its project quota"
                          style={{ background: "transparent", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--fg-soft)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
                        >
                          Cancel
                        </button>
                      )
                    ) : null}
                    {/* Nothing at all is possible only for a cancelled code. */}
                    {!(c.topUpAllowed ?? !c.revoked) && !(c.editable ?? (!c.used && !c.revoked)) && (
                      <span className="mono" style={{ color: "var(--fg-mute-deep)" }}>—</span>
                    )}
                  </span>
                </div>
                {expanded && (
                  <div style={{ padding: "16px 20px 20px", background: "var(--surface-soft)", borderBottom: last ? "none" : "1px solid var(--rule)" }}>
                    {room === "loading" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "300 15px/1 var(--serif)", color: "var(--fg-mute)" }}>
                        <Spinner size={14} /> Loading the customer&apos;s rooms…
                      </span>
                    )}
                    {room === "error" && (
                      <p className="field-error" role="alert" style={{ margin: 0 }}>Could not load the customer&apos;s rooms. Try again.</p>
                    )}
                    {Array.isArray(room) && room.length === 0 && (
                      <p style={{ margin: 0, font: "300 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
                        No room yet — the customer hasn&apos;t started a project with this code.
                      </p>
                    )}
                    {Array.isArray(room) && room.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        {room.map((project) => (
                          <div key={project.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                              <span style={{ font: "500 17px/1.2 var(--serif)", color: "var(--fg)" }}>{project.name}</span>
                              {project.sentToShopAt && (
                                <span style={{ font: "500 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "5px 10px" }}>
                                  ✓ Sent by customer
                                </span>
                              )}
                            </div>
                            {project.regions.filter((r) => r.appliedHexCode).length === 0 ? (
                              <p style={{ margin: 0, font: "300 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>No colours applied yet.</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {project.regions.filter((r) => r.appliedHexCode).map((r) => (
                                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <span aria-hidden style={{ width: 26, height: 26, background: r.appliedHexCode!, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
                                    <span style={{ font: "400 15px/1.2 var(--serif)", color: "var(--fg)", minWidth: 110 }}>{r.label || "Wall"}</span>
                                    {/* The shop view — the REAL shade code the guest never saw. */}
                                    <Mono>{r.appliedShadeCode || r.appliedHexCode}</Mono>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
        </>
      )}
    </div>
  );
}
