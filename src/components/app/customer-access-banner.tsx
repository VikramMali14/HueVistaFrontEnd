"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Button, LinkButton } from "@/components/ui/button";
import { api } from "@/lib/api";
import { buyOneProject } from "@/lib/payments";
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
    style={{ color: "var(--accent)", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
  >
    Redeem a code →
  </Link>
);

/**
 * The customer counterpart of PlanBanner: shows shop-code access status — no shop
 * behind the account at all, active (projects left + days left), or expired. Renders
 * nothing while loading or on fetch failure; the studio and API enforce the real rules.
 *
 * The first of those states carries a buy button, the other two do not, and the split is
 * the point. A customer a shop onboarded has projects their shop assigned and paid for
 * out of its own quota — the shop adds another in one click, so selling them one direct
 * would charge for something the counter is already responsible for. An account with no
 * shop has nobody to ask, and the purchase is the only door it has.
 */
export function CustomerAccessBanner() {
  // undefined = loading, null = no entitlement, "error" = fetch failed (render nothing)
  const [ent, setEnt] = useState<CustomerEntitlement | null | "error" | undefined>(undefined);
  const [options, setOptions] = useState<ProjectPurchaseOptions | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  // Mount-time clock for the days-left maths — render stays pure.
  const [now] = useState(() => Date.now());

  /**
   * Buy one project by card. The price is set server-side from the caller's plan (the
   * no-plan rate for an account with none), so nothing about the amount travels from
   * here. A closed Checkout resolves null — a change of mind, not a failure — and the
   * refreshed options land the new credit in the banner, which then reads "ready to
   * start" instead of offering the same purchase again.
   */
  async function buy() {
    setBuyError(null);
    setBuying(true);
    try {
      const paid = await buyOneProject();
      if (paid) setOptions(paid);
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Payment could not be completed.");
    } finally {
      setBuying(false);
    }
  }

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

  if (ent === undefined || ent === "error") return null;

  // No entitlement at all: this account signed up on its own rather than being onboarded
  // by a shop. Nobody issued it a code and there is no counter behind it, so "ask your
  // paint shop" is not an instruction it can follow — which is what this banner used to
  // say, on the since-outdated grounds that everything chargeable was paid in points.
  //
  // It is not: /api/billing/projects sells one project for money at the no-plan rate and
  // lands it as a standalone credit, which is exactly what such an account creates
  // projects from. So the buy button belongs here, next to the code — the two routes in,
  // for the two kinds of person who land on this banner.
  if (ent === null) {
    const credits = options?.availableCredits ?? 0;
    const paise = options?.projectPricePaise ?? 0;
    return (
      <div style={bannerStyle(false)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>{credits > 0 ? "Ready to start" : "No access yet"}</Mono>
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            {credits > 0
              ? `${credits} project${credits === 1 ? "" : "s"} paid for and ready — start one whenever you like.`
              // Without a price there is no buy button, so the copy must not promise one:
              // the options fetch is best-effort and the code is the route that survives it.
              : paise > 0
                ? "Buy a single project to start, or redeem a code if your paint shop has given you one."
                : "Redeem a code from your paint shop to start."}
          </span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Already paid for: the next step is the studio, not the checkout. Offering
              "buy" again to someone holding an unused credit sells them a second one. */}
          {credits > 0 ? (
            <LinkButton href="/studio" variant="brass" size="sm">
              Start a project <span className="arr">→</span>
            </LinkButton>
          ) : (
            paise > 0 && (
              <Button variant="brass" size="sm" disabled={buying} onClick={() => void buy()}>
                {buying ? "Opening checkout…" : `Buy a project · ₹${(paise / 100).toLocaleString("en-IN")}`}
              </Button>
            )
          )}
          {redeemLink}
        </span>
        {/* What the money buys, said before it is spent rather than discovered a month
            later: a bought project opens a window, it is not a standing entitlement. */}
        {credits === 0 && paise > 0 && options && (
          <span style={{ flexBasis: "100%", font: "400 12px/1.5 var(--mono)", color: "var(--fg-mute)" }}>
            Stays open for {options.validDays} days.
          </span>
        )}
        {buyError && (
          <span role="alert" style={{ flexBasis: "100%", font: "400 13px/1.4 var(--sans)", color: "var(--terracotta)" }}>
            {buyError}
          </span>
        )}
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
