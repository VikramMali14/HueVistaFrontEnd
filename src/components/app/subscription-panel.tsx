"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HttpError } from "@/lib/http-error";
import { buyPoints, PaymentVerificationError, subscribeToPlan } from "@/lib/payments";
import { formatLimit, isUnlimited } from "@/lib/plan-quota";
import { PROJECT_VALID_DAYS } from "@/lib/project-validity";
import { contact } from "@/lib/config";
import type { PlanOption, PurchasablePlan, RewardPointsSummary, SubscriptionSummary } from "@/lib/types";

/**
 * What to put on screen when a purchase fails.
 *
 * The distinction that matters is whether the card was charged. Checkout never opening is
 * a "try again"; the charge landing and only the CONFIRMATION failing is emphatically not
 * — Razorpay already has the money and the webhook settles it, so paying again buys the
 * same month twice. That second case used to surface as a bare error message beside a
 * live Pay button, which is the worst possible thing to show someone who has just paid.
 */
function paymentErrorText(e: unknown, fallback: string): string {
  if (e instanceof PaymentVerificationError) {
    return `Your payment went through, but we couldn't confirm it here. Please do NOT pay
            again — it will be applied automatically, usually within a few minutes. Refresh
            this page shortly, and if it still hasn't appeared write to ${contact.billing}
            with your payment reference and we'll sort it out.`.replace(/\s+/g, " ");
  }
  return e instanceof Error ? e.message : fallback;
}

interface SubscriptionPanelProps {
  initialSubscription: SubscriptionSummary | null;
  history: SubscriptionSummary[];
  plans: PlanOption[];
}


// Tier ladder for the upgrade rules: while a paid plan is ACTIVE, only a step UP can be
// bought in place (the backend cancels the old plan on activation); a downgrade needs a
// cancel first. The backend serves each plan's rank, so this fallback only covers a
// server too old to send one — a hand-kept copy of the enum order is exactly the kind of
// duplicate that rots silently when a tier is added.
//
// ENTERPRISE keeps a rank even though it is no longer sold: an account granted it before
// it was withdrawn still holds it, and it has to out-rank Business so every card below
// reads as the downgrade it is rather than offering that shop an "upgrade" to less.
const FALLBACK_RANK: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, BUSINESS: 2, ENTERPRISE: 3 };

const rankOf = (plans: PlanOption[], plan: string): number => {
  const served = plans.find((p) => p.plan === plan)?.rank;
  return served ?? FALLBACK_RANK[plan] ?? -1;
};

/** Paise -> "₹50" / "₹25" (trailing .00 trimmed). */
const paise = (p: number) =>
  "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const POINTS_LABEL: Record<string, string> = {
  KIOSK_EARNED: "Kiosk sale",
  KIOSK_REVERSED: "Kiosk sale refunded",
  EXPIRED: "Expired unused",
  SPENT_ON_IMAGE: "Extra photo",
  SPENT_ON_AUTO_MASK: "Extra wall detection",
  SPENT_ON_PROJECT: "Extra project",
  SPENT_ON_PROJECT_REOPEN: "Project reopened",
};

/** "3 August 2027" — points expiry is a date the shop should be able to act on. */
const fmtExpiry = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Whole days from now until an expiry date, floored at 0. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Quick purchase choices, in POINTS (one rupee each). */
const POINT_PRESETS = [100, 500, 1000] as const;

const card: React.CSSProperties = {
  border: "1px solid var(--rule-strong)",
  background: "var(--surface-soft)",
  borderRadius: 8,
  padding: 24,
};

