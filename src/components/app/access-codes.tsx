"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { AccessCode, OrgResponse } from "@/lib/types";

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
  const [issuing, setIssuing] = useState(false);
  const [justIssued, setJustIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadCodes = useCallback(async (orgId: string) => {
    try {
      setCodes(await api.listAccessCodes(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load codes.");
    }
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
      const code = await api.createAccessCode(org.id, { validDays });
      setCodes((prev) => [code, ...prev]);
      setJustIssued(code.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue a code.");
    } finally {
      setIssuing(false);
    }
  }, [org, validDays]);

  const copy = useCallback((code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
    }).catch(() => {});
  }, []);

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
        <p style={{ font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 18px" }}>
          Name your shop once. Then you can issue access codes for your customers.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Sharda Paints"
            aria-label="Shop name"
            style={{ flex: 1, minWidth: 200, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "300 italic 16px/1 var(--serif)" }}
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
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
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

      {justIssued && (
        <div style={{ border: "1px solid var(--accent)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Mono brass>New code</Mono>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", fontSize: 18, color: "var(--accent)" }}>{justIssued}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(justIssued)}>
            {copied === justIssued ? "Copied" : "Copy"}
          </button>
          <Mono>Share with your customer — they redeem it at /redeem</Mono>
        </div>
      )}

      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {codes.length === 0 ? (
        <p style={{ font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          No codes yet. Issue one above and share it with a customer.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--rule)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr", padding: "16px 20px", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
            {["Code", "Validity", "Expires", "Status"].map((h) => <Mono key={h}>{h}</Mono>)}
          </div>
          {codes.map((c, i) => {
            const status = c.used ? "redeemed" : c.expired ? "expired" : "active";
            const statusColor = status === "active" ? "var(--accent)" : "var(--fg-mute-deep)";
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr", padding: "18px 20px", borderBottom: i === codes.length - 1 ? "none" : "1px solid var(--rule)", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--accent)" }}>{c.code}</span>
                  {status === "active" && (
                    <button type="button" onClick={() => copy(c.code)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>
                      {copied === c.code ? "copied" : "copy"}
                    </button>
                  )}
                </span>
                <Mono>{c.validDays} days</Mono>
                <Mono>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</Mono>
                <span style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: statusColor }}>{status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
