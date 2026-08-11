"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import { formatLimitSymbol, isUnlimited, projectAllowance } from "@/lib/plan-quota";
import { PROJECT_VALID_DAYS } from "@/lib/project-validity";
import type { ProjectPurchaseOptions, SubscriptionSummary } from "@/lib/types";

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
  <Link href="/pricing" style={{ color: "var(--accent)", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
    Subscribe →
  </Link>
);

/**
 * Shows the retailer's current plan + this cycle's usage.
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

  if (!sub) return null;

  // An administrator is not billed and holds no plan — there is no allowance to count
  // down, no period to end and nothing to renew. Rendering the usual strip for them
  // would print "0 / 2147483647 projects this month" beside a plan they never bought.
  if (sub.unbilled) return null;

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
    const validDays = options?.validDays ?? PROJECT_VALID_DAYS;
    return (
      <div style={bannerStyle(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Mono brass>{halted ? "Payment issue" : "Trial ended"}</Mono>
          {/* What is actually true when a plan ends: nothing disappears. Every room is
              still on the dashboard and still opens showing the colours last applied —
              what stops is changing them. Saying "paused" without that made shops think
              their work was gone. */}
          {/* A single project is buyable, but not from here. It is offered in the studio
              against the upload that needs it, so nobody pays for a room they then have to
              remember to start — this banner says the route rather than being it. */}
          <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
            Your projects are view-only — you can still open them and see the colours you
            last applied.{" "}
            {credits > 0
              ? `${credits} project${credits === 1 ? "" : "s"} paid for and ready to start — open the studio and add a photo.`
              : price
                ? `Subscribe to keep working, or add a photo in the studio to buy a single project for ${price} (open ${validDays} days from purchase).`
                : "Subscribe to keep working."}
          </span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {subscribeLink}
        </span>
      </div>
    );
  }

  if (!entitles) return null;

  // Everything spendable this cycle, not just the plan's own allowance: bought extras
  // and projects carried over from a plan the shop upgraded away from are real and
  // usable, and a bar that ignored them read as "full" while runs were still available.
  const limit = formatLimitSymbol(projectAllowance(sub));
  // Projects already spoken for by access codes nobody has used yet. The fraction
  // above is the allowance, so on its own it implied capacity this shop does not have:
  // a plan of 15 with 3 used and 10 held reads "3/15" while the portal will assign 2
  // and creation refuses after 5. Naming the holds is what closes that gap — the same
  // disclosure the subscription panel already makes.
  const held = sub.reservedProjects ?? 0;
  const daysLeft = sub.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - now) / 86_400_000))
    : null;
  // Cancelled, or set to cancel: still fully usable, just not renewing.
  const windingDown = sub.status === "CANCELLED" || !!sub.cancelAtPeriodEnd;
  // The free plan renews on its own, so its period end is a RENEWAL date, not a
  // deadline. Counting it down as "3 days left" beside an upgrade nudge would be the
  // seven-day trial's framing on a plan that has no end — the exact impression the tier
  // was changed to stop giving.
  const onFreePlan = sub.plan === "FREE" && !sub.trial;
  const countsDown = (sub.trial || windingDown) && !onFreePlan;

  // Where the allowance came from, in words.
  //
  // The strip used to read "0/32 PROJECTS THIS MONTH" while the pricing page said
  // Starter includes 15. Both were right — 32 is 15 plus 17 carried over from the
  // plan this one replaced — but nothing on screen said so, so the two pages simply
  // contradicted each other. Spell the sum out wherever the total is not just the
  // plan's own number.
  const carried = sub.carriedProjectCredits ?? 0;
  const purchased = sub.purchasedProjectCredits ?? 0;
  const allowanceParts = [
    `${sub.projectsLimit} this month`,
    carried > 0 ? `${carried} carried over` : null,
    purchased > 0 ? `${purchased} bought` : null,
  ].filter((part): part is string => part !== null);
  // Only worth saying when the total is NOT simply the plan's own number.
  const allowanceNote = isUnlimited(sub.projectsLimit) || allowanceParts.length < 2
    ? null
    : `${allowanceParts.join(" + ")} = ${limit}`;

  return (
    <div style={bannerStyle(countsDown)}>
      {/* Labelled chips, not one monospace run-on. This was a single unbroken
          line — "STARTER PLAN active 0/32 PROJECTS THIS MONTH 17 CARRIED OVER ·
          EXPIRE THIS CYCLE 0/25 PDFS" — with nothing separating one figure from
          the next or saying what any of them counted. */}
      <div className="hv-plan-chips">
        <span className="hv-plan-chip is-plan">
          <Mono brass>{sub.trial ? "Trial" : `${sub.planDisplayName} plan`}</Mono>
          <strong>
            {countsDown && daysLeft !== null
              ? // daysLeft is 0 only when the period end has already passed while the
                // status is still ACTIVE — "0 days left" reads broken at the exact
                // moment the subscribe nudge matters most.
                daysLeft === 0 ? "Ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
              : onFreePlan && daysLeft !== null
                ? daysLeft === 0 ? "Renews today" : `Renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                : "Active"}
          </strong>
        </span>

        <span className="hv-plan-chip" title={allowanceNote ?? undefined}>
          <Mono>Projects this month</Mono>
          <strong>{sub.projectsUsed} of {limit}</strong>
          {allowanceNote && <small>{allowanceNote}</small>}
        </span>

        {held > 0 && (
          <span className="hv-plan-chip">
            <Mono>Held for codes</Mono>
            <strong>{held}</strong>
            <small>not used yet</small>
          </span>
        )}

        {carried > 0 && (
          <span className="hv-plan-chip">
            <Mono>Carried over</Mono>
            <strong>{carried}</strong>
            <small>expire this cycle</small>
          </span>
        )}

        {typeof sub.pdfDownloadsLimit === "number" && sub.pdfDownloadsLimit > 0 && (
          <span className="hv-plan-chip">
            <Mono>Colour boards</Mono>
            <strong>{sub.pdfDownloadsUsed ?? 0} of {formatLimitSymbol(sub.pdfDownloadsLimit)}</strong>
          </span>
        )}
      </div>
      {/* The free plan gets the upgrade link only once the month is actually spent.
          Offering it beside an untouched allowance is selling to someone who has not yet
          run into the limit; offering it at zero remaining is answering the question they
          have just asked. */}
      {(countsDown || (onFreePlan && sub.projectsRemaining <= 0)) && subscribeLink}
    </div>
  );
}
