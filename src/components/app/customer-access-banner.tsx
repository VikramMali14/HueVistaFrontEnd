"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import type { CustomerEntitlement } from "@/lib/types";

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

const redeemLink = (
  <Link
    href="/redeem"
    style={{ color: "var(--accent)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
  >
    Redeem a code →
  </Link>
);

/**
 * The customer counterpart of PlanBanner: shows shop-code access status — no
 * code yet, active (projects left + days left), or expired. Renders nothing
 * while loading or on fetch failure; the studio and API enforce the real rules.
 */
export function CustomerAccessBanner() {
  // undefined = loading, null = no entitlement, "error" = fetch failed (render nothing)
  const [ent, setEnt] = useState<CustomerEntitlement | null | "error" | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getMyEntitlement()
      .then((e) => !cancelled && setEnt(e ?? null))
      .catch(() => !cancelled && setEnt("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (ent === undefined || ent === "error") return null;

  if (ent === null) {
    return (
      <div style={bannerStyle(false)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>Shop access</Mono>
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            The studio unlocks with an access code from your paint shop — ask at the counter.
          </span>
        </span>
        {redeemLink}
      </div>
    );
  }

  if (ent.expired) {
    return (
      <div style={bannerStyle(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>Access ended</Mono>
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            Your access window has closed. A fresh code from your shop brings your work right back.
          </span>
        </span>
        {redeemLink}
      </div>
    );
  }

  const daysLeft = ent.accessExpiresAt
    ? Math.max(0, Math.ceil((new Date(ent.accessExpiresAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div style={bannerStyle(false)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono brass>Shop access</Mono>
        <span style={{ font: "400 15px/1 var(--sans)", color: "var(--fg-soft)" }}>
          {ent.projectsRemaining} project{ent.projectsRemaining === 1 ? "" : "s"} left
          {daysLeft !== null ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} of access` : ""}
        </span>
      </span>
    </div>
  );
}
