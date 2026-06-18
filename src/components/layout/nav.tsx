"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Logo } from "@/components/ui/logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// --- Menu model -----------------------------------------------------------
// The public nav is a floating, glassy "card nav" (reactbits CardNav style):
// a compact pill that expands into a row of cards. Every destination from the
// old mega-menu is preserved — just regrouped into three cards. The Colour
// Finder stays a signed-in tool and lives in the app nav, not here.
type CardLink = { href: string; label: string };
type NavCard = { key: string; label: string; links: ReadonlyArray<CardLink> };

interface NavProps {
  showCta?: boolean;
  showSignIn?: boolean;
  /** When true the visitor has an active session: the third card and the right
   *  cluster show account + sign-out instead of Sign in. */
  authed?: boolean;
}

export function Nav({ showCta = true, showSignIn = true, authed = false }: NavProps) {
  const pathname = usePathname();
  // `open` = intent (drives aria, scrim, tab-order, the burger glyph) and flips
  // immediately. `panelVisible` keeps the panel rendered through the close
  // animation and flips false only when the reverse finishes. `openRef` is the
  // synchronous source of truth so rapid clicks can't desync.
  const [open, setOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const openRef = useRef(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<Array<HTMLDivElement | null>>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const cards: ReadonlyArray<NavCard> = [
    {
      key: "product",
      label: "Product",
      links: [
        { href: "/catalogue", label: "Catalogue" },
        { href: "/gallery", label: "Gallery" },
        { href: "/journal", label: "Journal" },
      ],
    },
    {
      key: "company",
      label: "Company",
      links: [
        { href: "/method", label: "How it works" },
        { href: "/work", label: "Our work" },
        { href: "/pricing", label: "Pricing" },
      ],
    },
    {
      key: "start",
      label: "Get started",
      links: [
        { href: "/trial", label: "Start free — 14 days" },
        { href: "/redeem", label: "Have a shop code?" },
        authed ? { href: "/dashboard", label: "My projects" } : { href: "/sign-in", label: "Sign in" },
      ],
    },
  ];

  // Build the open/close timeline once the cards are in the DOM. Rebuilt when
  // the card set changes (e.g. auth state), so the measured height stays right.
  // useEffect (not layout) is fine — the panel is already closed via CSS, so
  // there is no first-paint flash to guard against.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : 0.42;
    const cardDur = reduce ? 0 : 0.4;

    const ctx = gsap.context(() => {
      gsap.set(panel, { height: 0, overflow: "hidden" });
      const cardEls = cardsRef.current.filter(Boolean) as HTMLDivElement[];
      gsap.set(cardEls, { y: 28, opacity: 0 });

      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.out" },
        onReverseComplete: () => setPanelVisible(false),
      });
      tl.to(panel, { height: () => panel.scrollHeight, duration: dur });
      tl.to(cardEls, { y: 0, opacity: 1, duration: cardDur, stagger: reduce ? 0 : 0.08 }, reduce ? ">" : "-=0.22");
      tlRef.current = tl;
    });

    return () => ctx.revert();
  }, [authed, showSignIn]);

  // Single source of truth for open/close. openRef updates synchronously so a
  // rapid second click always sees the latest intent and toggles correctly.
  const setMenu = (next: boolean) => {
    const tl = tlRef.current;
    if (!tl) return;
    openRef.current = next;
    setOpen(next);
    if (next) {
      setPanelVisible(true);
      tl.play(0);
    } else {
      tl.reverse();
    }
  };
  const toggle = () => setMenu(!openRef.current);
  const close = () => {
    if (openRef.current) setMenu(false);
  };

  // Keep the expanded height correct if the viewport changes while open.
  // Guarded on `open` (which flips false the instant a close starts), so it
  // never fights an in-flight close animation. invalidate() forces GSAP to
  // re-read the function-based height on the next play/reverse.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      gsap.set(panel, { height: "auto" });
      gsap.set(panel, { height: panel.scrollHeight });
      tlRef.current?.invalidate();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <header className="cnav-wrap">
      <nav className={`cnav${panelVisible ? " is-open" : ""}`} aria-label="Primary">
        <div className="cnav-bar">
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

          <Link href="/" className="cnav-logo" aria-label="HueVista — home" onClick={close}>
            <Logo size="sm" framed={false} subtitle={false} style={{ color: "var(--fg)" }} ariaLabel={null} />
          </Link>

          <div className="cnav-actions">
            <ThemeToggle />
            {authed ? (
              <>
                <Link href="/dashboard" className="cnav-avatar" aria-label="Your dashboard">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                  </svg>
                </Link>
                <LogoutButton className="cnav-signin" />
              </>
            ) : (
              <>
                {showSignIn && (
                  <Link href="/sign-in" className="cnav-signin">
                    Sign in
                  </Link>
                )}
                {showCta && (
                  <Link href="/trial" className="cnav-cta">
                    Get started <span className="arr">→</span>
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        <div className="cnav-panel" id="cnav-panel" ref={panelRef} aria-hidden={!open}>
          <div className="cnav-cards">
            {cards.map((card, i) => (
              <div
                key={card.key}
                className="cnav-card"
                data-card={card.key}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
              >
                <span className="cnav-card-label">{card.label}</span>
                <ul className="cnav-card-links">
                  {card.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className={`cnav-card-link${isActive(l.href) ? " active" : ""}`}
                        tabIndex={open ? 0 : -1}
                        onClick={close}
                      >
                        <svg className="cnav-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M7 17 17 7M8 7h9v9" />
                        </svg>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  {/* The right-cluster sign-out is hidden ≤768px, so without this an
                      authenticated user has no way to log out on mobile. */}
                  {card.key === "start" && authed && (
                    <li>
                      <LogoutButton className="cnav-card-link" style={{ color: "var(--fg)" }} />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Click-catcher: closes the menu when the page behind the pill is clicked. */}
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
