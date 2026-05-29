import Link from "next/link";
import { t } from "@/lib/i18n";
import type { AuthUser, UiLocale } from "@/lib/types";

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
const SAVED_COLOURS = 23;
const THIS_WEEK = 7;

export function ClassicDashboard({ user, locale }: ClassicDashboardProps) {
  const firstName = user?.name?.split(" ")[0] ?? "";
  const triesLeft = RENDERS_TOTAL - RENDERS_USED;
  const lastProject = PROJECTS[0];

  const kpis = [
    { label: t(locale, "dashboard.kpi.triesLeft"), value: String(triesLeft), sub: `${RENDERS_USED} of ${RENDERS_TOTAL} used` },
    { label: t(locale, "dashboard.kpi.openProjects"), value: String(PROJECTS.length), sub: "in this month" },
    { label: t(locale, "dashboard.kpi.thisWeek"), value: String(THIS_WEEK), sub: "colour previews" },
    { label: t(locale, "dashboard.kpi.savedColours"), value: String(SAVED_COLOURS), sub: "across customers" },
  ];

  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "dashboard.title")}</h1>
        <div className="grow" />
        <Link href="/atelier" className="btn btn-sm">
          + {t(locale, "dashboard.newProject")}
        </Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <header style={{ marginBottom: 20 }}>
          <h2 style={{ font: "600 20px/1.3 var(--sans)", margin: 0, color: "var(--fg)" }}>
            {firstName
              ? t(locale, "dashboard.greeting", { name: firstName })
              : t(locale, "dashboard.greetingFallback")}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--fg-mute)", fontSize: 14 }}>
            {t(locale, "dashboard.summary", { count: PROJECTS.length, used: RENDERS_USED })}
          </p>
        </header>

        <section className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {kpis.map((k) => (
            <div key={k.label} className="ccard ckpi">
              <span className="label">{k.label}</span>
              <span className="value">{k.value}</span>
              <span className="delta">{k.sub}</span>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
          className="r-cols-md-1"
        >
          <div className="ccard" style={{ padding: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <h3 style={{ margin: 0, font: "600 14px/1 var(--sans)", color: "var(--fg)" }}>
                {t(locale, "dashboard.recent")}
              </h3>
              <Link href="/atelier" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent)" }}>
                {t(locale, "common.viewAll")}
              </Link>
            </div>
            {PROJECTS.length === 0 ? (
              <div style={{ padding: "32px 18px", textAlign: "center", color: "var(--fg-mute)", font: "400 14px/1.5 var(--sans)" }}>
                {t(locale, "dashboard.recentEmpty")}
              </div>
            ) : (
              <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
                <thead>
                  <tr>
                    <th>{t(locale, "dashboard.table.project")}</th>
                    <th>{t(locale, "dashboard.table.customer")}</th>
                    <th>{t(locale, "dashboard.table.shade")}</th>
                    <th>{t(locale, "dashboard.table.updated")}</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {PROJECTS.map((p) => (
                    <tr key={p.title}>
                      <td data-label={t(locale, "dashboard.table.project")} style={{ color: "var(--fg)", fontWeight: 500 }}>
                        {p.title}
                      </td>
                      <td data-label={t(locale, "dashboard.table.customer")}>{p.customer}</td>
                      <td data-label={t(locale, "dashboard.table.shade")}>{p.shade}</td>
                      <td data-label={t(locale, "dashboard.table.updated")} style={{ color: "var(--fg-mute)" }}>
                        {p.updated}
                      </td>
                      <td data-label=" ">
                        <Link href="/atelier" style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>
                          {t(locale, "common.open")}
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
            <Link href="/atelier" className="btn btn-sm" style={{ width: "100%", justifyContent: "center" }}>
              + {t(locale, "dashboard.newProject")}
            </Link>
            {lastProject && (
              <Link href="/atelier" className="btn btn-sm btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
                {t(locale, "dashboard.openLast")}: {lastProject.title}
              </Link>
            )}
            <Link href="/portal" className="btn btn-sm btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              + {t(locale, "portal.newCode")}
            </Link>
            <div
              style={{
                marginTop: 6,
                paddingTop: 14,
                borderTop: "1px solid var(--rule)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ font: "600 11px/1 var(--sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                Plan
              </span>
              <span style={{ font: "500 14px/1.3 var(--sans)", color: "var(--fg)" }}>
                Professional
              </span>
              <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                {triesLeft} of {RENDERS_TOTAL} tries left this month
              </span>
              <div style={{ marginTop: 4, height: 4, background: "var(--rule)", borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(RENDERS_USED / RENDERS_TOTAL) * 100}%`,
                    height: "100%",
                    background: "var(--accent)",
                    transition: "width .3s ease",
                  }}
                />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}
