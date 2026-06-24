"use client";

import { useState } from "react";
import { DEMO_ACCOUNT_LIST, DEMO_PASSWORD } from "@/lib/demo/accounts";

/**
 * Sign-in helper shown only in DEMO_MODE: lists the demo accounts and fills the
 * (uncontrolled) email/password fields on click, so a visitor can sign in with
 * one tap. Pure UX — the credentials are intentionally public for the demo.
 */
const ROLE_BLURB: Record<string, string> = {
  RETAILER: "Shop owner — dashboard, studio, portal, products, colour finder",
  ADMIN: "Administrator — everything, plus Inbox & Admin",
  CUSTOMER: "Walk-in customer — dashboard, studio, redeem a code",
};

export function DemoCredentials() {
  const [filled, setFilled] = useState<string | null>(null);

  const fill = (email: string) => {
    const e = document.getElementById("email") as HTMLInputElement | null;
    const p = document.getElementById("password") as HTMLInputElement | null;
    if (e) e.value = email;
    if (p) p.value = DEMO_PASSWORD;
    setFilled(email);
    e?.focus();
  };

  return (
    <div
      style={{
        border: "1px solid var(--rule-strong)",
        background: "var(--surface-soft)",
        borderRadius: "var(--radius, 10px)",
        padding: "16px 18px",
        marginTop: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "500 11px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", color: "var(--accent)" }}>
          Demo mode · no backend
        </span>
        <span style={{ font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
          password: <strong style={{ color: "var(--fg)" }}>{DEMO_PASSWORD}</strong>
        </span>
      </div>
      <p style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "10px 0 14px" }}>
        Pick an account to auto-fill the form, then press <em>Sign in</em>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DEMO_ACCOUNT_LIST.map((acc) => (
          <button
            key={acc.email}
            type="button"
            onClick={() => fill(acc.email)}
            style={{
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "10px 12px",
              cursor: "pointer",
              background: filled === acc.email ? "var(--surface)" : "transparent",
              border: "1px solid " + (filled === acc.email ? "var(--accent)" : "var(--rule)"),
              borderRadius: 8,
              color: "var(--fg)",
            }}
          >
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ font: "600 14px/1.2 var(--sans)" }}>{acc.email}</span>
              <span style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)" }}>
                {acc.role}
              </span>
            </span>
            <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>{ROLE_BLURB[acc.role]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
