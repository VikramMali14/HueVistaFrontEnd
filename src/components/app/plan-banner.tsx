"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import type { SubscriptionSummary } from "@/lib/types";

const UNLIMITED = 2147483647; // Integer.MAX_VALUE (Enterprise)

/**
 * Shows the retailer's current plan / free-trial status + AI-render usage. Renders
 * nothing for accounts without an active subscription (e.g. customers, or a lapsed
 * trial). Reflects the new "free trial on signup" funnel.
 */
export function PlanBanner() {
  const [sub, setSub] = useState<SubscriptionSummary | null | undefined>(undefined);

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

  if (!sub || sub.status !== "ACTIVE") return null;

  const limit = sub.aiGenerationsLimit >= UNLIMITED ? "∞" : sub.aiGenerationsLimit;
  const daysLeft = sub.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 32,
        border: "1px solid var(--rule-strong)",
        background: sub.trial ? "rgba(29,78,216,.06)" : "var(--surface-soft)",
        borderRadius: 8,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono brass>{sub.trial ? "Free trial" : `${sub.planDisplayName} plan`}</Mono>
        <span style={{ font: "300 italic 15px/1 var(--serif)", color: "var(--fg-soft)" }}>
          {sub.trial && daysLeft !== null
            ? `${sub.planDisplayName} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
            : "active"}
        </span>
        <Mono>
          {sub.aiGenerationsUsed}/{limit} AI renders this cycle
        </Mono>
      </span>
      {sub.trial && (
        <Link href="/pricing" style={{ color: "var(--accent)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
          Subscribe →
        </Link>
      )}
    </div>
  );
}
