import Link from "next/link";
import { t } from "@/lib/i18n";
import type { AuthUser, UiLocale } from "@/lib/types";
import { CollapsibleDetails } from "./collapsible-details";

interface ClassicDashboardProps {
  user: AuthUser | null;
  locale: UiLocale;
}

const PROJECTS = [
  { title: "Belgavi 3 BHK", customer: "Suresh K.", shade: "Terracotta", updated: "2 min ago" },
  { title: "Park Place Façade", customer: "Anita R.", shade: "Bone White", updated: "Yesterday" },
  { title: "Patil Bungalow", customer: "Mohan P.", shade: "Sage Green", updated: "3 days ago" },
  { title: "Camp Road Studio", customer: "Pooja D.", shade: "Slate Grey", updated: "Last week" },
];

const RENDERS_USED = 4;
const RENDERS_TOTAL = 60;

export function ClassicDashboard({ user, locale }: ClassicDashboardProps) {
  const firstName = user?.name?.split(" ")[0] ?? "";
  const triesLeft = RENDERS_TOTAL - RENDERS_USED;
  const kpis = [
    { label: t(locale, "dashboard.kpi.triesLeft"), value: String(triesLeft) },
    { label: t(locale, "dashboard.kpi.openProjects"), value: String(PROJECTS.length) },
  ];

  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "dashboard.title")}</h1>
        <div className="grow" />
        <Link href="/atelier" className="btn btn-sm">{t(locale, "dashboard.newProject")}</Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <header style={{ marginBottom: 24 }}>
          <h2 style={{ font: "600 22px/1.3 var(--sans)", margin: 0, color: "var(--fg)" }}>
            {t(locale, "dashboard.greeting", { name: firstName })}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--fg-mute)", fontSize: 14 }}>
            {t(locale, "dashboard.summary", { count: PROJECTS.length, used: RENDERS_USED })}
          </p>
        </header>

        <CollapsibleDetails
          openLabel={t(locale, "common.showDetails")}
          closeLabel={t(locale, "common.hideDetails")}
        >
          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {kpis.map((k) => (
              <div key={k.label} className="ccard ckpi">
                <span className="label">{k.label}</span>
                <span className="value">{k.value}</span>
              </div>
            ))}
          </section>
        </CollapsibleDetails>

        <section className="ccard" style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--rule)" }}>
            <h3 style={{ margin: 0, font: "600 15px/1 var(--sans)", color: "var(--fg)" }}>{t(locale, "dashboard.recent")}</h3>
            <Link href="/atelier" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent)" }}>{t(locale, "common.viewAll")}</Link>
          </div>
          <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
            <thead>
              <tr>
                <th>{t(locale, "dashboard.table.project")}</th>
                <th>{t(locale, "dashboard.table.customer")}</th>
                <th>{t(locale, "dashboard.table.shade")}</th>
                <th>{t(locale, "dashboard.table.updated")}</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((p) => (
                <tr key={p.title}>
                  <td style={{ color: "var(--fg)", fontWeight: 500 }}>{p.title}</td>
                  <td>{p.customer}</td>
                  <td>{p.shade}</td>
                  <td style={{ color: "var(--fg-mute)" }}>{p.updated}</td>
                  <td><Link href="/atelier" style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>{t(locale, "common.open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
