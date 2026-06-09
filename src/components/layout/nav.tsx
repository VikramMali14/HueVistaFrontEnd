"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { LogoutButton } from "@/components/auth/logout-button";

// NOTE: "/color-finder" is intentionally NOT here — it's a subscriber-only tool
// now (gated in middleware + the page), so it must not be advertised publicly.
const LINKS = [
  { href: "/method", label: "The Method" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/gallery", label: "Gallery" },
  { href: "/pricing", label: "Pricing" },
  { href: "/journal", label: "Journal" },
] as const;

interface NavProps {
  showCta?: boolean;
  showSignIn?: boolean;
  /** When true, the visitor has an active session: show the way back into the
   *  app plus a sign-out control instead of the Sign in / trial CTAs. */
  authed?: boolean;
  themeToggle?: ReactNode;
  variantToggle?: ReactNode;
}

export function Nav({ showCta = true, showSignIn = true, authed = false, themeToggle, variantToggle }: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Portal target only exists on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the drawer on route change.
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
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand-logo" aria-label="HueVista — home">
          <Logo size="sm" inverted ariaLabel={null} />
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${isActive(l.href) ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        {variantToggle}
        {themeToggle}
        {authed ? (
          <>
            <Link
              href="/dashboard"
              className={`nav-link nav-signin${isActive("/dashboard") ? " active" : ""}`}
              style={{ marginLeft: 0 }}
            >
              My projects
            </Link>
            <LogoutButton className="nav-link nav-signin" />
          </>
        ) : (
          <>
            {showSignIn && (
              <Link href="/sign-in" className="nav-link nav-signin" style={{ marginLeft: 0 }}>
                Sign in
              </Link>
            )}
            {showCta && (
              <Link href="/trial" className="nav-cta">
                Begin a trial <span className="arr">→</span>
              </Link>
            )}
          </>
        )}
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
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`nav-mobile-link${isActive(l.href) ? " active" : ""}`}
                >
                  {l.label}
                </Link>
              ))}
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
                        Begin a trial <span className="arr">→</span>
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
