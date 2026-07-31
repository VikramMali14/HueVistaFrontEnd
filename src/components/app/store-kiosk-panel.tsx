"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { formatPoints, formatRupees } from "@/lib/money";
import type { OrgResponse, StoreLink, WalletSummary } from "@/lib/types";

const VALIDITY = [3, 7, 14] as const;

/**
 * Retailer-facing: publish your public kiosk link (customers pay-and-upload at
 * /store/<slug>, like ordering at a fast-food kiosk) and watch the reward points it
 * earns.
 *
 * The shop no longer prices the link or takes a share of the payment — the walk-in is
 * HueVista's customer at one flat price, and the shop earns points instead. So there is
 * no price field and no payout form here; points are spent in the billing panel, on
 * extra projects and reopens.
 */
export function StoreKioskPanel({ org: orgProp }: { org?: OrgResponse | null }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [links, setLinks] = useState<StoreLink[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [validDays, setValidDays] = useState<number>(3);
  const [creating, setCreating] = useState(false);
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (orgId: string) => {
    const [linkList, walletSummary] = await Promise.all([
      api.listStoreLinks(orgId),
      api.getWallet(orgId),
    ]);
    setLinks(linkList);
    setWallet(walletSummary);
  }, []);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        // The portal page fetches the orgs once and passes the shop org down;
        // fetch here only when that page-level fetch wasn't available.
        const retailer =
          orgProp !== undefined
            ? orgProp
            : ((await api.listMyOrgs()).find((o) => o.type === "RETAILER") ?? null);
        setOrg(retailer);
        if (retailer) await load(retailer.id);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) {
          window.location.href = "/sign-in?next=/portal";
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load your store.");
      } finally {
        setLoading(false);
      }
    })();
  }, [load, orgProp]);

  const createLink = useCallback(async () => {
    if (!org) return;
    setCreating(true);
    setError(null);
    try {
      const link = await api.createStoreLink(org.id, { validDays });
      setLinks((prev) => [link, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish your store link.");
    } finally {
      setCreating(false);
    }
  }, [org, validDays]);

  const toggleActive = useCallback(async (link: StoreLink) => {
    setSavingLink(link.id);
    setError(null);
    try {
      const updated = await api.updateStoreLink(link.id, { active: !link.active });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the link.");
    } finally {
      setSavingLink(null);
    }
  }, []);

  const copyUrl = useCallback((link: StoreLink) => {
    const url = `${window.location.origin}/store/${link.slug}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(link.id);
      setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1200);
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your store…</Mono>
      </div>
    );
  }

  if (!org) {
    return (
      <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        Set up your shop in the &ldquo;Active codes&rdquo; section above first — your store link and
        points live on your shop.
      </p>
    );
  }

  const kioskPrice = wallet?.kioskPricePaise ?? 9900;
  const pointsPerSale = wallet?.pointsPerSale ?? 30;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {error && <div className="field-error" role="alert">{error}</div>}

      {/* ── The public kiosk link ─────────────────────────────────────── */}
      <div>
        {links.length === 0 ? (
          <div style={{ border: "1px solid var(--rule)", padding: 24, maxWidth: 560 }}>
            <Mono brass>Publish your store link</Mono>
            <p style={{ font: "400 16px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "10px 0 18px" }}>
              A walk-in pays {formatRupees(kioskPrice)} for one room visualisation, and you earn{" "}
              {formatPoints(pointsPerSale)} every time. Points buy extra projects and
              reopens, and last a year from the day you earn them.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Mono>Codes valid</Mono>
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
              </span>
              <Button onClick={() => void createLink()} disabled={creating}>
                {creating ? <><Spinner size={14} color="currentColor" /> Publishing…</> : <>Publish <span className="arr">→</span></>}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {links.map((link) => (
              <div key={link.id} style={{ border: "1px solid var(--rule)", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15, color: "var(--accent)", overflowWrap: "anywhere" }}>
                    {typeof window !== "undefined" ? window.location.origin : ""}/store/{link.slug}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyUrl(link)}>
                    {copied === link.id ? "Copied" : "Copy URL"}
                  </button>
                  <span style={{ font: "500 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: link.active ? "var(--accent)" : "var(--fg-mute-deep)", border: "1px solid " + (link.active ? "var(--accent)" : "var(--rule)"), borderRadius: 999, padding: "5px 10px" }}>
                    {link.active ? "Live" : "Paused"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Mono>
                    {formatRupees(link.pricePaise)} per customer · you earn{" "}
                    {formatPoints(link.bonusPoints ?? pointsPerSale)} · codes valid {link.validDays}d
                  </Mono>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleActive(link)} disabled={savingLink === link.id}>
                    {link.active ? "Pause" : "Resume"}
                  </button>
                </div>
              </div>
            ))}
            <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", margin: 0 }}>
              Open this URL on a tablet at your counter, print it as a QR, or send it on WhatsApp — customers
              pay there and their pickup code appears in your &ldquo;Active codes&rdquo; list above.
            </p>
          </div>
        )}
      </div>

      {/* ── Points ────────────────────────────────────────────────────── */}
      {wallet && (
        <div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 20 }}>
            <div>
              <Mono>Points to spend</Mono>
              <div style={{ font: "500 28px/1.2 var(--serif)", color: "var(--accent)", marginTop: 6 }}>
                {formatPoints(wallet.pointsBalance)}
              </div>
            </div>
            <div>
              <Mono>Earned all time</Mono>
              <div style={{ font: "500 28px/1.2 var(--serif)", color: "var(--fg)", marginTop: 6 }}>
                {formatPoints(wallet.lifetimePointsEarned)}
              </div>
            </div>
            <div>
              <Mono>Per kiosk sale</Mono>
              <div style={{ font: "500 28px/1.2 var(--serif)", color: "var(--fg)", marginTop: 6 }}>
                {formatPoints(wallet.pointsPerSale)}
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid var(--rule)", padding: "18px 22px", maxWidth: 640, marginBottom: 20 }}>
            <Mono brass>What points buy</Mono>
            <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "8px 0 0" }}>
              Points buy HueVista services at their own price — an extra project, or another
              window on an expired one. A project costs fewer points the bigger your plan
              (80 with none, down to 40 on Business). Spend them from
              the Points panel in your subscription page. They last one year from the day you
              earn them, and aren&rsquo;t paid out as cash.
            </p>
          </div>

          {wallet.recentPayments.length > 0 && (
            <div>
              <Mono style={{ display: "block", marginBottom: 10 }}>Recent kiosk sales</Mono>
              <div style={{ border: "1px solid var(--rule)" }}>
                {wallet.recentPayments.slice(0, 10).map((p, i, arr) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 16px", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--rule)", opacity: p.reversed ? 0.55 : 1 }}>
                    <span style={{ font: "500 15px/1 var(--serif)", minWidth: 80 }}>{formatRupees(p.amountPaise)}</span>
                    <Mono>
                      {p.reversed ? `refunded — ${formatPoints(p.bonusPoints)} taken back` : `+${formatPoints(p.bonusPoints)}`}
                    </Mono>
                    {p.code && <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--accent)" }}>{p.code}</span>}
                    {p.createdAt && (
                      <Mono>{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Mono>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
