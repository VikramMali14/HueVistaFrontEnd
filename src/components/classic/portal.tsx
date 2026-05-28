import Link from "next/link";
import { t } from "@/lib/i18n";
import type { UiLocale } from "@/lib/types";

interface ClassicPortalProps {
  locale: UiLocale;
}

const CODES = [
  { code: "SHARDA-7K2N", customer: "Pooja Deshmukh", left: "5 days left", status: "active" as const },
  { code: "SHARDA-9PXM", customer: "Mohan Patil", left: "11 days left", status: "active" as const },
  { code: "SHARDA-3QRA", customer: "Anita Rao", left: "—", status: "expired" as const },
];

export function ClassicPortal({ locale }: ClassicPortalProps) {
  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "portal.title")}</h1>
        <div className="grow" />
        <Link href="#" className="btn btn-sm">{t(locale, "portal.newCode")}</Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <section className="ccard" style={{ padding: 0 }}>
          <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
            <thead>
              <tr>
                <th>{t(locale, "portal.table.code")}</th>
                <th>{t(locale, "portal.table.customer")}</th>
                <th>{t(locale, "portal.table.timeLeft")}</th>
                <th>{t(locale, "portal.table.status")}</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {CODES.map((c) => (
                <tr key={c.code}>
                  <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)", fontWeight: 600 }}>{c.code}</td>
                  <td style={{ color: "var(--fg)", fontWeight: 500 }}>{c.customer}</td>
                  <td className="num">{c.left}</td>
                  <td><span className={`cbadge ${c.status}`}>{t(locale, c.status === "active" ? "portal.status.active" : "portal.status.expired")}</span></td>
                  <td><Link href="#" style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>{t(locale, "common.open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
