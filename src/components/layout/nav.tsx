"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const PUBLIC_LINKS = [
  { href: "/method", label: "How it works" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/gallery", label: "Gallery" },
  { href: "/pricing", label: "Pricing" },
  { href: "/journal", label: "Journal" },
  { href: "/redeem", label: "Redeem" },
] as const;

interface NavProps {
  showCta?: boolean;
  showSignIn?: boolean;
  authed?: boolean;
}

export function Nav({ showCta = true, showSignIn = true, authed = false }: NavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const openRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : 0.32;

    const ctx = gsap.context(() => {
      gsap.set(panel, { height: 0, overflow: "hidden" });
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.out" },
        onReverseComplete: () => setPanelVisible(false),
      });
      tl.to(panel, { height: () => panel.scrollHeight, duration: dur });
      tlRef.current = tl;
    });
    return () => ctx.revert();
  }, [authed]);

  const setMenu = (next: boolean) => {
    const tl = tlRef.current;
    if (!tl) return;
    openRef.current = next;
    setOpen(next);
    if (next) { setPanelVisible(true); tl.play(0); }
    else { tl.reverse(); }
  };
  const toggle = () => setMenu(!openRef.current);
  const close = () => { if (openRef.current) setMenu(false); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mobileLinks = authed
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/atelier", label: "Studio" },
        ...PUBLIC_LINKS,
      ]
    : [
        ...PUBLIC_LINKS,
        { href: "/work", label: "Our work" },
        { href: "/join", label: "Create account" },
        { href: "/sign-in", label: "Sign in" },
      ];

  return (
    <header className="cnav-wrap">
      <nav className={`cnav${panelVisible ? " is-open" : ""}`} aria-label="Primary">
        <div className="cnav-bar">
          {/* Logo */}
          <Link href="/" className="cnav-logo" onClick={close} aria-label="HueVista — home">
            HueVista
          </Link>

          {/* Desktop links */}
          <div className="cnav-links">
            {PUBLIC_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`cnav-link${isActive(l.href) ? " active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
            {authed && (
              <Link href="/atelier" className={`cnav-link${isActive("/atelier") ? " active" : ""}`}>
                Studio
              </Link>
            )}
          </div>

          {/* Desktop right cluster */}
          <div className="cnav-actions">
            <ThemeToggle />
            {authed ? (
              <>
                <Link href="/dashboard" className="cnav-avatar" aria-label="Dashboard">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                  </svg>
                </Link>
                <LogoutButton className="cnav-signin" />
              </>
            ) : (
              <>
                {showSignIn && (
                  <Link href="/sign-in" className="cnav-signin">Sign in</Link>
                )}
                {showCta && (
                  <Link href="/join" className="cnav-cta">
                    Get started <span className="arr">→</span>
                  </Link>
                )}
              </>
            )}

            {/* Mobile hamburger */}
            <button
              type="button"
              className={`cnav-burger${open ? " is-open" : ""}`}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="cnav-panel"
              onClick={toggle}
            >
              <span className="cnav-burger-line" />
              <span className="cnav-burger-line" />
              <span className="cnav-burger-label">Menu</span>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div className="cnav-panel" id="cnav-panel" ref={panelRef} aria-hidden={!open}>
          <div className="cnav-panel-links">
            {mobileLinks.map((l, i) => (
              <Link
                key={`${l.href}-${i}`}
                href={l.href}
                className={`cnav-panel-link${isActive(l.href) ? " active" : ""}`}
                tabIndex={open ? 0 : -1}
                onClick={close}
              >
                {l.label}
              </Link>
            ))}
            {authed && (
              <>
                <div className="cnav-panel-divider" />
                <LogoutButton
                  className="cnav-panel-link"
                  style={{ color: "rgba(var(--fg-rgb), .72)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                />
              </>
            )}
          </div>
        </div>
      </nav>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="cnav-scrim"
          tabIndex={-1}
          onClick={close}
        />
      )}
    </header>
  );
}
