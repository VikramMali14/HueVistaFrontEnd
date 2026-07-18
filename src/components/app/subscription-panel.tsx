"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HttpError } from "@/lib/http-error";
import { subscribeToPlan } from "@/lib/payments";
import type { PlanOption, PurchasablePlan, SubscriptionSummary } from "@/lib/types";

interface SubscriptionPanelProps {
  initialSubscription: SubscriptionSummary | null;
  history: SubscriptionSummary[];
  plans: PlanOption[];
}

const UNLIMITED_FLOOR = 2_000_000_000;

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
  if (s.status === "CANCELLED") return { text: "Cancelled", color: "var(--fg-mute)" };
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = sub?.status === "ACTIVE";
  const ended = sub != null && !active;

  async function buy(plan: PurchasablePlan) {
    setError(null);
    setNotice(null);
    setBusyPlan(plan);
    try {
      const paid = await subscribeToPlan(plan);
      if (paid) {
        const fresh = await api.getCurrentSubscription().catch(() => null);
        if (fresh) setSub(fresh);
        setNotice("Payment received — your plan is active. Happy painting!");
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
            You don&rsquo;t have a subscription yet. Pick a plan below to unlock AI previews
            and colour boards.
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
                Your subscription has ended, so AI previews are paused. Choose a plan below and
                pay to start a fresh one — you&rsquo;ll be active again the moment the payment
                completes.
              </p>
            )}

            {active && (
              <div
                className="r-cols-md-1"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}
              >
                <div>
                  <span style={fieldLabel}>AI image previews this cycle</span>
                  <UsageBar used={sub.aiGenerationsUsed} limit={sub.aiGenerationsLimit} />
                </div>
                <div>
                  <span style={fieldLabel}>Colour-board PDF downloads</span>
                  <UsageBar used={sub.pdfDownloadsUsed ?? 0} limit={sub.pdfDownloadsLimit ?? 0} />
                </div>
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

      {/* Plans: upgrade / renew */}
      <section>
        <h2 style={{ font: "600 20px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 6px" }}>
          {ended || !sub ? "Choose a plan" : "Upgrade or change plan"}
        </h2>
        <p style={{ font: "300 16px/1.6 var(--serif)", color: "var(--fg-soft)", margin: "0 0 18px", maxWidth: "58ch" }}>
          Billed monthly through Razorpay, cancel anytime.
          {active && !sub?.trial
            ? " To switch plans, cancel your current one first — it stays active till the period ends."
            : ""}
        </p>
        <div
          className="r-cols-md-1"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}
        >
          {purchasable.map((p) => {
            const isCurrent = active && sub?.plan === p.plan && !sub?.trial;
            return (
              <div key={p.plan} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <h3 style={{ font: "600 18px/1.2 var(--serif)", color: "var(--fg)", margin: 0 }}>
                    {p.displayName}
                  </h3>
                  <span style={{ font: "400 15px/1 var(--mono)", color: "var(--fg-soft)" }}>
                    ₹{p.priceInRupees.toLocaleString("en-IN")}/mo
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, font: "400 14px/1.7 var(--sans)", color: "var(--fg-soft)" }}>
                  <li>{p.monthlyAiLimit === "unlimited" ? "Unlimited" : p.monthlyAiLimit} AI previews / month</li>
                  <li>
                    {p.monthlyPdfLimit === "unlimited" ? "Unlimited" : p.monthlyPdfLimit} colour-board PDFs
                    {" "}({p.pdfImageLimit} images each)
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => buy(p.plan)}
                  disabled={busyPlan !== null || isCurrent || (active && !sub?.trial)}
                  style={{
                    ...buttonStyle,
                    marginTop: "auto",
                    ...(isCurrent
                      ? {}
                      : { borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }),
                  }}
                >
                  {isCurrent
                    ? "Current plan"
                    : busyPlan === p.plan
                      ? "Opening checkout…"
                      : ended
                        ? "Renew with this plan"
                        : "Get this plan"}
                </button>
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
