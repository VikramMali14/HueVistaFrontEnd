"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/dates";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { formatPoints, formatRupees } from "@/lib/money";
import { site } from "@/lib/config";
import type { OrgResponse, StoreLink, WalletSummary } from "@/lib/types";

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

  const [creating, setCreating] = useState(false);
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
      const link = await api.createStoreLink(org.id);
      setLinks((prev) => [link, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish your store link.");
    } finally {
      setCreating(false);
    }
  }, [org]);

  /**
   * Retire a link. The row leaves this list, but the server keeps it — the sales it
   * made are the shop's own history and the audit behind its points balance, and the
   * walk-ins holding codes it sold paid for that access.
   */
  const deleteLink = useCallback(async (link: StoreLink) => {
    setSavingLink(link.id);
    setError(null);
    try {
      await api.deleteStoreLink(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the link.");
    } finally {
      setSavingLink(null);
    }
  }, []);

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

  // Fallback only until the wallet lands; tracks app.store.price-paise.
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
            {/* Nothing to set. The link is your shop's and it does not run out — you
                pause it or delete it. It used to ask for 3, 7 or 14 days here, which
                is the window on the CODE a walk-in buys and not the link at all, and
                sat beside counter-issued codes running a fixed 10. */}
            <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "0 0 14px", maxWidth: "52ch" }}>
              The link is yours and stays live until you pause or delete it — there is nothing
              to renew. Each customer who pays gets their own code, which they can enter at{" "}
              {site.unlockLabel} to pick the room back up at home.
            </p>
            <Button onClick={() => void createLink()} disabled={creating}>
              {creating ? <><Spinner size={14} color="currentColor" /> Publishing…</> : <>Publish my link <span className="arr">→</span></>}
            </Button>
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
                  <span style={{ font: "500 12px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: link.active ? "var(--accent)" : "var(--fg-mute-deep)", border: "1px solid " + (link.active ? "var(--accent)" : "var(--rule)"), borderRadius: 999, padding: "5px 10px" }}>
                    {link.active ? "Live" : "Paused"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Mono>
                    {formatRupees(link.pricePaise)} per customer · you earn{" "}
                    {formatPoints(link.bonusPoints ?? pointsPerSale)} · never expires
                  </Mono>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleActive(link)} disabled={savingLink === link.id}>
                    {link.active ? "Pause" : "Resume"}
                  </button>
                  {/* Delete asks once, and says what survives it. A shop closing a
                      counter should not have to wonder whether it is also erasing the
                      sales that counter made. */}
                  {confirmDelete === link.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-soft)", maxWidth: "42ch" }}>
                        Delete this link? The URL stops working straight away. Your sales and points
                        stay, and customers who already paid keep their codes.
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                        onClick={() => void deleteLink(link)}
                        disabled={savingLink === link.id}
                      >
                        {savingLink === link.id ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmDelete(link.id)}
                      disabled={savingLink === link.id}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", margin: 0 }}>
              Open this URL on a tablet at your counter, print it as a QR, or send it on WhatsApp — customers
              pay there and their pickup code appears in your &ldquo;Active codes&rdquo; list above. Pausing
              keeps the printed URL working for when you come back; deleting stops it for good.
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
            {/* Names its own source. "Earned all time: 0" sitting beside "Points to
                spend: 200" reads as a contradiction, because a balance can also be
                bought — and this counter only ever counts the kiosk half. */}
            <div>
              <Mono>Earned at the kiosk</Mono>
              <div style={{ font: "500 28px/1.2 var(--serif)", color: "var(--fg)", marginTop: 6 }}>
                {formatPoints(wallet.lifetimePointsEarned)}
              </div>
              <span style={{ display: "block", font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)", marginTop: 4, maxWidth: "24ch" }}>
                all time — points you bought aren&rsquo;t counted here
              </span>
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
                      <Mono>{formatDate(p.createdAt)}</Mono>
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
