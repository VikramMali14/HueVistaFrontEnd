"use client";

import Link from "next/link";
import { useState } from "react";
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const active = CODES.filter((c) => c.status === "active").length;
  const expired = CODES.filter((c) => c.status === "expired").length;

  const onCopy = async (code: string) => {
    const url = `https://shardapaints.huevista.com/link/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      /* clipboard blocked — fall through silently */
    }
  };

  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "portal.title")}</h1>
        <div className="grow" />
        <button type="button" className="btn btn-sm" aria-label={t(locale, "portal.newCode")}>
          + {t(locale, "portal.newCode")}
        </button>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <p style={{ margin: "0 0 16px", color: "var(--fg-mute)", fontSize: 14 }}>
          {t(locale, "portal.summary", { active, expired })}
        </p>

        {CODES.length === 0 ? (
          <div
            className="ccard"
            style={{ padding: 32, textAlign: "center", color: "var(--fg-mute)" }}
          >
            <p style={{ margin: 0, font: "400 14px/1.5 var(--sans)" }}>
              {t(locale, "portal.empty")}
            </p>
            <button type="button" className="btn btn-sm" style={{ marginTop: 14 }}>
              + {t(locale, "portal.newCode")}
            </button>
          </div>
        ) : (
          <section className="ccard" style={{ padding: 0 }}>
            <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
              <thead>
                <tr>
                  <th>{t(locale, "portal.table.code")}</th>
                  <th>{t(locale, "portal.table.customer")}</th>
                  <th>{t(locale, "portal.table.timeLeft")}</th>
                  <th>{t(locale, "portal.table.status")}</th>
                  <th style={{ width: 160 }}></th>
                </tr>
              </thead>
              <tbody>
                {CODES.map((c) => (
                  <tr key={c.code}>
                    <td
                      data-label={t(locale, "portal.table.code")}
                      style={{
                        fontFamily: "ui-monospace, 'Courier New', monospace",
                        color: "var(--accent)",
                        fontWeight: 600,
                      }}
                    >
                      {c.code}
                    </td>
                    <td
                      data-label={t(locale, "portal.table.customer")}
                      style={{ color: "var(--fg)", fontWeight: 500 }}
                    >
                      {c.customer}
                    </td>
                    <td data-label={t(locale, "portal.table.timeLeft")} className="num">
                      {c.left}
                    </td>
                    <td data-label={t(locale, "portal.table.status")}>
                      <span className={`cbadge ${c.status}`}>
                        {t(locale, c.status === "active" ? "portal.status.active" : "portal.status.expired")}
                      </span>
                    </td>
                    <td data-label=" ">
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        {c.status === "active" && (
                          <button
                            type="button"
                            onClick={() => onCopy(c.code)}
                            aria-label={t(locale, "portal.copyLink")}
                            style={{
                              font: "500 13px/1 var(--sans)",
                              color: "var(--accent)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {copiedCode === c.code ? t(locale, "common.copied") : t(locale, "portal.copyLink")}
                          </button>
                        )}
                        <Link
                          href="/atelier"
                          style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}
                        >
                          {t(locale, "common.open")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}
