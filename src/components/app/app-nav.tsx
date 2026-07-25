"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { AuthUser } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/atelier", label: "Studio" },
  { href: "/assigned-products", label: "My products" },
  { href: "/color-finder", label: "Colour finder" },
  { href: "/network", label: "Network" },
  { href: "/portal", label: "Customer portal" },
  { href: "/products", label: "Products" },
  { href: "/subscription", label: "Plan" },
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
  // Scroll behaviour on the ordinary app pages — matches the public site header:
  // the bar hides as you scroll down and slides back in as you scroll up. Studio
  // keeps its own auto-hide overlay, so this is disabled there.
  const [hidden, setHidden] = useState(false);
  // Debounced reveal/hide so crossing the small gap between the top hotzone and
  // the slid-down bar never flickers the navbar shut mid-move (the reported bug).
  const hideTimer = useRef<number | null>(null);
  const revealNav = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setRevealed(true);
  };
  const scheduleHideNav = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setRevealed(false), 160);
  };
  const visibleTabs = TABS.filter((t) => {
    // Hierarchy console — admins, distributors and retailers manage their downline here.
    if (t.href === "/network" && (!user || (user.role !== "ADMIN" && user.role !== "DISTRIBUTOR" && user.role !== "RETAILER"))) return false;
    if (t.href === "/portal" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    if (t.href === "/products" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    // A customer's assigned-products page — only customers have an access code behind it.
    if (t.href === "/assigned-products" && (!user || user.role !== "CUSTOMER")) return false;
    // Subscriber-only retailer tools — a customer or distributor clicking them
    // would only be bounced (neither holds a shop subscription).
    if (t.href === "/color-finder" && user && (user.role === "CUSTOMER" || user.role === "DISTRIBUTOR")) return false;
    if (t.href === "/atelier" && user && user.role === "DISTRIBUTOR") return false;
    // Plans are shop products — customer/distributor subscription pages only redirect them.
    if (t.href === "/subscription" && user && (user.role === "CUSTOMER" || user.role === "DISTRIBUTOR")) return false;
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
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, [pathname]);

  // Clear any pending hide timer on unmount.
  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

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

  // Hide-on-scroll-down / reveal-on-scroll-up for the ordinary app pages, the
  // same feel as the public site header. Skipped in studio mode (its overlay
  // owns the top edge) and whenever the mobile drawer is open.
  useEffect(() => {
    if (studioMode) {
      setHidden(false);
      return;
    }
    setHidden(false); // never start a page tucked away
    let lastY = window.scrollY;
    let ticking = false;
    const evaluate = () => {
      ticking = false;
      const y = window.scrollY;
      const delta = y - lastY;
      if (open || y < 80) setHidden(false);        // near the top or menu open → visible
      else if (delta > 4) setHidden(true);         // scrolling down → tuck up
      else if (delta < -4) setHidden(false);       // scrolling up → bring it back
      lastY = y;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(evaluate);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [studioMode, open, pathname]);

  return (
    <header
      className={studioMode ? `app-header-studio${revealed || open ? " is-revealed" : ""}` : undefined}
      onMouseEnter={studioMode && !open ? revealNav : undefined}
      onMouseLeave={studioMode && !open ? scheduleHideNav : undefined}
      onFocusCapture={studioMode ? revealNav : undefined}
    >
      {studioMode && (
        <>
          {/* Invisible hot zone along the very top edge — hovering it slides the nav in. */}
          <div className="studio-nav-hotzone" aria-hidden onMouseEnter={revealNav} />
          <button
            type="button"
            className={`studio-nav-handle${revealed || open ? " is-hidden" : ""}`}
            aria-label="Show navigation"
            aria-expanded={revealed}
            onMouseEnter={revealNav}
            onClick={() => (revealed ? setRevealed(false) : revealNav())}
          >
            <MenuIcon size={13} />
            <span>Menu</span>
          </button>
        </>
      )}
      <div className="app-header-slide">
      <div className={`app-nav-inner${wideNav ? " nav-wide" : ""}${hidden ? " is-hidden" : ""}`}>
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
        /* Floating glassy bar — same surface language as the public card-nav
           (var(--nav-bg) + blur, rounded, --rule-strong border, glass shadow),
           just wider to hold the app tabs. Keeps the navbar in sync everywhere. */
        .app-nav-inner { background: var(--nav-bg); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%); border: 1px solid var(--rule-strong); border-radius: 18px; box-shadow: 0 16px 40px -22px rgba(0,0,0,.5), inset 0 1px 0 rgba(var(--fg-rgb), .05); padding: 14px 20px; margin: 16px var(--gutter); display: flex; align-items: center; gap: 24px; position: sticky; top: 16px; z-index: 60; flex-wrap: wrap; transition: transform .38s var(--ease); }
        /* Tucked up out of view when scrolling down past the top of an app page;
           any upward scroll clears it (mirrors the public .cnav-wrap.is-hidden). */
        .app-nav-inner.is-hidden { transform: translateY(-160%); }
        @media (prefers-reduced-motion: reduce) { .app-nav-inner { transition: none; } }
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
        /* Bridge the gap between the top edge and the revealed bar: pad the slide
           (a pointer-events:auto surface) right up to the top so moving the mouse
           from the hotzone onto the nav never crosses a dead zone that hides it.
           The nav-inner's own top margin is dropped so the bar keeps its position. */
        .app-header-studio .app-header-slide { padding-top: 16px; }
        .app-header-studio .app-nav-inner { margin-top: 0; }
        .studio-nav-hotzone { position: absolute; top: 0; left: 0; right: 0; height: 16px; pointer-events: auto; }
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
