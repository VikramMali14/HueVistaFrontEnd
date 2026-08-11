"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { buyOneProject } from "@/lib/payments";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";

/** Paise → a rupee figure for a sentence ("₹99", "₹9", "₹49.50"). */
function rupees(paise: number): string {
  return paise % 100 === 0 ? `₹${paise / 100}` : `₹${(paise / 100).toFixed(2)}`;
}

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

const unlockLink = (
  <Link
    href="/unlock"
    style={{ color: "var(--accent)", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
  >
    Unlock with a code →
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

  if (ent === undefined || ent === "error") return null;

  // No entitlement at all: this account signed up on its own rather than being onboarded
  // by a shop, so there is no shop to ask. Both routes are offered — a code if one was
  // given, and otherwise buying a project outright, which is the only route an account
  // with nobody behind it has. Naming a shop it does not have was a dead end.
  if (ent === null) {
    const credits = options?.availableCredits ?? 0;
    return (
      <div style={bannerStyle(credits <= 0)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>{credits > 0 ? "Ready to start" : "No access yet"}</Mono>
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            {credits > 0
              ? `${credits} project${credits === 1 ? "" : "s"} paid for and ready — start one whenever you like.`
              : options
                ? `Buy a project for ${rupees(options.projectPricePaise)} and it stays open for ${options.validDays} days. Got a code from a paint shop? Unlock with that instead.`
                : "Buy a project to start, or unlock with a code from your paint shop."}
          </span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {credits <= 0 && (
            <BuyProjectButton
              options={options}
              onBought={(fresh) => setOptions(fresh)}
            />
          )}
          {unlockLink}
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
        {unlockLink}
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
      {noneLeft && unlockLink}
    </div>
  );
}

/**
 * Buy one project with a card, for a customer who has no shop behind them.
 *
 * Deliberately NOT offered to a customer a shop onboarded: their projects come out of
 * that shop's quota, the shop adds another in one click, and selling them one directly
 * would take money for something their shop is already responsible for. The backend
 * enforces the same split — this is the surface for the accounts it leaves to pay for
 * themselves.
 *
 * The price is never named by the browser: it is read from the server's own quote for
 * the label, and the order is priced server-side again when it is created.
 */
function BuyProjectButton({
  options,
  onBought,
}: {
  options: ProjectPurchaseOptions | null;
  onBought: (fresh: ProjectPurchaseOptions) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const fresh = await buyOneProject();
      // null = the buyer closed Checkout without paying. Not an error, and saying
      // nothing is the right response to someone who chose not to buy.
      if (fresh) onBought(fresh);
    } catch (e) {
      setError(
        e instanceof HttpError ? e.message : "Could not start the payment. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          border: "1px solid var(--accent)",
          background: "transparent",
          color: "var(--accent)",
          font: "400 12px/1 var(--mono)",
          letterSpacing: ".18em",
          textTransform: "uppercase",
          cursor: busy ? "progress" : "pointer",
        }}
      >
        {busy ? (
          <><Spinner size={12} color="currentColor" /> Opening…</>
        ) : (
          <>Buy a project{options ? ` · ${rupees(options.projectPricePaise)}` : ""} →</>
        )}
      </button>
      {error && (
        <span role="alert" style={{ font: "400 13px/1.4 var(--sans)", color: "var(--danger, #c0392b)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