const fieldLabel: React.CSSProperties = {
  font: "400 12px/1 var(--mono)",
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
  font: "400 12px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const fmtLimit = formatLimit;

/** Still inside the period the customer paid for. */
function withinPaidPeriod(s: SubscriptionSummary | null): boolean {
  return s?.currentPeriodEnd != null && new Date(s.currentPeriodEnd).getTime() > Date.now();
}

/**
 * Bought, but not begun. A plan taken out while another was winding down is scheduled at
 * the gateway for the day that period ends, so the buyer isn't charged for two
 * overlapping months — until then the plan it replaces is the one in force.
 */
function notStartedYet(s: SubscriptionSummary | null): boolean {
  return s?.currentPeriodStart != null && new Date(s.currentPeriodStart).getTime() > Date.now();
}

/**
 * Whether this subscription currently grants access — ACTIVE, or CANCELLED but still
 * inside its paid period, and in either case already started. Mirrors the backend's
 * entitlement gate exactly, so the panel can never show "active till period end" while
 * every feature answers 402.
 */
function entitles(s: SubscriptionSummary | null): boolean {
  if (!s || notStartedYet(s)) return false;
  return s.status === "ACTIVE" || (s.status === "CANCELLED" && withinPaidPeriod(s));
}

function statusLabel(s: SubscriptionSummary): { text: string; color: string } {
  // "Starts <date>" is for a plan that has been PAID for and scheduled to begin when the
  // current one ends. A CREATED row is an unpaid checkout attempt that happens to carry
  // the same future start date, and labelling it "Starts 3 September" told a shop that
  // had abandoned checkout it had a plan coming — it has nothing until it pays.
  if (notStartedYet(s) && s.status !== "EXPIRED" && s.status !== "CREATED") {
    return { text: `Starts ${fmtDate(s.currentPeriodStart)}`, color: "var(--accent)" };
  }
  if (s.status === "ACTIVE") {
    // The free plan reads as what it is: a live plan that renews, not a countdown and
    // not something winding down. It carries no cancelAtPeriodEnd meaning either —
    // nothing renews it at a gateway, so there is nothing for that flag to stop.
    if (s.plan === "FREE" && !s.trial) {
      return { text: "Free plan · renews monthly", color: "var(--accent)" };
    }
    if (s.cancelAtPeriodEnd) {
      return s.trial
        ? { text: "Trial · won't renew", color: "var(--accent)" }
        : { text: "Active · ends at period close", color: "var(--accent)" };
    }
    return s.trial
      ? { text: "Trial", color: "var(--accent)" }
      : { text: "Active", color: "var(--accent)" };
  }
  if (s.status === "EXPIRED") return { text: "Ended", color: "var(--terracotta)" };
  if (s.status === "HALTED") return { text: "Payment failed", color: "var(--terracotta)" };
  if (s.status === "CANCELLED") {
    // A cancelled plan stays usable to the end of the paid period — a bare "Cancelled"
    // read as if access had already ended. The backend gate matches on the SAME
    // condition (period end, not the cancelAtPeriodEnd flag), so what this says and what
    // the API allows can't drift apart.
    return withinPaidPeriod(s)
      ? { text: "Cancelled · active till period end", color: "var(--accent)" }
      : { text: "Cancelled", color: "var(--fg-mute)" };
  }
  if (s.status === "CREATED") return { text: "Awaiting payment", color: "var(--fg-mute)" };
  return { text: s.status, color: "var(--fg-mute)" };
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const unlimited = isUnlimited(limit);
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
  const [resuming, setResuming] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [customTopUp, setCustomTopUp] = useState("");
  // Reward points — a separate ledger with its own prices and a one-year expiry.
  const [points, setPoints] = useState<RewardPointsSummary | null>(null);
  // How long a bought project stays open. Configuration, so it is read from the server
  // rather than stated here; the constant only covers the moment before it arrives.
  const [projectValidDays, setProjectValidDays] = useState(PROJECT_VALID_DAYS);

  useEffect(() => {
    let cancelled = false;
    // 403 for a non-retailer (points are shop-side), so a failure here is normal.
    api.getRewardPoints()
      .then((p) => !cancelled && setPoints(p))
      .catch(() => {});
    api.getProjectPurchaseOptions()
      .then((o) => !cancelled && setProjectValidDays(o.validDays))
      .catch(() => {}); // the fallback already reads correctly
    return () => {
      cancelled = true;
    };
  }, []);

  // A CANCELLED plan still entitles until the period it was paid for actually elapses —
  // this mirrors the backend gate exactly, so the panel can never claim access the API
  // will refuse (or hide access the customer still has).
  const active = entitles(sub);
  // HALTED is NOT "ended" — Razorpay could not collect the renewal, so the subscription
  // is paused, not finished: it still holds an unpaid invoice and would resume if that
  // invoice were settled. Telling the shop "your subscription has ended" hid both facts
  // and offered no way to stop it. It gets its own state and its own way out.
  const halted = sub?.status === "HALTED";
  const ended = sub != null && !active && !halted;
  // Winding down: still usable, but not renewing. It no longer blocks buying a plan.
  const windingDown = active && !!sub?.cancelAtPeriodEnd;
  // Only a TRIAL can be un-cancelled. Razorpay has no "un-cancel" for a paid plan, so
  // offering the button there was an action that could only ever fail — the way back is
  // to subscribe again, which now starts the day this period ends.
  const resumable = windingDown && !!sub?.trial;
  // The free plan is not something to cancel, resume or be blocked from replacing: no
  // card, no renewal to stop, and it is what an account falls back to anyway.
  const onFreePlan = sub?.plan === "FREE" && !sub?.trial;
  // A paid plan that is still renewing can only be changed by an upgrade; the free plan,
  // a trial, or one already set to end, can buy anything.
  const activePaid = active && !sub?.trial && !onFreePlan && !windingDown;
  const currentRank = activePaid && sub ? rankOf(plans, sub.plan) : -1;

  async function buy(plan: PurchasablePlan) {
    setError(null);
    setNotice(null);
    setBusyPlan(plan);
    const upgrading = activePaid;
    // Bought to replace a plan still running out its paid period: the gateway starts
    // billing the day that period ends, so this one is queued rather than live.
    const queuedUntil = windingDown && !sub?.trial ? sub?.currentPeriodEnd : null;
    try {
      const paid = await subscribeToPlan(plan);
      if (paid) {
        const fresh = await api.getCurrentSubscription().catch(() => null);
        if (fresh) setSub(fresh);
        setNotice(
          upgrading
            ? "Upgraded. Your new plan is live with its full allowance, and the old one has been cancelled — nothing more will be charged on it."
            : queuedUntil
              ? `All set — your new plan starts ${fmtDate(queuedUntil)}, when the current one ends. Nothing changes until then, and you're not billed twice.`
              : "Payment received — your plan is active. Happy painting!",
        );
        router.refresh();
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent("/plan")}`);
        return;
      }
      setError(paymentErrorText(e, "Could not start checkout. Please try again."));
    } finally {
      setBusyPlan(null);
    }
  }

  // Buy points through Razorpay Checkout. Only the COUNT goes to the server, which
  // prices it — the browser never names an amount.
  async function purchasePoints(count: number) {
    setError(null);
    setNotice(null);
    setToppingUp(true);
    try {
      const paid = await buyPoints(count);
      if (paid) {
        const fresh = await api.getRewardPoints().catch(() => null);
        if (fresh) setPoints(fresh);
        setNotice(`${count.toLocaleString("en-IN")} points added — ready to spend, and good for a year.`);
        router.refresh();
      }
    } catch (e) {
      setError(paymentErrorText(e, "Could not complete the purchase."));
    } finally {
      setToppingUp(false);
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
        res.trial
          ? "Your trial won't renew. You keep every remaining day of it."
          : "Your plan will end at the close of the current billing period — everything keeps working until then.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  async function resume() {
    setError(null);
    setNotice(null);
    setResuming(true);
    try {
      const res = await api.resumeSubscription();
      setSub(res);
      setNotice("Your plan will keep renewing.");
      router.refresh();
    } catch (e) {
      // Razorpay can't un-cancel a paid plan, so the backend answers with what to do
      // instead (subscribe again; the current period is unaffected). Surface it as-is.
      setError(e instanceof Error ? e.message : "Could not resume. Please try again.");
    } finally {
      setResuming(false);
    }
  }

  // The backend serves the free tier alongside the paid ones now, so the "choose a plan"
  // cards below have to drop it: it is granted with the account and renewed monthly, and
  // a card for it could only ever carry a button that answers "there's nothing to pay".
  // The tier is still described in full on the pricing page, and the panel above already
  // says when it is the plan you are on.
  //
  // `!== false` rather than a truthy test, so a server too old to send the flag keeps
  // serving only buyable tiers and nothing disappears from this list.
  const purchasable = plans.filter((p) => p.purchasable !== false);

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
            You don&rsquo;t have a plan yet. Pick one below to start creating projects.
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
                  font: "500 12px/1 var(--mono)",
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

            {halted && (
              <div
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
                <p style={{ margin: 0 }}>
                  We couldn&rsquo;t collect your renewal payment, so this plan is paused —
                  new projects and PDF downloads are off until it&rsquo;s sorted. Two ways
                  forward: pay for a plan below to start fresh (we close this one
                  automatically, so you&rsquo;re never charged for both), or end it here and
                  nothing further will be collected.
                </p>
                {!confirmCancel ? (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    style={{ ...buttonStyle, marginTop: 12 }}
                  >
                    End this plan
                  </button>
                ) : (
                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ font: "400 14px/1.4 var(--sans)" }}>
                      End it now? There&rsquo;s no paid time left to lose — the plan already
                      stopped working when the payment failed.
                    </span>
                    <button
                      type="button"
                      onClick={cancel}
                      disabled={cancelling}
                      style={{ ...buttonStyle, borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
                    >
                      {cancelling ? "Ending…" : "Yes, end it"}
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} style={buttonStyle}>
                      Keep it for now
                    </button>
                  </div>
                )}
              </div>
            )}

            {active && (
              <div
                className="r-cols-md-1"
                // Auto-fit rather than three fixed columns: the usage bars have labels of
                // very different lengths, and a hard 1fr 1fr 1fr squeezed them into two
                // wrapped lines at every width between the md breakpoint and full desktop.
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 24,
                  marginTop: 24,
                }}
              >
                <div>
                  <span style={fieldLabel}>Projects this cycle (AI clean-up + auto-mask)</span>
                  <UsageBar
                    used={sub.projectsUsed}
                    limit={sub.projectsLimit
                           + (sub.purchasedProjectCredits ?? 0)
                           + (sub.carriedProjectCredits ?? 0)}
                  />
                  {/* The two kinds of extra are called out separately because they expire
                      differently: bought ones never do, carried-over ones die with this
                      cycle, and a shop planning its month needs to know which it holds. */}
                  {(sub.purchasedProjectCredits ?? 0) > 0 && (
                    <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 4 }}>
                      includes {sub.purchasedProjectCredits} bought extra{(sub.purchasedProjectCredits ?? 0) === 1 ? "" : "s"} — these never expire
                    </span>
                  )}
                  {(sub.carriedProjectCredits ?? 0) > 0 && (
                    <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 4 }}>
                      includes {sub.carriedProjectCredits} carried over from your old plan — use them before this cycle renews
                    </span>
                  )}
                  {(sub.reservedProjects ?? 0) > 0 && (
                    <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)", display: "block", marginTop: 4 }}>
                      {sub.reservedProjects} held for access codes your customers haven&apos;t redeemed yet
                    </span>
                  )}
                </div>
                <div>
                  <span style={fieldLabel}>Colour-board PDF downloads</span>
                  <UsageBar used={sub.pdfDownloadsUsed ?? 0} limit={sub.pdfDownloadsLimit ?? 0} />
                </div>
              </div>
            )}

            {/* Where an extra project is bought, said rather than sold. A project is only
                worth anything at the moment there is a photo to spend it on, and buying one
                here meant a shop could pay, walk away and never spend it — so the purchase
                now lives in the studio, on the upload that is asking for it. */}
            {active && !isUnlimited(sub.projectsLimit) && (
              <p style={{ margin: "20px 0 0", font: "400 13px/1.6 var(--sans)", color: "var(--fg-mute)", maxWidth: "70ch" }}>
                {`Out of allowance mid-cycle? You'll be offered one extra project in the studio, `
                  + `at the moment you upload the photo that needs it`
                  + (points != null
                      ? ` — ${points.projectPrice} points, or ${paise(sub.extraProjectPricePaise ?? 0)}`
                      : "")
                  + `. Each one stays open for ${projectValidDays} days from the day you buy it, `
                  + `and can be assigned to a customer from your shop portal.`}
              </p>
            )}

            {active && onFreePlan && (
              <p style={{ margin: "20px 0 0", font: "400 13px/1.6 var(--sans)", color: "var(--fg-mute)", maxWidth: "70ch" }}>
                Nothing to cancel and nothing to pay — the free plan stays on your account
                and its {sub.projectsLimit} projects come back every month. Colour matching
                is the one tool it doesn&rsquo;t carry; any paid plan below switches it on.
              </p>
            )}

            {active && !onFreePlan && (
              <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {resumable ? (
                  <button type="button" onClick={resume} disabled={resuming} style={buttonStyle}>
                    {resuming ? "Resuming…" : "Keep my trial running"}
                  </button>

                ) : windingDown ? null : !confirmCancel ? (
                  <button type="button" onClick={() => setConfirmCancel(true)} style={buttonStyle}>
                    {sub.trial ? "Cancel trial" : "Cancel subscription"}
                  </button>
                ) : (
                  <>
                    <span style={{ font: "400 14px/1.4 var(--sans)", color: "var(--fg-soft)" }}>
                      {sub.trial
                        ? "Stop your trial from renewing? You keep every remaining day of it."
                        : "End your plan at the close of this billing period? Everything keeps working until then."}
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
                {windingDown && (
                  <span style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
                    {sub.currentPeriodEnd
                      ? `Full access until ${fmtDate(sub.currentPeriodEnd)} — no further charges.`
                      : "Ends at period close — no further charges."}
                    {!sub.trial && (
                      // Razorpay can't un-cancel a paid plan, so say what the way back
                      // actually is rather than offering a button that only errors.
                      <> To keep going, pick a plan below — it starts the day this one
                      ends, so you&rsquo;re never billed for two months at once.</>
                    )}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Points — the only balance. Earned at the kiosk or bought here, spent in the
          studio on the projects that need them. Always rendered when the account can hold
          points at all: a zero balance is exactly the state that needs the top-up controls
          in front of it, and a lapsed shop still tops up here. */}
      {points != null && (
        <section style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 16px" }}>
            <h2 style={{ font: "600 20px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>Points</h2>
            <span style={{ font: "600 18px/1 var(--mono)", color: "var(--accent)" }}>
              {points.balance.toLocaleString("en-IN")}
            </span>
            <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
              Earned {points.pointsPerSale} per kiosk sale, or bought below at{" "}
              {points.rupeesPerPoint === 1 ? "₹1 each" : `₹${points.rupeesPerPoint} each`}. Buys:
              extra project {points.projectPrice} pts, reopen {points.reopenPrice} pts.
              {" "}A project costs fewer points the bigger your plan.
            </span>
          </div>

          {/* Buying. The count is what travels; the server prices it. */}
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {POINT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => void purchasePoints(n)}
                disabled={toppingUp}
                style={{ ...buttonStyle, borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }}
              >
                + {n.toLocaleString("en-IN")} pts · {paise(n * points.rupeesPerPoint * 100)}
              </button>
            ))}
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                inputMode="numeric"
                min={points.minPurchase}
                max={points.maxPurchase}
                step={50}
                placeholder="Points"
                aria-label="How many points to buy"
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
                  const count = Number(customTopUp);
                  if (!Number.isInteger(count) || count <= 0) {
                    setError("Enter how many points to buy.");
                    return;
                  }
                  void purchasePoints(count);
                }}
                disabled={toppingUp}
                style={buttonStyle}
              >
                {toppingUp ? "Opening payment…" : "Buy points"}
              </button>
            </span>
            <span style={{ font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)" }}>
              min {points.minPurchase.toLocaleString("en-IN")} · UPI / cards / netbanking ·
              valid {points.validityDays} days
            </span>
          </div>

          {/* The expiry countdown is the whole reason points are shown as batches. */}
          {points.nextExpiryAt != null && points.nextExpiringPoints != null && (
            <p
              role={daysUntil(points.nextExpiryAt) <= points.expiryWarningDays ? "alert" : undefined}
              style={{
                font: "400 13px/1.5 var(--sans)",
                color: daysUntil(points.nextExpiryAt) <= points.expiryWarningDays
                  ? "var(--terracotta)" : "var(--fg-mute)",
                margin: "12px 0 0",
              }}
            >
              {points.nextExpiringPoints.toLocaleString("en-IN")} point
              {points.nextExpiringPoints === 1 ? "" : "s"} expire on{" "}
              {fmtExpiry(points.nextExpiryAt)} ({daysUntil(points.nextExpiryAt)} day
              {daysUntil(points.nextExpiryAt) === 1 ? "" : "s"} away). Points last{" "}
              {points.validityDays} days from the day you earn them, and spending always
              uses the oldest first.
            </p>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {/* What the balance is FOR, without a way to spend it here. Points are bought on
                this page; the thing they buy is offered in the studio, against the upload
                that needs it, so a project is never paid for before there is a room for it. */}
            <span style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", maxWidth: "70ch" }}>
              {points.balance >= points.projectPrice
                ? `Enough for ${Math.floor(points.balance / points.projectPrice)} extra project${
                    Math.floor(points.balance / points.projectPrice) === 1 ? "" : "s"
                  } — spend them in the studio when an upload runs past your allowance. A bought project stays open for ${projectValidDays} days.`
                : `Not enough for a project yet — that's ${points.projectPrice} points on your plan. A reopen is ${points.reopenPrice}.`}
            </span>
          </div>

          {points.recentActivity.length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={fieldLabel}>Recent points activity</span>
              {points.recentActivity.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  style={{ display: "flex", gap: 12, alignItems: "baseline", font: "400 13px/1.5 var(--sans)", color: "var(--fg-soft)" }}
                >
                  <span style={{ minWidth: 150 }}>{POINTS_LABEL[t.type] ?? t.type}</span>
                  <span style={{ font: "500 13px/1 var(--mono)", color: t.points >= 0 ? "var(--accent)" : "var(--terracotta)" }}>
                    {t.points >= 0 ? "+" : "−"}{Math.abs(t.points)} pts
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
          {ended || !sub || onFreePlan ? "Choose a plan" : "Upgrade or change plan"}
        </h2>
        <p style={{ font: "300 16px/1.6 var(--serif)", color: "var(--fg-soft)", margin: "0 0 18px", maxWidth: "62ch" }}>
          Billed monthly through Razorpay, cancel anytime — and cancelling drops you back
          to the free plan, not to nothing.
          {activePaid
            ? " Upgrading is instant: pay for the bigger plan and it starts straight away with its full allowance, and we cancel the old one for you so you are never billed twice. To move to a smaller plan, cancel first — you keep access to the end of the period — then pick the smaller one."
            : ""}
          {windingDown && !sub?.trial && sub?.currentPeriodEnd
            ? ` Your current plan runs to ${fmtDate(sub.currentPeriodEnd)}; whichever you pick starts that day, so there's no overlap and no double charge.`
            : ""}
        </p>
        <div
          className="r-cols-md-1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}
        >
          {purchasable.map((p) => {
            const isCurrent = activePaid && sub?.plan === p.plan;
            const isUpgrade = activePaid && rankOf(plans, p.plan) > currentRank;
            const isDowngrade = activePaid && !isCurrent && !isUpgrade;
            const isScheduled = windingDown && !sub?.trial;
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
                    {p.monthlyProjectLimit === "unlimited" ? "Unlimited" : p.monthlyProjectLimit}
                    {" "}projects / month — AI clean-up and AI wall detection on every one
                  </li>
                  <li>
                    Extra projects {p.extraProjectPoints} pts / {paise(p.extraProjectPriceWithTaxInPaise)} each
                  </li>
                  <li>
                    {p.monthlyPdfLimit === "unlimited" ? "Unlimited" : p.monthlyPdfLimit} colour-board PDFs
                    {" "}({p.pdfImageLimit} images each)
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => buy(p.plan as PurchasablePlan)}
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
                          : isScheduled
                            ? `Continue with ${p.displayName}`
                            : ended
                              ? "Renew with this plan"
                              : "Get this plan"}
                </button>
                {isUpgrade && (
                  <span style={{ font: "400 12px/1.5 var(--mono)", color: "var(--fg-mute)" }}>
                    Starts immediately · old plan cancelled automatically
                  </span>
                )}
                {isScheduled && (
                  <span style={{ font: "400 12px/1.5 var(--mono)", color: "var(--fg-mute)" }}>
                    {sub?.currentPeriodEnd
                      ? `Starts ${fmtDate(sub.currentPeriodEnd)} · no double billing`
                      : "Starts when your current plan ends · no double billing"}
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
                <span style={{ font: "500 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: statusLabel(h).color }}>
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
