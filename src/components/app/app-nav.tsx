"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import type { AuthUser } from "@/lib/types";

const TABS = [
  { href: "/atelier", label: "iii · Atelier" },
  { href: "/dashboard", label: "v · Suite" },
  { href: "/portal", label: "vi · Annex" },
] as const;

interface AppNavProps {
  user: AuthUser | null;
  themeToggle?: ReactNode;
  variantToggle?: ReactNode;
  localeToggle?: ReactNode;
}

export function AppNav({ user, themeToggle, variantToggle, localeToggle }: AppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const folio = pathname.includes("dashboard") ? "v" : pathname.includes("portal") ? "vi" : "iii";
  const visibleTabs = TABS.filter((t) => {
    if (t.href === "/portal" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    return true;
  });

  // Auto-close the drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header>
      <div className="masthead-strip">
        <span>established · mmxxvi</span>
        <span>
          <span className="dot" />
          &nbsp;&nbsp;hue vista · belgavi · india&nbsp;&nbsp;
          <span className="dot" />
        </span>
        <span>folio · {folio}</span>
      </div>
      <div className="app-nav-inner">
        <Link href="/" className="brand" style={{ fontSize: 24 }}>
          <span className="brand-mark" />
          HueVista
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-mobile-tabs"
          onClick={() => setOpen((v) => !v)}
          className="mobile-menu-toggle"
          style={{ marginLeft: "auto" }}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <div
          id="app-mobile-tabs"
          className={`app-tabs is-mobile ${open ? "" : "is-closed"}`}
        >
          {visibleTabs.map((t) => (
            <Link key={t.href} href={t.href} className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="app-tabs is-desktop">
          {visibleTabs.map((t) => (
            <Link key={t.href} href={t.href} className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="app-nav-meta">
          {user && (
            <span style={{ font: "300 italic 16px/1 var(--serif)", color: "var(--fg-soft)" }}>{user.name}</span>
          )}
          {localeToggle}
          {variantToggle}
          {themeToggle}
          <LogoutButton
            className="app-tab"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-mute)",
              padding: "12px 16px",
              font: "400 11px/1 var(--mono)",
              letterSpacing: ".26em",
              textTransform: "uppercase",
            }}
          />
        </div>
      </div>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="mobile-scrim"
          onClick={() => setOpen(false)}
        />
      )}
      <style>{`
        .masthead-strip { background: var(--bg-deep); color: var(--fg-soft); border-bottom: 1px solid var(--rule); padding: 10px var(--gutter); font: 400 10px/1 var(--mono); letter-spacing: .32em; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; }
        .masthead-strip .dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
        .app-nav-inner { background: var(--nav-bg-strong); -webkit-backdrop-filter: blur(20px) saturate(140%); backdrop-filter: blur(20px) saturate(140%); border-bottom: 1px solid var(--rule); padding: 18px var(--gutter); display: flex; align-items: center; gap: 24px; position: sticky; top: 0; z-index: 60; flex-wrap: wrap; }
        .app-tabs { display: flex; gap: 8px; margin-left: auto; }
        .app-tab { font: 400 11px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; padding: 12px 16px; color: var(--fg-mute); border: 1px solid transparent; transition: color .25s var(--ease), border-color .25s var(--ease); }
        .app-tab.active, .app-tab:hover { color: var(--fg); border-color: var(--rule-strong); }
        .app-nav-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .app-tabs.is-mobile { display: none; }
        @media (max-width: 900px) {
          .app-nav-inner { padding: 14px var(--gutter); }
          .app-tabs.is-desktop { display: none; }
          .app-tabs.is-mobile { display: flex; }
          .app-nav-meta { width: 100%; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--rule); }
        }
      `}</style>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}
