"use client";

import { useCallback, useEffect, useState } from "react";
import { api, HttpError } from "@/lib/api";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CustomerEntitlement } from "@/lib/types";

function formatAccessLeft(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days > 0 ? `${days} d ${hours} h` : `${hours} h`;
}

/**
 * Live list of the customers a retailer has onboarded (via access codes), with each
 * customer's project usage, access validity, and a "grant another project" action.
 * Talks to the backend through the same-origin BFF.
 */
export function RetailerCustomers() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomerEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await api.listMyOrgs();
      const retailer = orgs.find((o) => o.type === "RETAILER") ?? orgs[0];
      if (!retailer) {
        setOrgId(null);
        setRows([]);
        return;
      }
      setOrgId(retailer.id);
      setRows(await api.listCustomers(retailer.id));
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not grant a project.");
      } finally {
        setGrantingId(null);
      }
    },
    [orgId],
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
      <p style={{ font: "300 italic 18px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
        No customers have redeemed an access code yet.
      </p>
    );
  }

  return (
    <div style={{ border: "1px solid var(--rule)" }}>
      <div
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
          <Mono key={i}>{h}</Mono>
        ))}
      </div>
      {rows.map((c, i) => (
        <div
          key={c.customerId}
          style={{
            display: "grid",
            gridTemplateColumns: "1.8fr 1fr 1fr 1.1fr",
            padding: "18px 24px",
            borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--rule)",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ font: "300 italic 18px/1.2 var(--serif)", color: "var(--fg)" }}>{c.customerName}</div>
            <Mono>{c.customerEmail}</Mono>
          </div>
          <Mono>
            {c.projectsCreated} / {c.projectAllowance}
          </Mono>
          <span
            style={{
              font: "400 9.5px/1 var(--mono)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: c.expired ? "var(--fg-mute-deep)" : "var(--accent)",
            }}
          >
            {c.expired ? "expired" : formatAccessLeft(c.accessExpiresAt)}
          </span>
          <div style={{ justifySelf: "end" }}>
            <Button
              size="sm"
              variant="ghost"
              disabled={c.expired || grantingId === c.customerId}
              onClick={() => void grant(c.customerId)}
            >
              {grantingId === c.customerId ? "Adding…" : "+ Grant project"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
