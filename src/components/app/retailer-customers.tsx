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
  const [error, setError] = useState<string | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
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
        const remaining = c.projectsRemaining ?? c.projectAllowance - c.projectsCreated;
        if (usage === "left" && remaining <= 0) return false;
        if (usage === "used-up" && remaining > 0) return false;
        return matchesQuery(query, c.customerName, c.customerEmail);
      }),
    [rows, query, status, usage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(err instanceof HttpError ? err.message : "Could not load customers.");
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
      setError(null);
      try {
        const updated = await api.grantProject(orgId, customerId);
        setRows((prev) => prev.map((r) => (r.customerId === customerId ? updated : r)));
        setGrants(await api.listProjectGrants(orgId).catch(() => grants));
      } catch (err) {
        // Granting costs a project, drawn from the month's allowance or from an extra the
        // shop bought, so a lapsed plan or an exhausted pool is a real refusal rather than
        // a bug — the backend's message says which.
        setError(err instanceof Error ? err.message : "Could not grant a project.");
      } finally {
        setGrantingId(null);
      }
    },
    [orgId, grants],
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
      const grant = grants.find((g) => g.customerUserId === customerId && g.revocable);
      if (!grant) return;
      setGrantingId(customerId);
      setError(null);
      try {
        await api.revokeProjectGrant(orgId, grant.id);
        const [customers, refreshed] = await Promise.all([
          api.listCustomers(orgId),
          api.listProjectGrants(orgId),
        ]);
        setRows(customers);
        setGrants(refreshed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not take that grant back.");
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

  if (error) {
    return (
      <div style={{ color: "var(--fg-mute)" }}>
        <Mono>{error}</Mono>{" "}
        <button
          type="button"
          onClick={() => void load()}
          style={{ background: "none", border: "none", color: "var(--accent-soft)", cursor: "pointer", textDecoration: "underline" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p style={{ font: "400 18px/1.6 var(--sans)", color: "var(--fg-soft)" }}>
        No customers have redeemed an access code yet.
      </p>
    );
  }

  return (
    <>
    {/* What there is left to grant, said before the shop clicks a row and finds out.
        Extras it bought count — granting draws on the same pool painting does. */}
    <div style={{ marginBottom: 12 }}>
      <AssignableProjects />
    </div>
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
          options: [
            { value: "left", label: "Slots left" },
            { value: "used-up", label: "Fully used" },
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
              font: "400 9.5px/1 var(--mono)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: c.expired ? "var(--fg-mute-deep)" : "var(--accent)",
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
              {grants.some((g) => g.customerUserId === c.customerId && g.revocable) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={grantingId === c.customerId}
                  onClick={() => void takeBack(c.customerId)}
                  title="Returns the unused project and its image credit to your quota"
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
