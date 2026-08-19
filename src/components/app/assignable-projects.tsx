"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import { isUnlimited, projectsAvailable } from "@/lib/plan-quota";
import { PROJECT_VALID_DAYS } from "@/lib/project-validity";
import type { ProjectPurchaseOptions, SubscriptionSummary } from "@/lib/types";

/**
 * How many projects this shop can still hand to a customer, and where they came from.
 *
 * A shop assigning projects is spending the same pool it paints from, and the extras it
 * bought are part of that pool — the backend counts them in the reservation, and pulls
 * across any bought while the shop was between plans. None of that was visible on the
 * screens where the assigning happens, so a shop that had bought three extras still read
 * "not enough quota" as "I have to subscribe to a bigger plan".
 *
 * Best-effort and self-contained: both grant surfaces render it, and neither should fail
 * or stall because a count could not be fetched. Nothing renders until it is known.
 *
 * @param reloadKey bump it to refetch. This panel states a POOL, and the screens that
 *        render it are the screens that spend from it — granting a project to a customer
 *        takes one out of the very number printed here. Fetching once on mount meant the
 *        line above the table kept saying "5 projects available to assign" while the shop
 *        clicked its way through all five, and only a page reload ever corrected it.
 */
export function AssignableProjects({ reloadKey = 0 }: { reloadKey?: number } = {}) {
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [options, setOptions] = useState<ProjectPurchaseOptions | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getCurrentSubscription().catch(() => null),
      api.getProjectPurchaseOptions().catch(() => null),
    ]).then(([s, o]) => {
      if (cancelled) return;
      setSub(s);
      setOptions(o);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (!loaded || !sub) return null;

  const bought = sub.purchasedProjectCredits ?? 0;
  // Standalone credits — extras bought while the shop had no plan. The backend moves
  // these onto the plan when an assignment needs them, so they count here too.
  const ledger = options?.availableCredits ?? 0;
  const unlimited = isUnlimited(sub.projectsLimit);
  // projectsAvailable is the backend's own figure — the one the quota gate enforces —
  // so this panel and the gate can never disagree about what is assignable.
  const left = unlimited ? Number.POSITIVE_INFINITY : projectsAvailable(sub) + ledger;
  const extras = bought + ledger;

  if (unlimited) {
    return <Mono>Unlimited projects on your plan — assign as many as you like.</Mono>;
  }

  if (left === 0) {
    return (
      <Mono>
        Nothing left to assign this cycle. Buy another project in the studio — it stays
        open for {options?.validDays ?? PROJECT_VALID_DAYS} days and can be assigned here.
      </Mono>
    );
  }

  return (
    <Mono>
      {left} project{left === 1 ? "" : "s"} available to assign
      {extras > 0
        ? ` · includes ${extras} you bought (these never expire, and can go to any customer)`
        : ""}
    </Mono>
  );
}
