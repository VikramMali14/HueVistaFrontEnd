"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import {
  MIN_REDEMPTION_PAISE,
  STORE_MIN_PRICE_PAISE,
  formatRupees,
  parseRupeesToPaise,
  validateStorePrice,
} from "@/lib/money";
import type { OrgResponse, StoreLink, WalletSummary } from "@/lib/types";

const VALIDITY = [3, 7, 14] as const;
const UPI_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/;

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid var(--rule-strong)",
  background: "var(--surface)",
  color: "var(--fg)",
  font: "400 16px/1 var(--sans)",
} as const;

/**
 * Retailer-facing: publish your public kiosk link (customers pay-and-upload at
 * /store/<slug>, like ordering at a fast-food kiosk), set your own price
 * (never below the ₹50 base the platform keeps), and manage the wallet the
 * excess accrues to — including "redeem to my UPI id" payout requests that an
 * admin settles manually.
 */
export function StoreKioskPanel({ org: orgProp }: { org?: OrgResponse | null }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [links, setLinks] = useState<StoreLink[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create-link form (₹79 is the suggested price; the floor is ₹50).
  const [price, setPrice] = useState("79");
  const [validDays, setValidDays] = useState<number>(3);
  const [creating, setCreating] = useState(false);

  // Per-link editing state.
  const [editPrice, setEditPrice] = useState<Record<string, string>>({});
  const [savingLink, setSavingLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Redemption form.
  const [redeemAmount, setRedeemAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

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
    const invalid = validateStorePrice(price);
    if (invalid) {
      setError(invalid);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const link = await api.createStoreLink(org.id, {
        pricePaise: parseRupeesToPaise(price)!,
        validDays,
      });
      setLinks((prev) => [link, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish your store link.");
    } finally {
      setCreating(false);
    }
  }, [org, price, validDays]);

  const saveLinkPrice = useCallback(async (link: StoreLink) => {
    const raw = editPrice[link.id];
    if (raw === undefined) return;
    const invalid = validateStorePrice(raw);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSavingLink(link.id);
    setError(null);
    try {
      const updated = await api.updateStoreLink(link.id, { pricePaise: parseRupeesToPaise(raw)! });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
      setEditPrice((prev) => {
        const next = { ...prev };
        delete next[link.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the price.");
    } finally {
      setSavingLink(null);
    }
  }, [editPrice]);

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

  const requestRedemption = useCallback(async () => {
    if (!org || !wallet) return;
    setRedeemErr(null);
    setRedeemMsg(null);
    const paise = parseRupeesToPaise(redeemAmount);
    if (paise === null) {
      setRedeemErr("Enter the amount in rupees, e.g. 500.");
      return;
    }
    if (paise < MIN_REDEMPTION_PAISE) {
      setRedeemErr(`The minimum redemption is ${formatRupees(MIN_REDEMPTION_PAISE)}.`);
      return;
    }
    if (paise > wallet.balancePaise) {
      setRedeemErr(`Your available balance is ${formatRupees(wallet.balancePaise)}.`);
      return;
    }
    if (!UPI_RE.test(upiId.trim())) {
      setRedeemErr("Enter a valid UPI id, e.g. shopname@okhdfcbank.");
      return;
    }
    setRedeeming(true);
    try {
      await api.requestWalletRedemption(org.id, { amountPaise: paise, upiId: upiId.trim() });
      setRedeemMsg("Request sent. We review payouts manually — you'll get an email once it's approved and paid.");
      setRedeemAmount("");
      await load(org.id);
    } catch (e) {
      setRedeemErr(e instanceof Error ? e.message : "Could not send the request. Please try again.");
    } finally {
      setRedeeming(false);
    }
  }, [org, wallet, redeemAmount, upiId, load]);

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
        wallet live on your shop.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {error && <div className="field-error" role="alert">{error}</div>}

      {/* ── The public kiosk link ─────────────────────────────────────── */}
      <div>
        {links.length === 0 ? (
          <div style={{ border: "1px solid var(--rule)", padding: 24, maxWidth: 560 }}>
            <Mono brass>Publish your store link</Mono>
            <p style={{ font: "400 16px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "10px 0 18px" }}>
              Pick the price a walk-in customer pays for one room visualisation. The platform keeps{" "}
              {formatRupees(STORE_MIN_PRICE_PAISE)}; everything above it lands in your wallet.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Mono>Price ₹</Mono>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  aria-label="Price per image in rupees"
                  style={{ ...inputStyle, width: 90 }}
                />
              </label>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
              </span>
              <Button onClick={() => void createLink()} disabled={creating}>
                {creating ? <><Spinner size={14} color="currentColor" /> Publishing…</> : <>Publish <span className="arr">→</span></>}
              </Button>
            </div>
            <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", marginTop: 12 }}>
              Minimum {formatRupees(STORE_MIN_PRICE_PAISE)} — at ₹79 you earn ₹29 per customer.
            </p>
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
                  <Mono>Price</Mono>
                  <input
                    value={editPrice[link.id] ?? String(link.pricePaise / 100)}
                    onChange={(e) => setEditPrice((prev) => ({ ...prev, [link.id]: e.target.value }))}
                    inputMode="decimal"
                    aria-label="Price per image in rupees"
                    style={{ ...inputStyle, width: 90 }}
                  />
                  {editPrice[link.id] !== undefined && (
                    <Button size="sm" onClick={() => void saveLinkPrice(link)} disabled={savingLink === link.id}>
                      {savingLink === link.id ? "Saving…" : "Save price"}
                    </Button>
                  )}
                  <Mono>You earn {formatRupees(Math.max(0, link.pricePaise - STORE_MIN_PRICE_PAISE))} per customer · codes valid {link.validDays}d</Mono>
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

      {/* ── Wallet ────────────────────────────────────────────────────── */}
      {wallet && (
        <div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              ["Available", wallet.balancePaise],
              ["Lifetime earned", wallet.lifetimeEarnedPaise],
              ["Pending payout", wallet.pendingRedemptionPaise],
              ["Paid out", wallet.redeemedPaise],
            ].map(([label, paise]) => (
              <div key={label as string}>
                <Mono>{label}</Mono>
                <div style={{ font: "500 28px/1.2 var(--serif)", color: label === "Available" ? "var(--accent)" : "var(--fg)", marginTop: 6 }}>
                  {formatRupees(paise as number)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ border: "1px solid var(--rule)", padding: "18px 22px", maxWidth: 640, marginBottom: 20 }}>
            <Mono brass>Redeem to your UPI</Mono>
            <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "8px 0 14px" }}>
              Payouts are settled manually: your request goes to our payouts desk, and once approved the money
              is sent to your UPI id. Minimum {formatRupees(MIN_REDEMPTION_PAISE)}.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Mono>₹</Mono>
                <input
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="500"
                  aria-label="Amount to redeem in rupees"
                  style={{ ...inputStyle, width: 100 }}
                />
              </label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="shopname@okhdfcbank"
                aria-label="Your UPI id"
                spellCheck={false}
                style={{ ...inputStyle, minWidth: 220, flex: 1 }}
              />
              <Button onClick={() => void requestRedemption()} disabled={redeeming || wallet.balancePaise < MIN_REDEMPTION_PAISE}>
                {redeeming ? <><Spinner size={14} color="currentColor" /> Sending…</> : <>Request payout <span className="arr">→</span></>}
              </Button>
            </div>
            {wallet.balancePaise < MIN_REDEMPTION_PAISE && (
              <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", marginTop: 10 }}>
                You need at least {formatRupees(MIN_REDEMPTION_PAISE)} available to request a payout.
              </p>
            )}
            {redeemErr && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{redeemErr}</p>}
            {redeemMsg && <p role="status" style={{ font: "400 14px/1.5 var(--sans)", color: "var(--accent)", marginTop: 12 }}>{redeemMsg}</p>}
          </div>

          {wallet.redemptions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Mono style={{ display: "block", marginBottom: 10 }}>Payout requests</Mono>
              <div style={{ border: "1px solid var(--rule)" }}>
                {wallet.redemptions.map((r, i) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 16px", borderBottom: i === wallet.redemptions.length - 1 ? "none" : "1px solid var(--rule)" }}>
                    <span style={{ font: "500 15px/1 var(--serif)", minWidth: 80 }}>{formatRupees(r.amountPaise)}</span>
                    <Mono>{r.upiId}</Mono>
                    <span style={{ font: "500 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: r.status === "APPROVED" ? "var(--accent)" : r.status === "REJECTED" ? "var(--fg-mute-deep)" : "var(--fg-soft)" }}>
                      {r.status}
                    </span>
                    {r.createdAt && (
                      <Mono>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Mono>
                    )}
                    {r.adminNote && <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>{r.adminNote}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {wallet.recentPayments.length > 0 && (
            <div>
              <Mono style={{ display: "block", marginBottom: 10 }}>Recent kiosk payments</Mono>
              <div style={{ border: "1px solid var(--rule)" }}>
                {wallet.recentPayments.slice(0, 10).map((p, i, arr) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 16px", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--rule)" }}>
                    <span style={{ font: "500 15px/1 var(--serif)", minWidth: 80 }}>{formatRupees(p.amountPaise)}</span>
                    <Mono>your share {formatRupees(p.retailerSharePaise)}</Mono>
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
