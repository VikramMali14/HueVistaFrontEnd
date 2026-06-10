"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { LogoutButton } from "@/components/auth/logout-button";

// --- Menu model -----------------------------------------------------------
// A top item is either a plain link or a dropdown with link columns and an
// optional column of feature cards (the Squarespace-style mega panel).
type Leaf = { href: string; label: string; desc?: string };
type Column = { title: string; links: ReadonlyArray<Leaf> };
type Card = { href: string; title: string; desc: string };
type MenuItem =
  | { label: string; href: string }
  | { label: string; columns: ReadonlyArray<Column>; cards?: ReadonlyArray<Card> };

// NOTE: "/color-finder" is a subscriber-only tool — it gates to pricing/sign-in
// for visitors without an active subscription, so it's safe to surface here.
const MENU: ReadonlyArray<MenuItem> = [
  {
    label: "Product",
    columns: [
      {
        title: "Visualise",
        links: [
          { href: "/catalogue", label: "Catalogue", desc: "2,481 shades · codes intact" },
          { href: "/color-finder", label: "Colour Finder", desc: "Photo → shade code" },
          { href: "/gallery", label: "Gallery", desc: "Rooms · only the wall changed" },
          { href: "/journal", label: "Journal", desc: "Notes from the counter" },
        ],
      },
    ],
    cards: [
      { href: "/trial", title: "Start free", desc: "14 days. No card needed to begin." },
      { href: "/redeem", title: "Have a shop code?", desc: "Redeem it to visualise your own room." },
    ],
  },
  { label: "How it works", href: "/method" },
  { label: "Our work", href: "/work" },
  { label: "Pricing", href: "/pricing" },
];

interface NavProps {
  showCta?: boolean;
  showSignIn?: boolean;
  /** When true, the visitor has an active session: show the account avatar plus
   *  a sign-out control instead of the Sign in / trial CTAs. */
  authed?: boolean;
  themeToggle?: ReactNode;
}

export function Nav({ showCta = true, showSignIn = true, authed = false, themeToggle }: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Portal target only exists on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the drawer + any open dropdown on route change.
  useEffect(() => {
    setOpen(false);
    setOpenMenu(null);
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
    <nav className="nav" onMouseLeave={() => setOpenMenu(null)}>
      <div className="nav-inner">
        <Link href="/" className="brand-logo" aria-label="HueVista — home">
          <Logo size="sm" framed={false} subtitle={false} style={{ color: "var(--ivory)" }} ariaLabel={null} />
        </Link>

        <div className="nav-links" onKeyDown={(e) => e.key === "Escape" && setOpenMenu(null)}>
          {MENU.map((item) =>
            "href" in item ? (
              <Link
                key={item.label}
                href={item.href}
                className={`nav-link${isActive(item.href) ? " active" : ""}`}
              >
                {item.label}
              </Link>
            ) : (
              <div
                key={item.label}
                className="nav-group"
                onMouseEnter={() => setOpenMenu(item.label)}
              >
                <button
                  type="button"
                  className={`nav-link nav-trigger${openMenu === item.label ? " active" : ""}`}
                  aria-haspopup="true"
                  aria-expanded={openMenu === item.label}
                  onClick={() => setOpenMenu((m) => (m === item.label ? null : item.label))}
                  onFocus={() => setOpenMenu(item.label)}
                >
                  {item.label}
                  <span className={`nav-caret${openMenu === item.label ? " is-open" : ""}`} aria-hidden>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M1 1l4 4 4-4" />
                    </svg>
                  </span>
                </button>

                <div className={`nav-panel${openMenu === item.label ? " is-open" : ""}`} role="menu">
                  <div className="nav-panel-inner">
                    <div className="nav-panel-cols">
                      {item.columns.map((col) => (
                        <div key={col.title} className="nav-col">
                          <span className="nav-col-title">{col.title}</span>
                          {col.links.map((l) => (
                            <Link key={l.href} href={l.href} className="nav-leaf" role="menuitem">
                              <span className="nav-leaf-label">{l.label}</span>
                              {l.desc && <span className="nav-leaf-desc">{l.desc}</span>}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                    {item.cards && (
                      <div className="nav-panel-cards">
                        {item.cards.map((c) => (
                          <Link key={c.href} href={c.href} className="nav-card" role="menuitem">
                            <span className="nav-card-title">{c.title}</span>
                            <span className="nav-card-desc">{c.desc}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="nav-actions">
          {themeToggle}
          {authed ? (
            <>
              <Link href="/dashboard" className="nav-avatar" aria-label="Your dashboard">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                </svg>
              </Link>
              <LogoutButton className="nav-link nav-signin" />
            </>
          ) : (
            <>
              {showSignIn && (
                <Link href="/sign-in" className="nav-link nav-signin">
                  Sign in
                </Link>
              )}
              {showCta && (
                <Link href="/trial" className="nav-cta">
                  Get started
                </Link>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="nav-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="nav-menu-toggle"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Drawer + scrim are portalled to <body>: the sticky .nav has a backdrop-filter,
          which would otherwise act as the containing block for these position:fixed
          elements and clip the full-height drawer to the nav bar's height. */}
      {mounted &&
        createPortal(
          <>
            <div id="nav-mobile-menu" className={`nav-mobile${open ? " is-open" : ""}`} aria-hidden={!open}>
              {MENU.map((item) =>
                "href" in item ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`nav-mobile-link${isActive(item.href) ? " active" : ""}`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <div key={item.label} className="nav-mobile-group">
                    <span className="nav-mobile-group-title">{item.label}</span>
                    {item.columns.flatMap((col) => col.links).map((l) => (
                      <Link key={l.href} href={l.href} className="nav-mobile-link is-sub">
                        {l.label}
                      </Link>
                    ))}
                    {item.cards?.map((c) => (
                      <Link key={c.href} href={c.href} className="nav-mobile-link is-sub">
                        {c.title}
                      </Link>
                    ))}
                  </div>
                ),
              )}
              <div className="nav-mobile-foot">
                {authed ? (
                  <>
                    <Link href="/dashboard" className="nav-mobile-link">
                      My projects
                    </Link>
                    <LogoutButton className="nav-mobile-link" />
                  </>
                ) : (
                  <>
                    {showSignIn && (
                      <Link href="/sign-in" className="nav-mobile-link">
                        Sign in
                      </Link>
                    )}
                    {showCta && (
                      <Link href="/trial" className="nav-cta nav-mobile-cta">
                        Get started <span className="arr">→</span>
                      </Link>
                    )}
                  </>
                )}
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
          </>,
          document.body,
        )}
    </nav>
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
