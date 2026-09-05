"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, HttpError } from "@/lib/api";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ALL, FilterBar, matchesQuery } from "@/components/ui/filter-bar";
import { AssignableProjects } from "@/components/app/assignable-projects";
import type { CustomerEntitlement, OrgResponse, ProjectGrant } from "@/lib/types";

function formatAccessLeft(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  // Don't tack a redundant "0 h" onto whole-day spans (was "87 d 0 h"); and never
  // show a bare "0 h" in the last hour — fall back to minutes.
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return `${hours} h`;
  return `${Math.max(1, Math.floor((ms % 3_600_000) / 60_000))} m`;
}

/**
 * How many projects this customer has left.
 *
 * `projectsRemaining` is the backend's own figure and the one to trust; the subtraction
 * is only a fallback for a payload that predates it. Stated once because the filter and
 * the counts printed on that filter's buttons have to agree — two copies of this
 * expression is how a facet comes to say "3" and then show four rows.
 */
function remainingFor(c: CustomerEntitlement): number {
  return c.projectsRemaining ?? c.projectAllowance - c.projectsCreated;
}

/**
 * The most recent grant to this customer that can still be taken back.
 *
 * MOST RECENT matters, and picking the first match in the array is not the same thing:
 * the backend returns the ledger in its own order, and a shop that has granted the same
 * person three projects over a month means "undo the one I just did" when they press
 * Take back — not "undo the oldest one still eligible". Both rows are revocable, so
 * nothing failed; the shop simply watched the wrong grant disappear.
 *
 * A grant with no timestamp sorts oldest, so it can only ever be chosen when it is the
 * only candidate.
 */
function latestRevocableFor(grants: ProjectGrant[], customerId: string): ProjectGrant | null {
  let best: ProjectGrant | null = null;
  let bestAt = -Infinity;
  for (const g of grants) {
    if (g.customerUserId !== customerId || !g.revocable) continue;
    const at = g.createdAt ? new Date(g.createdAt).getTime() : NaN;
    const when = Number.isNaN(at) ? -Infinity : at;
    if (best === null || when > bestAt) {
      best = g;
      bestAt = when;
    }
  }
  return best;
}

/**
 * Live list of the customers a retailer has onboarded (via access codes), with each
 * customer's project usage, access validity, and a "grant another project" action.
 * Talks to the backend through the same-origin BFF.
 *
 * `org` comes from the portal page's single org fetch (null = resolved, no
 * shop); when undefined the component falls back to fetching the orgs itself.
 */
