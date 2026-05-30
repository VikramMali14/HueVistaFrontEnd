"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

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
  themeToggle?: ReactNode;
  variantToggle?: ReactNode;
}

export function Nav({ showCta = true, showSignIn = true, themeToggle, variantToggle }: NavProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

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
        {showSignIn && (
          <Link href="/sign-in" className="nav-link" style={{ marginLeft: 0 }}>
            Sign in
          </Link>
        )}
        {showCta && (
          <Link href="/trial" className="nav-cta">
            Begin a trial <span className="arr">→</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
