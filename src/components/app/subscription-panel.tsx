"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HttpError } from "@/lib/http-error";
import { buyExtraImage, subscribeToPlan, topUpWallet } from "@/lib/payments";
import type { BillingWalletSummary, PlanOption, PurchasablePlan, SubscriptionSummary } from "@/lib/types";

interface SubscriptionPanelProps {
  initialSubscription: SubscriptionSummary | null;
  history: SubscriptionSummary[];
  plans: PlanOption[];
}

const UNLIMITED_FLOOR = 2_000_000_000;

// Tier ladder for the upgrade rules: while a paid plan is ACTIVE, only a step
// UP can be bought in place (the backend cancels the old plan on activation);
// a downgrade needs a cancel first. Must match the backend Plan enum order.
const PLAN_RANK: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, BUSINESS: 2, ENTERPRISE: 3 };

/** Paise -> "₹50" / "₹25" (trailing .00 trimmed). */
const paise = (p: number) =>
  "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const TXN_LABEL: Record<string, string> = {
  TOPUP: "Wallet top-up",
  EXTRA_IMAGE: "Extra image",
  EXTRA_AUTO_MASK: "Extra AI auto-mask",
};

/** Quick top-up choices, in paise. */
const TOPUP_PRESETS = [19900, 49900, 99900] as const;

const card: React.CSSProperties = {
  border: "1px solid var(--rule-strong)",
  background: "var(--surface-soft)",
  borderRadius: 8,
  padding: 24,
};

const fieldLabel: React.CSSProperties = {
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  display: "block",
  marginBottom: 6,
};

const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  padding: "10px 16px",
  cursor: "pointer",
  color: "var(--fg-soft)",
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtLimit(n?: number): string {
  if (n == null) return "—";
  return n >= UNLIMITED_FLOOR ? "unlimited" : n.toLocaleString("en-IN");
}

function statusLabel(s: SubscriptionSummary): { text: string; color: string } {
  if (s.status === "ACTIVE") {
    return s.trial
      ? { text: "Free trial", color: "var(--accent)" }
      : { text: "Active", color: "var(--accent)" };
  }
  if (s.status === "EXPIRED") return { text: "Ended", color: "var(--terracotta)" };
  if (s.status === "HALTED") return { text: "Payment failed", color: "var(--terracotta)" };
  if (s.status === "CANCELLED") {
    // A cancelled plan stays usable to the end of the paid period — a bare
    // "Cancelled" read as if access had already ended.
    const stillInPaidPeriod =
      s.cancelAtPeriodEnd && s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() > Date.now();
    return stillInPaidPeriod
      ? { text: "Cancelled · active till period end", color: "var(--fg-mute)" }
      : { text: "Cancelled", color: "var(--fg-mute)" };
  }
  if (s.status === "CREATED") return { text: "Awaiting payment", color: "var(--fg-mute)" };
  return { text: s.status, color: "var(--fg-mute)" };
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const unlimited = limit >= UNLIMITED_FLOOR;
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div
        aria-hidden
        style={{ height: 6, borderRadius: 3, background: "var(--rule)", overflow: "hidden", margin: "8px 0 6px" }}
      >
        <div
          style={{
            width: unlimited ? "100%" : `${pct}%`,
            height: "100%",
            background: pct >= 90 && !unlimited ? "var(--terracotta)" : "var(--accent)",
            opacity: unlimited ? 0.25 : 1,
            transition: "width .3s ease",
          }}
        />
      </div>
      <span style={{ font: "400 13px/1 var(--mono)", color: "var(--fg-mute)" }}>
        {used.toLocaleString("en-IN")} of {fmtLimit(limit)} used
      </span>
    </div>
  );
}

/**
 * The signed-in subscription page's working surface: current plan + live usage,
 * renew/upgrade via the in-app Razorpay Checkout (this is also how an ENDED
 * subscription comes back — paying for a plan starts a fresh one), cancel, and
 * the account's subscription history.
 */
