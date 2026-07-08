"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import type { SubscriptionSummary } from "@/lib/types";

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
 */
export function PlanBanner() {
  const [sub, setSub] = useState<SubscriptionSummary | null | undefined>(undefined);
  // Mount-time clock for the days-left maths — render stays pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getCurrentSubscription()
      .then((s) => !cancelled && setSub(s))
      .catch(() => !cancelled && setSub(null)); // 404 = no subscription
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sub) return null;

  if (sub.status === "EXPIRED" || sub.status === "COMPLETED" || sub.status === "HALTED") {
    const halted = sub.status === "HALTED";
    return (
      <div style={bannerStyle(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>{halted ? "Payment issue" : "Trial ended"}</Mono>
          <span style={{ font: "400 15px/1 var(--sans)", color: "var(--fg-soft)" }}>
            AI previews are paused. Subscribe to keep working.
          </span>
        </span>
        {subscribeLink}
      </div>
    );
  }

  if (sub.status !== "ACTIVE") return null;

  const limit = sub.aiGenerationsLimit >= UNLIMITED ? "∞" : sub.aiGenerationsLimit;
  const daysLeft = sub.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now) / 86_400_000))
    : null;

  return (
    <div style={bannerStyle(sub.trial)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono brass>{sub.trial ? "Free trial" : `${sub.planDisplayName} plan`}</Mono>
        <span style={{ font: "400 15px/1 var(--sans)", color: "var(--fg-soft)" }}>
          {sub.trial && daysLeft !== null
            ? `${sub.planDisplayName} · ${
                // daysLeft is 0 only when the period end has already passed while the
                // status is still ACTIVE — "0 days left" reads broken at the exact
                // moment the subscribe nudge matters most.
                daysLeft === 0 ? "ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
              }`
            : "active"}
        </span>
        <Mono>
          {sub.aiGenerationsUsed}/{limit} AI previews this month
        </Mono>
      </span>
      {sub.trial && subscribeLink}
    </div>
  );
}