export function RetailerCustomers({ org: orgProp }: { org?: OrgResponse | null }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomerEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Two errors, because they are two different situations and one screen.
   *
   * `loadError` means the customer list itself could not be fetched — there is nothing
   * to show, so it replaces the table and offers Retry. `actionError` means ONE grant or
   * take-back was refused, which is a normal outcome (a lapsed plan, an exhausted pool)
   * and says nothing about the rows already on screen. They shared a field, so a refused
   * grant took the entire customer list off the page and left the shop looking at
   * "Could not grant a project · Retry" where their customers had been.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  // Bumped after anything that spends from the assignable pool, so the line stating
  // that pool is refetched rather than left describing the state before the click.
  const [poolKey, setPoolKey] = useState(0);
  // What this shop has given away, so a row can offer "take back" only when there is
  // genuinely something to take back. Best-effort: a failure just hides the action.
  const [grants, setGrants] = useState<ProjectGrant[]>([]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [usage, setUsage] = useState(ALL);

  const visible = useMemo(
    () =>
      rows.filter((c) => {
        if (status === "active" && c.expired) return false;
        if (status === "expired" && !c.expired) return false;
        if (usage === "left" && remainingFor(c) <= 0) return false;
        if (usage === "used-up" && remainingFor(c) > 0) return false;
        return matchesQuery(query, c.customerName, c.customerEmail);
      }),
    [rows, query, status, usage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      // Strictly the RETAILER org — the other portal sections do the same, so
      // falling back to orgs[0] here made an admin with only a DISTRIBUTOR org
      // see this one section populated while the rest said "no shop".
      const retailer =
        orgProp !== undefined
          ? orgProp
          : ((await api.listMyOrgs()).find((o) => o.type === "RETAILER") ?? null);
      if (!retailer) {
        setOrgId(null);
        setRows([]);
        return;
      }
      setOrgId(retailer.id);
      setRows(await api.listCustomers(retailer.id));
      // Best-effort: without it the rows simply never offer "take back".
      setGrants(await api.listProjectGrants(retailer.id).catch(() => []));
    } catch (err) {
      setLoadError(err instanceof HttpError ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [orgProp]);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = useCallback(
    async (customerId: string) => {
      if (!orgId) return;
      setGrantingId(customerId);
      setActionError(null);
      try {
        const updated = await api.grantProject(orgId, customerId);
        setRows((prev) => prev.map((r) => (r.customerId === customerId ? updated : r)));
        // Functional, and no `grants` in the dependency list: reading the old array
        // through the closure meant this callback was rebuilt on every grant load, and
        // a failed refresh restored whatever `grants` happened to be when the click
        // started rather than what the list holds now.
        const refreshed = await api.listProjectGrants(orgId).catch(() => null);
        if (refreshed) setGrants(refreshed);
        // A project just left the shop's pool. The line above the table states that
        // pool, so it has to be asked again.
        setPoolKey((k) => k + 1);
      } catch (err) {
        // Granting costs a project, drawn from the month's allowance or from an extra the
        // shop bought, so a lapsed plan or an exhausted pool is a real refusal rather than
        // a bug — the backend's message says which. It is reported ABOVE the table, not
        // instead of it: the rows are still perfectly good.
        setActionError(err instanceof Error ? err.message : "Could not grant a project.");
      } finally {
        setGrantingId(null);
      }
    },
    [orgId],
  );

  /**
   * Take back the most recent still-revocable grant for this customer.
   *
   * The shop thinks in customers, not ledger rows — "I gave Priya one too many" — so the
   * row action reverses their last undoable grant to that person rather than making them
   * pick from a list. Anything used, or funded by a billing period that has since
   * renewed, is not offered at all.
   */
  const takeBack = useCallback(
    async (customerId: string) => {
      if (!orgId) return;
      const grant = latestRevocableFor(grants, customerId);
      if (!grant) return;
      setGrantingId(customerId);
      setActionError(null);
      try {
        await api.revokeProjectGrant(orgId, grant.id);
        const [customers, refreshed] = await Promise.all([
          api.listCustomers(orgId),
          api.listProjectGrants(orgId),
        ]);
        setRows(customers);
        setGrants(refreshed);
        // The project is back in the pool the line above the table counts.
        setPoolKey((k) => k + 1);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Could not take that grant back.");
      } finally {
        setGrantingId(null);
      }
    },
    [orgId, grants],
  );

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading customers…</Mono>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ color: "var(--fg-mute)" }}>
        <Mono>{loadError}</Mono>{" "}
        <button
          type="button"
          onClick={() => void load()}
          style={{ background: "none", border: "none", color: "var(--accent-text)", cursor: "pointer", textDecoration: "underline" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ font: "400 18px/1.6 var(--sans)", color: "var(--fg-soft)" }}>
        No customers have used an access code yet.
      </p>
    );
  }

  return (
    <>
    {/* What there is left to grant, said before the shop clicks a row and finds out.
        Extras it bought count — granting draws on the same pool painting does. Keyed to
        the grants made on this screen so the figure follows them down. */}
    <div style={{ marginBottom: 12 }}>
      <AssignableProjects reloadKey={poolKey} />
    </div>
    {/* One refused grant, reported where it happened. Not in place of the table: the
        customers are still there, and the shop's next move is usually to try the row
        below this one. */}
    {actionError && (
      <p
        role="alert"
        style={{ margin: "0 0 12px", font: "400 14px/1.5 var(--sans)", color: "var(--danger, #c0392b)" }}
      >
        {actionError}
      </p>
    )}
    <FilterBar
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search customer or e-mail"
      facets={[
        {
          id: "status",
          label: "Access",
          value: status,
          onChange: setStatus,
          allLabel: "Any access",
          options: [
            { value: "active", label: "Active", count: rows.filter((c) => !c.expired).length },
            { value: "expired", label: "Expired", count: rows.filter((c) => c.expired).length },
          ],
        },
        {
          id: "usage",
          label: "Projects",
          value: usage,
          onChange: setUsage,
          allLabel: "Any usage",
          // Counted, like the facet beside it. One filter offering numbers and the
          // other offering bare labels reads as though the second is still loading —
          // and the count is the thing a shop is actually after ("how many of my
          // customers have run out?"), which they were having to get by clicking.
          options: [
            { value: "left", label: "Slots left", count: rows.filter((c) => remainingFor(c) > 0).length },
            { value: "used-up", label: "Fully used", count: rows.filter((c) => remainingFor(c) <= 0).length },
          ],
        },
      ]}
      shown={visible.length}
      total={rows.length}
      noun="customer"
    />
    {visible.length === 0 ? (
      <p style={{ font: "400 18px/1.6 var(--sans)", color: "var(--fg-soft)" }}>
        No customer matches these filters.
      </p>
    ) : (
    <div role="table" aria-label="Customers" style={{ border: "1px solid var(--rule)" }}>
      <div
        role="row"
        className="hv-cust-row hv-cust-head"
        style={{
          display: "grid",
          gridTemplateColumns: "1.8fr 1fr 1fr 1.1fr",
          padding: "16px 24px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--surface-soft)",
          gap: 12,
        }}
      >
        {["Customer", "Projects", "Access left", ""].map((h, i) => (
          <span key={i} role="columnheader" aria-label={h === "" ? "Actions" : undefined}>
            <Mono>{h}</Mono>
          </span>
        ))}
      </div>
      {visible.map((c, i) => (
        <div
          key={c.customerId}
          role="row"
          className="hv-cust-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1fr 1fr 1.1fr",
            padding: "18px 24px",
            borderBottom: i === visible.length - 1 ? "none" : "1px solid var(--rule)",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div role="cell" className="hv-cust-lead">
            <div style={{ font: "400 18px/1.2 var(--sans)", color: "var(--fg)" }}>{c.customerName}</div>
            {/* A customer onboarded by an access code has no real address — the backend
                withholds the synthetic one rather than presenting a machine identifier
                as somewhere the shop could write. The name they typed is the identity. */}
            {c.customerEmail && <Mono>{c.customerEmail}</Mono>}
          </div>
          <span role="cell" className="mono" data-label="Projects">
            {c.projectsCreated} / {c.projectAllowance}
          </span>
          <span
            role="cell"
            data-label="Access left"
            style={{
              font: "400 12px/1 var(--mono)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: c.expired ? "var(--fg-mute-deep)" : "var(--accent-text)",
            }}
          >
            {c.expired ? "expired" : formatAccessLeft(c.accessExpiresAt)}
          </span>
          <div role="cell" className="hv-cust-action" style={{ justifySelf: "end" }}>
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button
                size="sm"
                variant="ghost"
                disabled={c.expired || grantingId === c.customerId}
                onClick={() => void grant(c.customerId)}
                title="Adds one project, and reserves one image credit from your plan"
              >
                {grantingId === c.customerId ? "Adding…" : "+ Grant project"}
              </Button>
              {/* Only offered while something is genuinely undoable: unused, and funded
                  by a billing period that has not renewed since. */}
              {latestRevocableFor(grants, c.customerId) !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={grantingId === c.customerId}
                  onClick={() => void takeBack(c.customerId)}
                  title="Puts the unused project back in your allowance"
                >
                  Take back
                </Button>
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
    )}
    </>
  );
}
