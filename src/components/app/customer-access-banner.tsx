"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";

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
  const [options, setOptions] = useState<ProjectPurchaseOptions | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Mount-time clock for the days-left maths — render stays pure.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getMyEntitlement()
      .then((e) => !cancelled && setEnt(e ?? null))
      .catch(() => !cancelled && setEnt("error"));
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
      const { buyExtraProject } = await import("@/lib/payments");
      const paid = await buyExtraProject();
      if (paid) setOptions(await api.getProjectPurchaseOptions());
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBuying(false);
    }
  }

  if (ent === undefined || ent === "error") return null;

  // No entitlement at all: this account signed up on its own rather than being
  // onboarded by a shop. There are two honest routes open to them — a code from a
  // paint shop, or buying a project outright — and offering only the first strands
  // anyone who doesn't have a shop to walk into.
  if (ent === null) {
    const price = options ? `₹${Math.round(options.projectPricePaise / 100)}` : null;
    const credits = options?.availableCredits ?? 0;
    return (
      <div style={bannerStyle(false)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>No subscription</Mono>
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            {credits > 0
              ? `${credits} project${credits === 1 ? "" : "s"} paid for and ready — start one whenever you like.`
              : price
                ? `Each project is ${price} and stays open for ${options!.validDays} days. Have a code from your paint shop? Redeem it instead.`
                : "Buy a project to start, or redeem a code from your paint shop."}
          </span>
          {buyError && (
            <span className="field-error" role="alert" style={{ flexBasis: "100%" }}>
              {buyError}
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {credits === 0 && (
            <Button size="sm" variant="ghost" disabled={buying} onClick={() => void buyProject()}>
              {buying ? "Opening…" : price ? `Buy a project · ${price}` : "Buy a project"}
            </Button>
          )}
          {redeemLink}
        </span>
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
    ? Math.max(0, Math.ceil((new Date(ent.accessExpiresAt).getTime() - now) / 86_400_000))
    : null;

  // Show the deduction, not just the remainder: "1 of 3 projects used" tells the
  // customer their shop assigned three and one is gone, which a bare "2 left" doesn't.
  const used = ent.projectsCreated;
  const allowance = ent.projectAllowance;
  const noneLeft = ent.projectsRemaining <= 0;

  return (
    <div style={bannerStyle(noneLeft)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono brass>Shop access</Mono>
        <span style={{ font: "400 15px/1 var(--sans)", color: "var(--fg-soft)" }}>
          {used} of {allowance} project{allowance === 1 ? "" : "s"} used
          {noneLeft ? "" : ` · ${ent.projectsRemaining} left`}
          {daysLeft !== null ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} of access` : ""}
        </span>
      </span>
      {noneLeft && redeemLink}
    </div>
  );
}
