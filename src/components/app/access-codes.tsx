"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { PAINT_BRANDS, type AccessCode, type OrgResponse, type ProjectDetail } from "@/lib/types";

const VALIDITY = [3, 7, 14] as const;

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
 * A walk-in customer redeems a code at /redeem to become a CUSTOMER tied to you.
 */
export function AccessCodes() {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [shopName, setShopName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const [validDays, setValidDays] = useState<number>(7);
  // Paint companies a shop can unlock for a guest — the live list of companies that
  // actually have shades in the catalogue. Falls back to the well-known brands if
  // the endpoint is unreachable. Leaving none selected unlocks every company.
  const [companyOptions, setCompanyOptions] = useState<ReadonlyArray<string>>(PAINT_BRANDS);
  // Companies to unlock for the next code. Empty = every company (no restriction).
  const [companies, setCompanies] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [justIssued, setJustIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  // The guest's room per code, fetched on demand ("View room"). The full view —
  // real shade codes included — which is the whole point of the code loop.
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Record<string, ProjectDetail | null | "loading" | "error">>({});

  const viewRoom = useCallback((codeId: string) => {
    setOpenRoom((cur) => (cur === codeId ? null : codeId));
    setRooms((prev) => {
      if (prev[codeId] !== undefined && prev[codeId] !== "error") return prev;
      api
        .getGuestProjectForCode(codeId)
        .then((d) => setRooms((p) => ({ ...p, [codeId]: d ?? null })))
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
        const orgs = await api.listMyOrgs();
        const retailer = orgs.find((o) => o.type === "RETAILER") ?? null;
        setOrg(retailer);
        if (retailer) await loadCodes(retailer.id);
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
  }, [loadCodes]);

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
    setIssuing(true);
    setError(null);
    try {
      const code = await api.createAccessCode(org.id, {
        validDays,
        // Omit when none are picked so the backend treats it as "all companies".
        allowedBrands: companies.length > 0 ? companies : undefined,
      });
      setCodes((prev) => [code, ...prev]);
      setJustIssued(code.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue a code.");
    } finally {
      setIssuing(false);
    }
  }, [org, validDays, companies]);

  const toggleCompany = useCallback((name: string) => {
    setCompanies((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }, []);

  const copy = useCallback((code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
    }).catch(() => {});
  }, []);

  // WhatsApp-ready message so the retailer never types the URL and instructions by hand.
  const copyMessage = useCallback((code: string) => {
    const days = codes.find((c) => c.code === code)?.validDays ?? validDays;
    const message = `Your HueVista code: ${code}. Open ${window.location.origin}/redeem and enter it to start visualising your room. Valid ${days} days.`;
    navigator.clipboard?.writeText(message).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 1200);
    }).catch(() => {});
  }, [codes, validDays]);

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

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Mono brass>{org.name}</Mono>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mono>Validity</Mono>
            {VALIDITY.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setValidDays(d)}
                aria-pressed={validDays === d}
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid " + (validDays === d ? "var(--accent)" : "var(--rule)"),
                  color: validDays === d ? "var(--accent)" : "var(--fg-mute)",
                  font: "400 11px/1 var(--mono)",
                  letterSpacing: ".18em",
                }}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button onClick={() => void issue()} disabled={issuing}>
            {issuing ? <><Spinner size={14} color="currentColor" /> Issuing…</> : <>Issue a new code <span className="arr">→</span></>}
          </Button>
        </div>

        {/* Which paint companies this guest may browse. None selected = all companies. */}
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
            {companies.length === 0 ? "All companies" : `${companies.length} selected`}
          </span>
        </div>
      </div>

      {justIssued && (
        <div style={{ border: "1px solid var(--accent)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Mono brass>New code</Mono>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", fontSize: 18, color: "var(--accent)" }}>{justIssued}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(justIssued)}>
            {copied === justIssued ? "Copied" : "Copy"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyMessage(justIssued)}>
            {copiedMsg ? "Message copied" : "Copy message"}
          </button>
          <Mono>Share with your customer — they enter it at huevista.com/redeem</Mono>
        </div>
      )}

      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {codes.length === 0 ? (
        <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
          No codes yet. Issue one above and share it with a customer.
        </p>
      ) : (
        <div role="table" aria-label="Access codes" style={{ border: "1px solid var(--rule)" }}>
          <div role="row" className="hv-cust-row hv-cust-head" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr 1fr", padding: "16px 20px", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
            {["Code", "Validity", "Expires", "Status", "Room"].map((h) => <span key={h} role="columnheader"><Mono>{h}</Mono></span>)}
          </div>
          {codes.map((c, i) => {
            const status = c.used ? "redeemed" : c.expired ? "expired" : "active";
            const statusColor = status === "active" ? "var(--accent)" : "var(--fg-mute-deep)";
            const last = i === codes.length - 1;
            const room = rooms[c.id];
            const expanded = openRoom === c.id;
            return (
              <div key={c.id}>
                <div role="row" className="hv-cust-row" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr 1fr", padding: "18px 20px", borderBottom: last && !expanded ? "none" : "1px solid var(--rule)", alignItems: "center" }}>
                  <span role="cell" data-label="Code" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--accent)" }}>{c.code}</span>
                    {status === "active" && (
                      <button type="button" onClick={() => copy(c.code)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>
                        {copied === c.code ? "copied" : "copy"}
                      </button>
                    )}
                  </span>
                  <span role="cell" className="mono" data-label="Validity">{c.validDays} days</span>
                  <span role="cell" className="mono" data-label="Expires">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                  <span role="cell" data-label="Status" style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: statusColor }}>{status}</span>
                  <span role="cell" data-label="Room">
                    {c.used ? (
                      <button
                        type="button"
                        onClick={() => viewRoom(c.id)}
                        aria-expanded={expanded}
                        style={{ background: "transparent", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--fg-soft)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
                      >
                        {expanded ? "Hide" : "View room"}
                      </button>
                    ) : (
                      <span className="mono" style={{ color: "var(--fg-mute-deep)" }}>—</span>
                    )}
                  </span>
                </div>
                {expanded && (
                  <div style={{ padding: "16px 20px 20px", background: "var(--surface-soft)", borderBottom: last ? "none" : "1px solid var(--rule)" }}>
                    {room === "loading" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "300 15px/1 var(--serif)", color: "var(--fg-mute)" }}>
                        <Spinner size={14} /> Loading the customer&apos;s room…
                      </span>
                    )}
                    {room === "error" && (
                      <p className="field-error" role="alert" style={{ margin: 0 }}>Could not load the customer&apos;s room. Try again.</p>
                    )}
                    {room === null && (
                      <p style={{ margin: 0, font: "300 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
                        No room yet — the customer hasn&apos;t started a project with this code.
                      </p>
                    )}
                    {room && room !== "loading" && room !== "error" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                          <span style={{ font: "500 17px/1.2 var(--serif)", color: "var(--fg)" }}>{room.name}</span>
                          {room.sentToShopAt && (
                            <span style={{ font: "500 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "5px 10px" }}>
                              ✓ Sent by customer
                            </span>
                          )}
                        </div>
                        {room.regions.filter((r) => r.appliedHexCode).length === 0 ? (
                          <p style={{ margin: 0, font: "300 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>No colours applied yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {room.regions.filter((r) => r.appliedHexCode).map((r) => (
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