export function SubscriptionPanel({ initialSubscription, history, plans }: SubscriptionPanelProps) {
  const router = useRouter();
  const [sub, setSub] = useState(initialSubscription);
  const [busyPlan, setBusyPlan] = useState<PurchasablePlan | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [buyingImage, setBuyingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Prepaid billing wallet — loaded client-side; null while loading / on failure
  // (the section renders a quiet fallback either way).
  const [wallet, setWallet] = useState<BillingWalletSummary | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [customTopUp, setCustomTopUp] = useState("");
  const [walletPaying, setWalletPaying] = useState<"image" | "mask" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getBillingWallet()
      .then((w) => !cancelled && setWallet(w))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshWalletAndSub() {
    const [w, fresh] = await Promise.all([
      api.getBillingWallet().catch(() => null),
      api.getCurrentSubscription().catch(() => null),
    ]);
    if (w) setWallet(w);
    if (fresh) setSub(fresh);
  }

  const active = sub?.status === "ACTIVE";
  const ended = sub != null && !active;
  // A paid ACTIVE plan can only be changed by an upgrade; trials can buy anything.
  const activePaid = active && !sub?.trial;
  const currentRank = activePaid && sub ? (PLAN_RANK[sub.plan] ?? -1) : -1;

  async function buy(plan: PurchasablePlan) {
    setError(null);
    setNotice(null);
    setBusyPlan(plan);
    const upgrading = activePaid;
    try {
      const paid = await subscribeToPlan(plan);
      if (paid) {
        const fresh = await api.getCurrentSubscription().catch(() => null);
        if (fresh) setSub(fresh);
        setNotice(
          upgrading
            ? "Upgrade complete — your new plan is active with its full quota, and the old one has been cancelled. No further charges on it."
            : "Payment received — your plan is active. Happy painting!",
        );
        router.refresh();
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent("/subscription")}`);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
    } finally {
      setBusyPlan(null);
    }
  }

  // Pay-per-image overage: one extra image at ₹50 once the quota is spent.
  async function buyImage() {
    setError(null);
    setNotice(null);
    setBuyingImage(true);
    try {
      const paid = await buyExtraImage();
      if (paid) {
        const fresh = await api.getCurrentSubscription().catch(() => null);
        if (fresh) setSub(fresh);
        setNotice("Payment received — one extra image has been added to your plan. It never expires.");
        router.refresh();
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent("/subscription")}`);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not start the payment. Please try again.");
    } finally {
      setBuyingImage(false);
    }
  }

  // Add money to the prepaid wallet through Razorpay Checkout.
  async function topUp(amountPaise: number) {
    setError(null);
    setNotice(null);
    setToppingUp(true);
    try {
      const paid = await topUpWallet(amountPaise);
      if (paid) {
        await refreshWalletAndSub();
        setCustomTopUp("");
        setNotice("Wallet topped up — the balance is ready to spend on extra images and AI auto-masks.");
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent("/subscription")}`);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not start the top-up. Please try again.");
    } finally {
      setToppingUp(false);
    }
  }

  // Spend the wallet on one extra image / one extra AI auto-mask — no checkout,
  // just an atomic balance debit on the server.
  async function walletPay(kind: "image" | "mask") {
    setError(null);
    setNotice(null);
    setWalletPaying(kind);
    try {
      const fresh = kind === "image"
        ? await api.walletPayImageCredit()
        : await api.walletPayAutoMaskCredit();
      setSub(fresh);
      const w = await api.getBillingWallet().catch(() => null);
      if (w) setWallet(w);
      setNotice(kind === "image"
        ? "Paid from wallet — one extra image added to your plan."
        : "Paid from wallet — one extra AI auto-mask added to your plan.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet payment failed. Please try again.");
    } finally {
      setWalletPaying(null);
    }
  }

  async function cancel() {
    setError(null);
    setNotice(null);
    setCancelling(true);
    try {
      const res = await api.cancelSubscription();
      setSub(res);
      setConfirmCancel(false);
      setNotice(
        res.status === "ACTIVE"
          ? "Your plan will end at the close of the current billing period."
          : "Your subscription has been ended.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  const purchasable = plans.filter(
    (p): p is PlanOption & { plan: PurchasablePlan } => p.plan !== "ENTERPRISE",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {notice && (
        <p role="status" style={{ font: "400 15px/1.5 var(--sans)", color: "var(--accent)", margin: 0 }}>
          {notice}
        </p>
      )}

      {/* Current plan */}
      <section style={card}>
        {!sub && (
          <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>
            You don&rsquo;t have a subscription yet. Pick a plan below to unlock AI-cleaned
            images, wall masking and colour boards.
          </p>
        )}
        {sub && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 16px" }}>
              <h2 style={{ font: "600 24px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>
                {sub.planDisplayName}
              </h2>
              <span
                style={{
                  font: "500 11px/1 var(--mono)",
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  color: statusLabel(sub).color,
                }}
              >
                {statusLabel(sub).text}
              </span>
              {sub.currentPeriodEnd && (
                <span style={{ marginLeft: "auto", font: "400 13px/1 var(--mono)", color: "var(--fg-mute)" }}>
                  {active ? "renews / ends" : "ended"} {fmtDate(sub.currentPeriodEnd)}
                </span>
              )}
            </div>

            {ended && (
              <p
                role="note"
                style={{
                  margin: "16px 0 0",
                  padding: "12px 16px",
                  border: "1px solid var(--terracotta)",
                  borderRadius: 8,
                  font: "400 15px/1.6 var(--sans)",
                  color: "var(--fg-soft)",
                }}
              >
                Your subscription has ended, so image processing is paused. Choose a plan below and
                pay to start a fresh one — you&rsquo;ll be active again the moment the payment
                completes.
              </p>
            )}

            {active && (
              <div
                className="r-cols-md-1"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 24 }}
              >
                <div>
                  <span style={fieldLabel}>Images this cycle (incl. AI clean-up)</span>
                  <UsageBar
                    used={sub.aiGenerationsUsed}
                    limit={sub.aiGenerationsLimit + (sub.purchasedImageCredits ?? 0)}
                  />
                  {(sub.purchasedImageCredits ?? 0) > 0 && (
                    <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 4 }}>
                      includes {sub.purchasedImageCredits} purchased extra{(sub.purchasedImageCredits ?? 0) === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div>
                  <span style={fieldLabel}>AI auto-masks (wall detection)</span>
                  {(sub.autoMasksLimit ?? 0) + (sub.purchasedAutoMaskCredits ?? 0) > 0 ? (
                    <>
                      <UsageBar
                        used={sub.autoMasksUsed ?? 0}
                        limit={(sub.autoMasksLimit ?? 0) + (sub.purchasedAutoMaskCredits ?? 0)}
                      />
                      {(sub.purchasedAutoMaskCredits ?? 0) > 0 && (
                        <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 4 }}>
                          includes {sub.purchasedAutoMaskCredits} purchased extra{(sub.purchasedAutoMaskCredits ?? 0) === 1 ? "" : "s"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ font: "400 13px/1.5 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 8 }}>
                      Not in this plan — manual masking is unlimited. Upgrade for AI wall detection.
                    </span>
                  )}
                </div>
                <div>
                  <span style={fieldLabel}>Colour-board PDF downloads</span>
                  <UsageBar used={sub.pdfDownloadsUsed ?? 0} limit={sub.pdfDownloadsLimit ?? 0} />
                </div>
              </div>
            )}

            {active && sub.aiGenerationsLimit < UNLIMITED_FLOOR && (
              <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                {wallet != null && wallet.balancePaise >= wallet.imageCreditPricePaise && (
                  <button
                    type="button"
                    onClick={() => void walletPay("image")}
                    disabled={walletPaying !== null || buyingImage}
                    style={{ ...buttonStyle, borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    {walletPaying === "image"
                      ? "Paying…"
                      : `1 extra image from wallet — ${paise(wallet.imageCreditPricePaise)}`}
                  </button>
                )}
                {wallet != null
                  && (sub.autoMasksLimit ?? 0) < UNLIMITED_FLOOR
                  && wallet.balancePaise >= wallet.autoMaskCreditPricePaise && (
                  <button
                    type="button"
                    onClick={() => void walletPay("mask")}
                    disabled={walletPaying !== null || buyingImage}
                    style={{ ...buttonStyle, borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    {walletPaying === "mask"
                      ? "Paying…"
                      : `1 extra AI auto-mask from wallet — ${paise(wallet.autoMaskCreditPricePaise)}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void buyImage()}
                  disabled={buyingImage || walletPaying !== null}
                  style={{ ...buttonStyle, borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }}
                >
                  {buyingImage ? "Opening payment…" : "Buy 1 extra image — ₹50"}
                </button>
                <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                  Out of allowance mid-cycle? Extras never expire.
                </span>
              </div>
            )}

            {active && !sub.trial && (
              <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {!confirmCancel ? (
                  <button type="button" onClick={() => setConfirmCancel(true)} style={buttonStyle}>
                    Cancel subscription
                  </button>
                ) : (
                  <>
                    <span style={{ font: "400 14px/1.4 var(--sans)", color: "var(--fg-soft)" }}>
                      End your plan at the close of this billing period?
                    </span>
                    <button
                      type="button"
                      onClick={cancel}
                      disabled={cancelling}
                      style={{ ...buttonStyle, borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                    >
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} style={buttonStyle}>
                      Keep my plan
                    </button>
                  </>
                )}
                {sub.cancelAtPeriodEnd && (
                  <span style={{ font: "400 13px/1 var(--mono)", color: "var(--fg-mute)" }}>
                    Ends at period close — no further charges.
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Prepaid wallet: top up once, spend on extra images / AI auto-masks */}
      {active && (
        <section style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 16px" }}>
            <h2 style={{ font: "600 20px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>Wallet</h2>
            <span style={{ font: "600 18px/1 var(--mono)", color: "var(--accent)" }}>
              {wallet ? paise(wallet.balancePaise) : "—"}
            </span>
            <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
              Prepaid balance for pay-per-use: extra image {wallet ? paise(wallet.imageCreditPricePaise) : "₹50"},
              extra AI auto-mask {wallet ? paise(wallet.autoMaskCreditPricePaise) : "₹25"}.
            </span>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {TOPUP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void topUp(p)}
                disabled={toppingUp}
                style={{ ...buttonStyle, borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }}
              >
                + {paise(p)}
              </button>
            ))}
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                inputMode="numeric"
                min={100}
                step={50}
                placeholder="Custom ₹"
                aria-label="Custom top-up amount in rupees"
                value={customTopUp}
                onChange={(e) => setCustomTopUp(e.target.value)}
                style={{
                  width: 110,
                  padding: "9px 10px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--fg)",
                  font: "400 13px/1 var(--mono)",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const rupees = Number(customTopUp);
                  if (!Number.isFinite(rupees) || rupees <= 0) {
                    setError("Enter a top-up amount in rupees first.");
                    return;
                  }
                  void topUp(Math.round(rupees * 100));
                }}
                disabled={toppingUp}
                style={buttonStyle}
              >
                {toppingUp ? "Opening payment…" : "Add money"}
              </button>
            </span>
            <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)" }}>
              min ₹100 · UPI / cards / netbanking · balance never expires
            </span>
          </div>

          {wallet && wallet.transactions.length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={fieldLabel}>Recent activity</span>
              {wallet.transactions.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  style={{ display: "flex", gap: 12, alignItems: "baseline", font: "400 13px/1.5 var(--sans)", color: "var(--fg-soft)" }}
                >
                  <span style={{ minWidth: 150 }}>{TXN_LABEL[t.type] ?? t.type}</span>
                  <span style={{ font: "500 13px/1 var(--mono)", color: t.amountPaise >= 0 ? "var(--accent)" : "var(--terracotta)" }}>
                    {t.amountPaise >= 0 ? "+" : "−"}{paise(Math.abs(t.amountPaise))}
                  </span>
                  <span style={{ marginLeft: "auto", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
                    {fmtDate(t.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Plans: upgrade / renew */}
      <section>
        <h2 style={{ font: "600 20px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 6px" }}>
          {ended || !sub ? "Choose a plan" : "Upgrade or change plan"}
        </h2>
        <p style={{ font: "300 16px/1.6 var(--serif)", color: "var(--fg-soft)", margin: "0 0 18px", maxWidth: "62ch" }}>
          Billed monthly through Razorpay, cancel anytime.
          {activePaid
            ? " Upgrades apply instantly — pay for the bigger plan and it starts right away with its full quota, while your old plan is cancelled automatically (no double billing). To downgrade, cancel first: your plan stays active till the period ends, then pick the smaller tier."
            : ""}
        </p>
        <div
          className="r-cols-md-1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}
        >
          {purchasable.map((p) => {
            const isCurrent = activePaid && sub?.plan === p.plan;
            const isUpgrade = activePaid && (PLAN_RANK[p.plan] ?? -1) > currentRank;
            const isDowngrade = activePaid && !isCurrent && !isUpgrade;
            return (
              <div key={p.plan} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ font: "600 18px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>
                    {p.displayName}
                  </h3>
                  <span style={{ font: "400 15px/1 var(--mono)", color: "var(--fg-soft)" }}>
                    ₹{p.priceInRupees.toLocaleString("en-IN")}/mo
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, font: "400 14px/1.7 var(--sans)", color: "var(--fg-soft)" }}>
                  <li>
                    {p.monthlyImageLimit === "unlimited" ? "Unlimited" : p.monthlyImageLimit} images / month
                    {" "}(AI clean-up included)
                  </li>
                  <li>
                    {p.monthlyAutoMaskLimit === "unlimited"
                      ? "Unlimited AI auto-masks"
                      : p.monthlyAutoMaskLimit === 0
                        ? "Manual masking only (unlimited)"
                        : `${p.monthlyAutoMaskLimit} AI auto-masks / month + unlimited manual`}
                  </li>
                  <li>
                    {p.monthlyPdfLimit === "unlimited" ? "Unlimited" : p.monthlyPdfLimit} colour-board PDFs
                    {" "}({p.pdfImageLimit} images each)
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => buy(p.plan)}
                  disabled={busyPlan !== null || isCurrent || isDowngrade}
                  style={{
                    ...buttonStyle,
                    marginTop: "auto",
                    ...(isCurrent || isDowngrade
                      ? {}
                      : { borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }),
                  }}
                >
                  {isCurrent
                    ? "Current plan"
                    : busyPlan === p.plan
                      ? "Opening checkout…"
                      : isUpgrade
                        ? `Upgrade to ${p.displayName}`
                        : isDowngrade
                          ? "Cancel current plan first"
                          : ended
                            ? "Renew with this plan"
                            : "Get this plan"}
                </button>
                {isUpgrade && (
                  <span style={{ font: "400 11px/1.5 var(--mono)", color: "var(--fg-mute)" }}>
                    Starts immediately · old plan cancelled automatically
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 style={{ font: "600 20px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 14px" }}>
            History
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h) => (
              <div
                key={h.id}
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "6px 16px",
                }}
              >
                <span style={{ font: "500 15px/1.3 var(--serif)", color: "var(--fg)" }}>
                  {h.planDisplayName}
                  {h.trial ? " (trial)" : ""}
                </span>
                <span style={{ font: "500 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: statusLabel(h).color }}>
                  {statusLabel(h).text}
                </span>
                <span style={{ marginLeft: "auto", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
                  till {fmtDate(h.currentPeriodEnd)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
