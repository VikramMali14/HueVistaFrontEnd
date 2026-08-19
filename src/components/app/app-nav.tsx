"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/ui/logo";
import { NavBalance } from "@/components/app/nav-balance";
import { BugReportButton } from "@/components/support/bug-report-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { canUsePath, planWithholdsPath, SHOP_PAINTER_MODULE_ENABLED } from "@/lib/features";
import { syncShadeCodeSchemeIdentity } from "@/hooks/use-shade-code-scheme";
import type { AuthUser, MyAccess } from "@/lib/types";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
  { href: "/ai-images", label: "AI images" },
  { href: "/my-projects", label: "Projects & credits" },
  { href: "/assigned-products", label: "My products" },
  { href: "/colour-finder", label: "Colour finder" },
  { href: "/network", label: "Network" },
  { href: "/portal", label: "Customer portal" },
  { href: "/products", label: "Products" },
  { href: "/plan", label: "Plan" },
  { href: "/inbox", label: "Inbox" },
  { href: "/admin", label: "Admin" },
] as const;

/** Padlock on a tab the shop's own plan does not include. */
function TabLock() {
  return (
    <svg className="nav-tab-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

interface AppNavProps {
  user: AuthUser | null;
  /**
   * The shop's brand + page grant from its distributor. Null when it couldn't be
   * loaded, which `canUsePath` treats as unrestricted — a backend hiccup shouldn't
   * strip a shop's tabs.
   */
  access?: MyAccess | null;
  /**
   * Whether any room is published to the free library. Defaults to false: an
   * unknown shelf shows no tab rather than one leading to an empty page.
   */
  libraryLive?: boolean;
  /**
   * Whether a paint shop stands behind this account — i.e. it holds an entitlement
   * from a redeemed access code.
   *
   * Only meaningful for CUSTOMER accounts, and it splits them in two: one kind was
   * onboarded by a shop and has products assigned to them, the other signed up alone
   * and has none. Defaults to false, so an account we could not resolve is shown one
   * tab fewer rather than one that 404s.
   */
  hasShop?: boolean;
}

export function AppNav({ user, access = null, libraryLive = false, hasShop = false }: AppNavProps) {
  // The shop's shade-code pattern is cached at module scope and nothing was clearing it,
  // so it survived a sign-out: the next account in the same tab rendered its colours with
  // the previous shop's numbering (and its "hide paint names" choice). Done during render
  // rather than in an effect because this bar renders before the page below it, and the
  // page's swatches must not read the outgoing account's answer first. Idempotent.
  syncShadeCodeSchemeIdentity(user?.id ?? null);

  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Studio mode: the workspace owns the whole viewport, so the navbar becomes
  // an auto-hide overlay — hidden until the top edge is hovered (or the small
  // handle is clicked), then it slides down over the canvas. Desktop only;
  // below 900px the CSS keeps the nav in normal flow.
  const studioMode = pathname.startsWith("/studio");
  const [revealed, setRevealed] = useState(false);
  // Scroll behaviour on the ordinary app pages — matches the public site header:
  // the bar hides as you scroll down and slides back in as you scroll up. Studio
  // keeps its own auto-hide overlay, so this is disabled there.
  const [hidden, setHidden] = useState(false);
  // Mirrors `hidden` so the scroll handler can compare without re-subscribing.
  const hiddenRef = useRef(false);
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
    // The free-room library, open to every signed-in role — the backend asks only
    // for a session to open a copy. Hidden while the shelf is empty, because the
    // page would then have nothing on it and the admin console is where rooms are
    // put there; it reappears by itself the moment something is published.
    if (t.href === "/library" && !libraryLive) return false;
    // Hierarchy console — admins, distributors and retailers manage their downline here.
    if (t.href === "/network" && (!user || (user.role !== "ADMIN" && user.role !== "DISTRIBUTOR" && user.role !== "RETAILER"))) return false;
    // A shop's downline is painters, and the painter module is still in testing.
    if (t.href === "/network" && user?.role === "RETAILER" && !SHOP_PAINTER_MODULE_ENABLED) return false;
    // The account's own AI images. Shown to everyone who can hold one, which is
    // everyone with a studio — a distributor has no rooms of their own, so the page
    // could only ever be empty for them, and the STUDIO grant below closes it for a
    // shop whose distributor withheld the studio. Deliberately NOT hidden when the
    // shelf is empty, the way Library is: an empty Library is a page with nothing on
    // it and nothing to do, while an empty "My AI images" is where somebody goes to
    // look for the picture they think they made, and hiding it answers that question
    // by making the question unaskable.
    if (t.href === "/ai-images" && user && user.role === "DISTRIBUTOR") return false;
    if (t.href === "/portal" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    if (t.href === "/products" && user && user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    // The customer's own projects + AI credits. Customers only: everyone else buys
    // through /plan, which sells the things a customer account may not hold.
    if (t.href === "/my-projects" && (!user || user.role !== "CUSTOMER")) return false;
    // A customer's assigned-products page. Two conditions, not one. Customers only,
    // because the products behind it hang off a redeemed access code — but ALSO only
    // customers who actually have one. An account that signed up on its own (a Google
    // login, an email address) has no shop behind it and no code, so the page can only
    // ever answer 404 "No access code is linked to this account": a tab leading
    // nowhere, offering products that were never assigned by a shop that does not
    // exist. `hasShop` is resolved server-side from the entitlement, which is the same
    // dividing line the backend uses to decide whether an account is a shop's customer
    // or its own.
    if (t.href === "/assigned-products" && (!user || user.role !== "CUSTOMER" || !hasShop)) return false;
    // Subscriber-only retailer tools — a customer or distributor clicking them
    // would only be bounced (neither holds a shop subscription).
    if (t.href === "/colour-finder" && user && (user.role === "CUSTOMER" || user.role === "DISTRIBUTOR")) return false;
    if (t.href === "/studio" && user && user.role === "DISTRIBUTOR") return false;
    // Plans are shop products — customer/distributor subscription pages only redirect them.
    if (t.href === "/plan" && user && (user.role === "CUSTOMER" || user.role === "DISTRIBUTOR")) return false;
    if (t.href === "/inbox" && (!user || user.role !== "ADMIN")) return false;
    if (t.href === "/admin" && (!user || user.role !== "ADMIN")) return false;
    // Last: the shop's own distributor may have switched this page off. Applied
    // after the role rules so it can only ever REMOVE a tab the role allows —
    // a grant can't hand a customer the admin console.
    //
    // A page the shop's own PLAN locks is the exception, and it KEEPS its tab. The
    // two closures are not the same thing: a distributor's is somebody else's
    // decision and the tab would only lead somewhere nobody here can help, while a
    // plan's is the shop's own to reverse — and hiding it meant the shops who had
    // never seen the tool were the only ones never told it existed. The tab carries
    // a padlock and the page behind it opens locked, making its own case.
    if (!canUsePath(access, t.href) && !planWithholdsPath(access, t.href)) return false;
    return true;
  });

  const isPlanLocked = (href: string) => planWithholdsPath(access, href);

  // Projects and AI credits are the CUSTOMER's pair of balances — the two things
  // /my-projects counts. Every other role holds something else (a shop has a monthly
  // quota and points; a distributor has neither), so the readout is offered to the one
  // role it is actually true for rather than reinterpreted per role in the navbar.
  const isCustomer = user?.role === "CUSTOMER";

  // ADMIN carries 8 tabs once the library shelf is live — the row overflows the
  // floating bar well above the 900px drawer breakpoint, so wide tab sets get
  // tighter spacing and an earlier drawer via the .nav-wide rules below.
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
      hiddenRef.current = false;
      setHidden(false);
      return;
    }
    hiddenRef.current = false;
    setHidden(false); // never start a page tucked away
    let lastY = window.scrollY;
    let ticking = false;
    const evaluate = () => {
      ticking = false;
      const y = window.scrollY;
      const delta = y - lastY;
      // Compared before setting: this runs every animation frame of every
      // scroll, for a value that changes a handful of times per page.
      let next: boolean | null = null;
      if (open || y < 80) next = false;            // near the top or menu open → visible
      else if (delta > 4) next = true;             // scrolling down → tuck up
      else if (delta < -4) next = false;           // scrolling up → bring it back
      if (next !== null && next !== hiddenRef.current) {
        hiddenRef.current = next;
        setHidden(next);
      }
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
          {/* A slim bar that is always there.
              The studio used to have no navigation at all beyond a "MENU" pill
              floating at the top centre — clipped by the viewport edge, and
              overlapped by the workspace's own "0/32 projects" badge. No back
              link, no breadcrumb, no way to the dashboard. This bar owns the
              top strip so nothing floats over the workspace.

              It carries no logo. Every pixel it takes is a pixel off the
              workspace — which is the whole point of the studio — and the
              wordmark was doing nothing here that the two text links don't do
              better: a photo is on screen, nobody is wondering whose site this
              is. Dropping it let the bar get shorter too. */}
          <div className="studio-minibar">
            <div className="studio-minibar-links">
              <Link href="/dashboard" className="studio-minibar-link">
                <span aria-hidden>←</span> Dashboard
              </Link>
              <Link href="/" className="studio-minibar-link">
                Home
              </Link>
              {/* The studio's one way to say something is broken. The floating support
                  bubble is switched off in here on purpose (it covers whichever tool it
                  is nearest), and the canvas's own "Report a problem" needs a finished
                  AI run to attach itself to — so a save that fails, an upload that never
                  returns or a wall that will not take a colour had nowhere to go. This
                  bar is the only chrome the studio always shows, which is exactly why
                  the button belongs on it. */}
              <BugReportButton className="studio-minibar-link studio-minibar-bug" />
            </div>
            <button
              type="button"
              className="studio-nav-handle"
              aria-label={revealed ? "Hide navigation" : "Show navigation"}
              aria-expanded={revealed}
              onMouseEnter={revealNav}
              onClick={() => (revealed ? setRevealed(false) : revealNav())}
            >
              <MenuIcon size={13} />
              <span>Menu</span>
            </button>
          </div>
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
        <nav
          id="app-mobile-tabs"
          aria-label="Main"
          className={`app-tabs is-mobile ${open ? "" : "is-closed"}`}
        >
          {visibleTabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}
              aria-current={pathname.startsWith(t.href) ? "page" : undefined}
              title={isPlanLocked(t.href) ? `${t.label} — on the paid plans` : undefined}
            >
              {t.label}
              {isPlanLocked(t.href) && <TabLock />}
            </Link>
          ))}
          <div className="app-drawer-meta">
            {isCustomer && <NavBalance />}
            {/* The minibar the button normally lives on is desktop-only — below 900px
                the studio stacks and that bar is hidden — so the drawer carries it
                there. Studio only: everywhere else the support bubble is on screen. */}
            {studioMode && <BugReportButton className="app-tab tap-row studio-minibar-bug" />}
            <HomeLink />
            <ThemeToggle />
            {user && (
              <Link href="/account" style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }} title="Account settings">{user.name}</Link>
            )}
            <LogoutButton
              className="app-tab tap-row"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-soft)",
                padding: "12px 16px",
                font: "400 12px/1 var(--mono)",
                letterSpacing: ".26em",
                textTransform: "uppercase",
              }}
            />
          </div>
        </nav>
        <nav aria-label="Main" className="app-tabs is-desktop">
          {visibleTabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}
              aria-current={pathname.startsWith(t.href) ? "page" : undefined}
              title={isPlanLocked(t.href) ? `${t.label} — on the paid plans` : undefined}
            >
              {t.label}
              {isPlanLocked(t.href) && <TabLock />}
            </Link>
          ))}
        </nav>
        <div className="app-nav-meta">
          {/* What the account holds, where it is spent from. See NavBalance for why
              this is customers only — a shop's two numbers are a monthly quota and a
              points balance, which are different quantities on a different page. */}
          {isCustomer && <NavBalance />}
          <HomeLink />
          <ThemeToggle />
          {user && (
            <Link href="/account" style={{ font: "300 16px/1 var(--serif)", color: "var(--fg-soft)" }} title="Account settings">{user.name}</Link>
          )}
          <LogoutButton
            className="app-tab tap-row"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-soft)",
              padding: "12px 16px",
              font: "400 12px/1 var(--mono)",
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
        /* The pill radius is on the BASE, not only on .active: every neighbour in
           this bar is round (the active tab, the theme toggle), so a tab whose
           hover/focus box came out a hard-cornered rectangle looked like a
           control nobody had styled — most visibly on Sign out, which is only
           ever seen in that state. */
        .app-tab { font: 400 12px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; padding: 12px 16px; color: var(--fg-soft); border: 1px solid transparent; border-radius: var(--radius-pill); transition: color .25s var(--ease), border-color .25s var(--ease), background .25s var(--ease); }
        .app-tab:hover { color: var(--fg); border-color: var(--rule-strong); background: rgba(var(--fg-rgb), .06); }
        .app-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-pill); }
        /* Current page = a filled pill. The focus ring stays an outline, so
           "where I am" and "where focus is" can never be confused — they used
           to be the same thin rectangle. */
        .app-tab.active {
          color: var(--bg);
          background: var(--fg);
          border-color: var(--fg);
          border-radius: var(--radius-pill);
        }
        .app-tab.active:hover { color: var(--bg); }
        .app-nav-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .app-home-link {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 14px; border-radius: var(--radius-pill);
          border: 1px solid transparent;
          font: 400 12px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase;
          color: var(--fg-soft);
          transition: color .25s var(--ease), border-color .25s var(--ease), background .25s var(--ease);
        }
        .app-home-link:hover { color: var(--fg); border-color: var(--rule-strong); background: rgba(var(--fg-rgb), .06); }
        .app-home-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
        /* The revealed nav slides down over the workspace, starting below the
           persistent bar so the two never sit on top of each other. */
        .app-header-studio .app-header-slide { margin-top: calc(var(--studio-bar-h) * -1); padding-top: calc(16px + var(--studio-bar-h)); }
        .app-header-studio .app-nav-inner { margin-top: 0; }
        .studio-nav-hotzone { position: absolute; top: 0; left: 0; right: 0; height: 16px; pointer-events: auto; }
        /* The persistent studio bar. In normal flow inside the fixed header
           shell, so it can never be clipped by the viewport edge the way an
           absolutely-positioned pill hanging off top:0 was. The full nav slides
           down OVER it when revealed. */
        .studio-minibar {
          position: relative; z-index: 1;
          height: var(--studio-bar-h);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 0 var(--gutter);
          background: var(--nav-bg); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%);
          border-bottom: 1px solid var(--rule);
          pointer-events: auto;
        }
        .studio-minibar-links { display: inline-flex; align-items: center; gap: 4px; }
        .studio-minibar-link {
          font: 400 11px/1 var(--mono); letter-spacing: .18em; text-transform: uppercase;
          color: var(--fg-mute); text-decoration: none;
          padding: 8px 10px; border-radius: 8px;
          transition: color .2s var(--ease), background .2s var(--ease);
        }
        .studio-minibar-link:hover { color: var(--fg); background: rgba(var(--fg-rgb), .06); }
        .studio-minibar-link:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
        /* The bug button wears the minibar's link styling, which the element does not
           inherit on its own: a <button> brings its own background, border and font. */
        .studio-minibar-bug {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: none; cursor: pointer;
        }
        .studio-nav-handle {
          display: inline-flex; align-items: center; gap: 8px;
          /* Sized to the bar, which the dropped logo let shrink. Desktop-only —
             below 900px the minibar is hidden and the full nav is in flow, so
             this never has to serve as a touch target. */
          padding: 8px 12px;
          background: transparent; border: 1px solid transparent; border-radius: 8px;
          color: var(--fg-mute); font: 400 12px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase;
          cursor: pointer; pointer-events: auto;
          transition: color .2s var(--ease), border-color .2s var(--ease);
        }
        .studio-nav-handle:hover { color: var(--fg); border-color: var(--rule-strong); }
        .studio-nav-handle:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
        /* Below the desktop workspace breakpoint the studio stacks and scrolls
           like any page — keep the navbar in normal flow there. */
        @media (max-width: 900px) {
          .app-header-studio { position: static; pointer-events: auto; }
          .app-header-studio .app-header-slide { transform: none; }
          .studio-nav-hotzone, .studio-minibar { display: none; }
        }
        /* Wide tab sets (ADMIN): tighten the row so 8 tabs + the user block fit
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

/**
 * The way back out to the public site.
 *
 * Signing in used to be a one-way door: the logo goes to /dashboard, every tab is
 * an app page, and nothing anywhere led back to huevista's own front page — so a
 * shop wanting the pricing table, the catalogue or "how it works" had to edit the
 * URL. It sits with the account block rather than among the tabs because it is not
 * one of the app's sections, and because a tab matching "/" would light up as the
 * current page on every route.
 */
function HomeLink() {
  return (
    <Link href="/" className="app-home-link" title="HueVista home — the public site">
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V20h13V9.5" />
      </svg>
      Home
    </Link>
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
