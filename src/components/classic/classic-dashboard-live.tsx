"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ProjectSummary, SubscriptionSummary } from "@/lib/types";

const UNLIMITED = 2147483647;

function statusLabel(s: ProjectSummary["status"]): string {
  switch (s) {
    case "SEGMENTED":
      return "Ready";
    case "SEGMENTING":
      return "Detecting…";
    case "FAILED":
      return "Needs attention";
    default:
      return "New";
  }
}

/** Live (real-data) KPIs + recent-projects table + plan card for the classic dashboard. */
export function ClassicDashboardLive() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.listProjects().then((p) => !cancelled && setProjects(p)).catch(() => !cancelled && setProjects([]));
    api.getCurrentSubscription().then((s) => !cancelled && setSub(s)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = projects === null;
  const list = projects ?? [];
  const ready = list.filter((p) => p.status === "SEGMENTED").length;
  const attention = list.filter((p) => p.status === "FAILED").length;
  const regions = list.reduce((n, p) => n + (p.regionCount ?? 0), 0);

  const kpis = [
    { label: "Projects", value: list.length, sub: "saved" },
    { label: "Ready", value: ready, sub: "walls detected" },
    { label: "Regions", value: regions, sub: "across projects" },
    { label: "Needs attention", value: attention, sub: "detection failed" },
  ];

  const used = sub?.aiGenerationsUsed ?? 0;
  const limit = sub && sub.aiGenerationsLimit < UNLIMITED ? sub.aiGenerationsLimit : 0;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const recent = list.slice(0, 6);

  return (
    <>
      <section className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {kpis.map((k) => (
          <div key={k.label} className="ccard ckpi">
            <span className="label">{k.label}</span>
            <span className="value">{loading ? "—" : k.value}</span>
            <span className="delta">{k.sub}</span>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }} className="r-cols-md-1">
        <div className="ccard" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--rule)" }}>
            <h3 style={{ margin: 0, font: "600 14px/1 var(--sans)", color: "var(--fg)" }}>Recent projects</h3>
            <Link href="/atelier" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent)" }}>New project</Link>
          </div>
          {loading ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--fg-mute)" }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--fg-mute)", font: "400 14px/1.5 var(--sans)" }}>
              No projects yet — start one with a photo.
            </div>
          ) : (
            <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Regions</th>
                  <th>Status</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Project" style={{ color: "var(--fg)", fontWeight: 500 }}>{p.name}</td>
                    <td data-label="Regions">{p.regionCount}</td>
                    <td data-label="Status" style={{ color: "var(--fg-mute)" }}>{statusLabel(p.status)}</td>
                    <td data-label=" ">
                      <Link href={`/atelier?project=${encodeURIComponent(p.id)}`} style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="ccard" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, font: "600 14px/1 var(--sans)", color: "var(--fg)" }}>Quick actions</h3>
          <Link href="/atelier" className="btn btn-sm" style={{ width: "100%", justifyContent: "center" }}>+ New project</Link>
          <Link href="/portal" className="btn btn-sm btn-ghost" style={{ width: "100%", justifyContent: "center" }}>+ Issue a code</Link>
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "600 11px/1 var(--sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg-mute)" }}>Plan</span>
            <span style={{ font: "500 14px/1.3 var(--sans)", color: "var(--fg)" }}>
              {sub ? (sub.trial ? `${sub.planDisplayName} · trial` : sub.planDisplayName) : "No active plan"}
            </span>
            {sub && limit > 0 && (
              <>
                <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                  {Math.max(0, limit - used)} of {limit} AI renders left this cycle
                </span>
                <div style={{ marginTop: 4, height: 4, background: "var(--rule)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width .3s ease" }} />
                </div>
              </>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
