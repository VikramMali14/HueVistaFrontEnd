"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ProjectPurchaseOptions, SubscriptionSummary } from "@/lib/types";

const UNLIMITED = 2147483647; // Integer.MAX_VALUE (Enterprise)

const bannerStyle = (highlight: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  padding: "12px 16px",
  marginBottom: 32,
  border: "1px solid " + (highlight ? "var(--accent)" : "var(--rule-strong)"),
  background: "var(--surface-soft)",
  borderRadius: 8,
});

const subscribeLink = (
  <Link href="/pricing" style={{ color: "var(--accent)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
    Subscribe →
  </Link>
);

/**
 * Shows the retailer's current plan / free-trial status + AI-preview usage.
 * Renders nothing only for accounts without a subscription at all (e.g.
 * customers). A lapsed or halted subscription keeps the banner visible with a
 * path to pay — that's the moment the upgrade prompt matters most.
 *
 * What counts as "current" is the backend entitlement gate, not the ACTIVE status:
 * a cancelled plan keeps working to the end of the period it was paid for, and a
 * plan bought to start later isn't in force yet.
 */
export function PlanBanner() {
  const [sub, setSub] = useState<SubscriptionSummary | null | undefined>(undefined);
  const [options, setOptions] = useState<ProjectPurchaseOptions | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Mount-time clock for the days-left maths — render stays pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getCurrentSubscription()
      .then((s) => !cancelled && setSub(s))
      .catch(() => !cancelled && setSub(null)); // 404 = no subscription
    // Prices are advisory here; a failure just means the banner names no figure.
    api
      .getProjectPurchaseOptions()
      .then((o) => !cancelled && setOptions(o))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function buyProject() {
    setBuying(true);
    setBuyError(null);
    try {
      // Points, not a checkout — the money was paid when the points were bought or
      // earned, so this is a balance debit that either succeeds or 402s.
      setOptions(await api.pointsPayProjectCredit());
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Could not spend your points.");
    } finally {
      setBuying(false);
    }
  }

  if (!sub) return null;

  // Mirrors the backend entitlement gate (and the subscription panel): ACTIVE, or
  // CANCELLED but still inside the period the shop paid for, and started either way.
  // Testing status === "ACTIVE" alone left this blank for a cancelled plan — no usage
  // for one still running, and, once it lapsed, no "subscribe" prompt at all at exactly
  // the moment it matters most.
  const startedYet = sub.currentPeriodStart == null
    || new Date(sub.currentPeriodStart).getTime() <= now;
  const withinPaidPeriod = sub.currentPeriodEnd != null
    && new Date(sub.currentPeriodEnd).getTime() > now;
  const entitles = startedYet
    && (sub.status === "ACTIVE" || (sub.status === "CANCELLED" && withinPaidPeriod));

  // A plan bought to replace one that is winding down bills from the day that period
  // ends. Until then the shop is still on the old plan, which has its own banner.
  if (!startedYet) return null;

  if (!entitles && sub.status !== "CREATED") {
    const halted = sub.status === "HALTED";
    const price = options ? `${options.projectPricePoints} points` : null;
    const credits = options?.availableCredits ?? 0;
    return (
      <div style={bannerStyle(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>{halted ? "Payment issue" : "Trial ended"}</Mono>
          {/* What is actually true when a plan ends: nothing disappears. Every room is
              still on the dashboard and still opens showing the colours last applied —
              what stops is changing them. Saying "paused" without that made shops think
              their work was gone. */}
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            Your projects are view-only — you can still open them and see the colours you
            last applied.{" "}
            {credits > 0
              ? `${credits} project${credits === 1 ? "" : "s"} paid for and ready to start.`
              : price
                ? `Subscribe to keep working, or buy a single project for ${price} (open ${options!.validDays} days).`
                : "Subscribe to keep working."}
          </span>
          {buyError && (
            <span className="field-error" role="alert" style={{ flexBasis: "100%" }}>
              {buyError}
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {credits === 0 && price && (
            <Button size="sm" variant="ghost" disabled={buying} onClick={() => void buyProject()}>
              {buying ? "Opening…" : `Buy a project · ${price}`}
            </Button>
          )}
          {subscribeLink}
        </span>
      </div>
    );
  }

  if (!entitles) return null;

  // Everything spendable this cycle, not just the plan's own allowance: bought extras
  // and projects carried over from a plan the shop upgraded away from are real and
  // usable, and a bar that ignored them read as "full" while runs were still available.
  const extraCredits = (sub.purchasedProjectCredits ?? 0) + (sub.carriedProjectCredits ?? 0);
  const limit = sub.projectsLimit >= UNLIMITED ? "∞" : sub.projectsLimit + extraCredits;
  const daysLeft = sub.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now) / 86_400_000))
    : null;
  // Cancelled, or set to cancel: still fully usable, just not renewing.
  const windingDown = sub.status === "CANCELLED" || !!sub.cancelAtPeriodEnd;

  return (
    <div style={bannerStyle(sub.trial || windingDown)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono brass>{sub.trial ? "Free trial" : `${sub.planDisplayName} plan`}</Mono>
        <span style={{ font: "400 15px/1 var(--sans)", color: "var(--fg-soft)" }}>
          {(sub.trial || windingDown) && daysLeft !== null
            ? `${sub.planDisplayName} · ${
                // daysLeft is 0 only when the period end has already passed while the
                // status is still ACTIVE — "0 days left" reads broken at the exact
                // moment the subscribe nudge matters most.
                daysLeft === 0
                  ? "ends today"
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
              }`
            : "active"}
        </span>
        <Mono>
          {sub.projectsUsed}/{limit} projects this month
        </Mono>
        {(sub.carriedProjectCredits ?? 0) > 0 && (
          <Mono>
            {sub.carriedProjectCredits} carried over · expire this cycle
          </Mono>
        )}
        {typeof sub.pdfDownloadsLimit === "number" && sub.pdfDownloadsLimit > 0 && (
          <Mono>
            {sub.pdfDownloadsUsed ?? 0}/{sub.pdfDownloadsLimit >= UNLIMITED ? "∞" : sub.pdfDownloadsLimit} PDFs
          </Mono>
        )}
      </span>
      {(sub.trial || windingDown) && subscribeLink}
    </div>
  );
}
