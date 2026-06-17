"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { AuthUser } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/atelier", label: "Studio" },
  { href: "/color-finder", label: "Colour finder" },
  { href: "/portal", label: "Customer portal" },
  { href: "/products", label: "Products" },
  { href: "/inbox", label: "Inbox" },
] as const;

interface AppNavProps {
  user: AuthUser | null;
}

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleTabs = TABS.filter((t) => {
    if (t.href === "/portal" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    if (t.href === "/products" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    if (t.href === "/inbox" && (!user || user.role !== "ADMIN")) return false;
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
        <span>
          <span className="dot" />
          &nbsp;&nbsp;Hue Vista · Belgavi · India&nbsp;&nbsp;
          <span className="dot" />
        </span>
      </div>
      <div className="app-nav-inner">
        <Link href="/dashboard" className="brand-logo" aria-label="HueVista — dashboard">
          <Logo size="sm" inverted ariaLabel={null} />
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
          <div className="app-drawer-meta">
            <ThemeToggle />
            {user && (
              <span style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }}>{user.name}</span>
            )}
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
        <div className="app-tabs is-desktop">
          {visibleTabs.map((t) => (
            <Link key={t.href} href={t.href} className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="app-nav-meta">
          <ThemeToggle />
          {user && (
            <span style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }}>{user.name}</span>
          )}
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
        .masthead-strip { background: var(--bg-deep); color: var(--fg-soft); border-bottom: 1px solid var(--rule); padding: 10px var(--gutter); font: 400 10px/1 var(--mono); letter-spacing: .32em; text-transform: uppercase; display: flex; align-items: center; justify-content: center; }
        .masthead-strip .dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
        /* Floating glassy bar — same surface language as the public card-nav
           (var(--nav-bg) + blur, rounded, --rule-strong border, glass shadow),
           just wider to hold the app tabs. Keeps the navbar in sync everywhere. */
        .app-nav-inner { background: var(--nav-bg); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%); border: 1px solid var(--rule-strong); border-radius: 18px; box-shadow: 0 16px 40px -22px rgba(0,0,0,.5), inset 0 1px 0 rgba(var(--fg-rgb), .05); padding: 14px 20px; margin: 16px var(--gutter); display: flex; align-items: center; gap: 24px; position: sticky; top: 16px; z-index: 60; flex-wrap: wrap; }
        .app-tabs { display: flex; gap: 8px; margin-left: auto; }
        .app-tab { font: 400 11px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; padding: 12px 16px; color: var(--fg-mute); border: 1px solid transparent; transition: color .25s var(--ease), border-color .25s var(--ease); }
        .app-tab.active, .app-tab:hover { color: var(--fg); border-color: var(--rule-strong); }
        .app-nav-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .app-tabs.is-mobile { display: none; }
        .app-drawer-meta { display: none; }
        @media (max-width: 900px) {
          .app-nav-inner { padding: 12px 16px; margin: 12px 16px; top: 12px; }
          .app-tabs.is-desktop { display: none; }
          .app-tabs.is-mobile { display: flex; }
          .app-nav-meta { display: none; }
          .app-drawer-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px var(--gutter) 6px; border-top: 1px solid var(--rule); margin-top: 4px; }
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
