import Link from "next/link";
import type { AuthUser } from "@/lib/types";

interface ClassicDashboardProps {
  user: AuthUser | null;
}

const KPIS = [
  { label: "Renders this month", value: "60", delta: "Of 60 · Professional" },
  { label: "Renders used", value: "4", delta: "94% remaining" },
  { label: "Projects saved", value: "23", delta: "Across 18 customers" },
  { label: "Counter sales", value: "₹37,400", delta: "This month · est." },
];

const PROJECTS = [
  { id: "I", title: "Belgavi 3 BHK", customer: "Suresh K.", shade: "Terracotta · AP-2118", updated: "2 min ago" },
  { id: "II", title: "Park Place Façade", customer: "Anita R.", shade: "Bone China · AP-N101", updated: "Yesterday" },
  { id: "III", title: "Patil Bungalow", customer: "Mohan P.", shade: "Sage · AP-7706", updated: "3 days ago" },
  { id: "IV", title: "Camp Road Studio", customer: "Pooja D.", shade: "Slate · AP-9904", updated: "Last week" },
];

export function ClassicDashboard({ user }: ClassicDashboardProps) {
  return (
    <>
      <div className="ctopbar">
        <h1>Dashboard</h1>
        <span style={{ color: "var(--fg-mute)", fontSize: 13 }}>Sharda Paints · Professional</span>
        <div className="grow" />
        <Link href="/atelier" className="btn btn-sm">+ New project</Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <header style={{ marginBottom: 24 }}>
          <h2 style={{ font: "600 22px/1.3 var(--sans)", margin: 0, color: "var(--fg)" }}>
            Good morning, {user?.name?.split(" ")[0] ?? "there"}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--fg-mute)", fontSize: 14 }}>
            {PROJECTS.length} active projects · 4 renders this month
          </p>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {KPIS.map((k) => (
            <div key={k.label} className="ccard ckpi">
              <span className="label">{k.label}</span>
              <span className="value">{k.value}</span>
              <span className="delta">{k.delta}</span>
            </div>
          ))}
        </section>

        <section className="ccard" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--rule)" }}>
            <h3 style={{ margin: 0, font: "600 15px/1 var(--sans)", color: "var(--fg)" }}>Recent projects</h3>
            <Link href="/atelier" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent)" }}>View all →</Link>
          </div>
          <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Project</th>
                <th>Customer</th>
                <th>Shade</th>
                <th>Updated</th>
                <th style={{ width: 100 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: "var(--fg-mute)" }}>{p.id}</td>
                  <td style={{ color: "var(--fg)", fontWeight: 500 }}>{p.title}</td>
                  <td>{p.customer}</td>
                  <td>{p.shade}</td>
                  <td style={{ color: "var(--fg-mute)" }}>{p.updated}</td>
                  <td><Link href="/atelier" style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
