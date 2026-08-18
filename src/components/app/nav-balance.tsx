"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAccountBalance } from "@/hooks/use-account-balance";

/**
 * What the account holds, in the navbar: projects, and AI image credits.
 *
 * <h2>Why it belongs up here</h2>
 *
 * Both numbers are spent by pressing something — starting a room spends a project, and
 * asking for the photorealistic image spends a credit — and until now neither was
 * visible at the moment of pressing. They lived on /my-projects, one navigation away
 * from every screen where they matter, so the honest way to answer "can I start another
 * room?" was to leave what you were doing and go and look. People stopped asking and
 * simply pressed, which turns a balance into a refusal.
 *
 * A navbar figure is not a nicety here: it is where the answer has to be, because the
 * question is asked on every other page.
 *
 * <h2>Who sees it</h2>
 *
 * CUSTOMER accounts. These two balances ARE the customer's billing model — /my-projects
 * is literally titled "Projects &amp; credits" — while a shop's equivalents are a monthly
 * quota and a points balance, which are different quantities on a different page
 * (/plan) and would need a different readout to be honest about. A distributor holds
 * neither. So rather than showing everyone a number that means something different per
 * role, this shows the one role whose two numbers these are.
 *
 * <h2>What it does when it doesn't know</h2>
 *
 * Renders nothing. A balance is only worth showing when it is right: "0 projects" on an
 * account holding three is worse than a navbar with nothing in it, and it is exactly
 * what a fetch failure would otherwise produce. The same goes for the moment before the
 * first response lands — no skeleton, no zero, just nothing until there is something
 * true to say.
 */
export function NavBalance({ className }: { className?: string }) {
  const { projects, credits, creditsEligible, loaded, reload } = useAccountBalance(true);
  const pathname = usePathname();

  // Refetch on every route change. Both figures are spent by actions on other pages —
  // a room started in the studio, an image rendered — and a bar that persists across
  // navigations would otherwise keep showing the balance from whenever it first
  // mounted. Purchases push their own event (see useAccountBalance); this covers the
  // spending, without instrumenting every button that spends.
  useEffect(() => {
    reload();
  }, [pathname, reload]);

  if (!loaded) return null;

  return (
    <Link
      href="/my-projects"
      className={className ? `nav-balance ${className}` : "nav-balance"}
      title="Your projects and AI image credits — open Projects & credits"
    >
      <span className="nav-balance-part">
        <strong>{projects}</strong>
        <span className="nav-balance-unit">{projects === 1 ? "project" : "projects"}</span>
      </span>
      {/* Hidden rather than zeroed for an account that may never hold a credit: a
          figure that can only ever read 0 is a question the navbar keeps asking and
          never answers. */}
      {creditsEligible && (
        <>
          <span className="nav-balance-sep" aria-hidden>
            ·
          </span>
          <span className="nav-balance-part">
            <strong>{credits}</strong>
            <span className="nav-balance-unit">{credits === 1 ? "credit" : "credits"}</span>
          </span>
        </>
      )}
      <style>{`
        .nav-balance {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 13px; border-radius: var(--radius-pill);
          border: 1px solid var(--rule-strong);
          background: rgba(var(--fg-rgb), .04);
          color: var(--fg-soft); text-decoration: none;
          font: 400 12px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase;
          white-space: nowrap;
          transition: color .25s var(--ease), border-color .25s var(--ease), background .25s var(--ease);
        }
        .nav-balance:hover { color: var(--fg); border-color: var(--fg); background: rgba(var(--fg-rgb), .08); }
        .nav-balance:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .nav-balance-part { display: inline-flex; align-items: baseline; gap: 5px; }
        /* The number is the thing being read; the noun is only there to say which
           number it is, so it is set back rather than given equal weight. */
        .nav-balance strong { font: 500 14px/1 var(--sans); letter-spacing: 0; color: var(--fg); }
        .nav-balance-unit { font-size: 10.5px; letter-spacing: .14em; color: var(--fg-mute); }
        .nav-balance-sep { color: var(--fg-mute-deep); }
      `}</style>
    </Link>
  );
}
