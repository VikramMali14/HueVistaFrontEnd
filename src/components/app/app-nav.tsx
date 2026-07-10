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
  { href: "/admin", label: "Admin" },
] as const;

interface AppNavProps {
  user: AuthUser | null;
}

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Studio mode: the workspace owns the whole viewport, so the navbar becomes
  // an auto-hide overlay — hidden until the top edge is hovered (or the small
  // handle is clicked), then it slides down over the canvas. Desktop only;
  // below 900px the CSS keeps the nav in normal flow.
  const studioMode = pathname.startsWith("/atelier");
  const [revealed, setRevealed] = useState(false);
  const visibleTabs = TABS.filter((t) => {
    if (t.href === "/portal" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    if (t.href === "/products" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    // Subscriber-only retailer tool — a customer clicking it would only be bounced.
    if (t.href === "/color-finder" && user && user.role === "CUSTOMER") return false;
    if (t.href === "/inbox" && (!user || user.role !== "ADMIN")) return false;
    if (t.href === "/admin" && (!user || user.role !== "ADMIN")) return false;
    return true;
  });

  // ADMIN carries 7 tabs — the row overflows the floating bar well above the
  // 900px drawer breakpoint, so wide tab sets get tighter spacing and an
  // earlier drawer via the .nav-wide rules below.
  const wideNav = visibleTabs.length > 5;

  // Auto-close the drawer (and the studio overlay) on route change.
  useEffect(() => {
    setOpen(false);
    setRevealed(false);
  }, [pathname]);

  // Studio overlay: Escape tucks the navbar away again.
  useEffect(() => {
    if (!studioMode || !revealed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRevealed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studioMode, revealed]);

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
    <header
      className={studioMode ? `app-header-studio${revealed || open ? " is-revealed" : ""}` : undefined}
      onMouseLeave={studioMode && !open ? () => setRevealed(false) : undefined}
      onFocusCapture={studioMode ? () => setRevealed(true) : undefined}
    >
      {studioMode && (
        <>
          {/* Invisible hot zone along the very top edge — hovering it slides the nav in. */}
          <div className="studio-nav-hotzone" aria-hidden onMouseEnter={() => setRevealed(true)} />
          <button
            type="button"
            className={`studio-nav-handle${revealed || open ? " is-hidden" : ""}`}
            aria-label="Show navigation"
            aria-expanded={revealed}
            onMouseEnter={() => setRevealed(true)}
            onClick={() => setRevealed((v) => !v)}
          >
            <MenuIcon size={13} />
            <span>Menu</span>
          </button>
        </>
      )}
      <div className="app-header-slide">
      <div className="masthead-strip">
        <span>
          <span className="dot" />
          &nbsp;&nbsp;Hue Vista · Belgavi · India&nbsp;&nbsp;
          <span className="dot" />
        </span>
      </div>
      <div className={`app-nav-inner${wideNav ? " nav-wide" : ""}`}>
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
              <Link href="/account" style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }} title="Account settings">{user.name}</Link>
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
            <Link href="/account" style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }} title="Account settings">{user.name}</Link>
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
      </div>
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
        /* ── Studio (atelier): auto-hide navbar ─────────────────────────
           The header becomes a fixed, click-through shell pinned to the top
           of the viewport; the actual bar lives in .app-header-slide, which
           is tucked away above the screen until the top edge is hovered,
           the handle is clicked, or focus lands inside (keyboard users).
           The workspace below owns the full viewport height. */
        .app-header-studio { position: fixed; top: 0; left: 0; right: 0; z-index: 80; pointer-events: none; }
        .app-header-studio .app-header-slide { transform: translateY(-112%); transition: transform .32s var(--ease); pointer-events: auto; }
        .app-header-studio.is-revealed .app-header-slide { transform: none; }
        .studio-nav-hotzone { position: absolute; top: 0; left: 0; right: 0; height: 12px; pointer-events: auto; }
        .studio-nav-handle {
          position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 16px 8px;
          background: var(--nav-bg); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%);
          border: 1px solid var(--rule-strong); border-top: none; border-radius: 0 0 12px 12px;
          color: var(--fg-mute); font: 400 10px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase;
          cursor: pointer; pointer-events: auto;
          transition: color .2s var(--ease), opacity .25s var(--ease);
        }
        .studio-nav-handle:hover { color: var(--fg); }
        .studio-nav-handle:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
        .studio-nav-handle.is-hidden { opacity: 0; pointer-events: none; }
        /* Below the desktop workspace breakpoint the studio stacks and scrolls
           like any page — keep the navbar in normal flow there. */
        @media (max-width: 900px) {
          .app-header-studio { position: static; pointer-events: auto; }
          .app-header-studio .app-header-slide { transform: none; }
          .studio-nav-hotzone, .studio-nav-handle { display: none; }
        }
        /* Wide tab sets (ADMIN): tighten the row so 7 tabs + the user block fit
           on one line down to ~1200px… */
        @media (max-width: 1600px) {
          .app-nav-inner.nav-wide { gap: 16px; }
          .app-nav-inner.nav-wide .app-tabs.is-desktop { gap: 2px; }
          .app-nav-inner.nav-wide .app-tabs.is-desktop .app-tab { padding: 12px 10px; letter-spacing: .18em; }
        }
        /* …and below that, hand over to the drawer earlier than the 900px
           breakpoint the narrower retailer/customer sets need. Mirrors the
           globals.css mobile drawer rules. */
        @media (min-width: 901px) and (max-width: 1200px) {
          .app-nav-inner.nav-wide .app-tabs.is-desktop { display: none; }
          .app-nav-inner.nav-wide .app-nav-meta { display: none; }
          .app-nav-inner.nav-wide .mobile-menu-toggle { display: inline-flex; }
          .app-nav-inner.nav-wide .app-tabs.is-mobile:not(.is-closed) {
            display: flex;
            position: fixed; top: 120px; left: 0; right: 0;
            flex-direction: column; gap: 0;
            background: var(--nav-bg-strong);
            border-bottom: 1px solid var(--rule);
            padding: 8px 0;
            z-index: 60;
            box-shadow: 0 16px 32px -16px rgba(0,0,0,.3);
          }
          .app-nav-inner.nav-wide .app-tabs.is-mobile .app-tab { padding: 14px var(--gutter); border: none; border-top: 1px solid var(--rule); }
          .app-nav-inner.nav-wide .app-tabs.is-mobile .app-tab:first-child { border-top: none; }
          .app-nav-inner.nav-wide .app-drawer-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px var(--gutter) 6px; border-top: 1px solid var(--rule); margin-top: 4px; }
        }
        @media (max-width: 900px) {
          .app-nav-inner { padding: 12px 16px; margin: 12px 16px; top: 12px; }
          .app-tabs.is-desktop { display: none; }
          /* Only show the drawer when it's actually open. The :not(.is-closed)
             selector is needed so this rule outranks globals.css
             '.app-tabs.is-closed { display:none }' — they have equal specificity,
             and this inline style block would otherwise win on source order and
             keep the menu permanently expanded over the page on mobile. (Never
             write a literal style tag in this comment: the server escapes it
             inside the style element, the browser doesn't, and React throws a
             hydration mismatch on every signed-in page.) */
          .app-tabs.is-mobile:not(.is-closed) { display: flex; }
          .app-nav-meta { display: none; }
          .app-drawer-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px var(--gutter) 6px; border-top: 1px solid var(--rule); margin-top: 4px; }
        }
      `}</style>
    </header>
  );
}

function MenuIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
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
