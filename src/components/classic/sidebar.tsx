"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Logo } from "@/components/ui/logo";
import { t } from "@/lib/i18n";
import type { AuthUser, UiLocale } from "@/lib/types";

interface SidebarProps {
  user: AuthUser | null;
  locale: UiLocale;
  themeToggle?: ReactNode;
  variantToggle?: ReactNode;
  localeToggle?: ReactNode;
}

type IconName = "home" | "preview" | "link";

export function Sidebar({ user, locale, themeToggle, variantToggle, localeToggle }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const allLinks: ReadonlyArray<{
    href: string;
    label: string;
    icon: IconName;
    roles: ReadonlyArray<AuthUser["role"]> | null;
  }> = [
    { href: "/dashboard", label: t(locale, "sidebar.dashboard"), icon: "home", roles: null },
    { href: "/atelier", label: t(locale, "sidebar.visualiser"), icon: "preview", roles: null },
    { href: "/portal", label: t(locale, "sidebar.customerCodes"), icon: "link", roles: ["RETAILER", "ADMIN"] },
  ];

  const links = allLinks.filter((l) => {
    if (!l.roles) return true;
    if (!user) return false;
    return l.roles.includes(user.role);
  });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="mobile-app-bar">
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="classic-sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <Link href="/dashboard" className="brand-logo" aria-label="HueVista — home">
          <Logo size="sm" inverted ariaLabel={null} />
        </Link>
        <div style={{ display: "flex", gap: 6 }}>
          {localeToggle}
          {themeToggle}
        </div>
      </div>
      <aside id="classic-sidebar" className={`csidebar ${open ? "is-open" : ""}`}>
        <div className="csidebar-brand">
          <Link href="/dashboard" className="brand-logo" aria-label="HueVista — home">
            <Logo size="sm" inverted ariaLabel={null} />
          </Link>
        </div>
        <nav aria-label="Primary">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`csidebar-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon name={l.icon} />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="csidebar-foot">
          {user && (
            <div className="csidebar-user">
              <div
                aria-hidden
                className="csidebar-user-avatar"
                style={{ background: avatarColor(user.name || user.email) }}
              >
                {initials(user.name || user.email)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="csidebar-user-name" title={user.email}>{user.name}</div>
                <div className="csidebar-user-role">
                  {user.role === "ADMIN"
                    ? "Administrator"
                    : user.role === "RETAILER"
                      ? "Retailer"
                      : user.role === "DISTRIBUTOR"
                        ? "Distributor"
                        : "User"}
                </div>
              </div>
            </div>
          )}
          <div className="csidebar-toggles">
            {localeToggle}
            {variantToggle}
            {themeToggle}
          </div>
          <LogoutButton label={t(locale, "common.signOut")} />
        </div>
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="mobile-scrim"
          onClick={() => setOpen(false)}
        />
      )}
      <style>{`
        .mobile-app-bar { display: none; }
        .csidebar-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--rule);
          margin-bottom: 12px;
          width: 100%;
        }
        .csidebar-user-avatar {
          width: 36px; height: 36px;
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font: 600 12px/1 var(--sans, system-ui);
          color: #fff;
          letter-spacing: 0.04em;
        }
        .csidebar-user-name {
          font: 600 13px/1.3 var(--sans, system-ui);
          color: var(--fg);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .csidebar-user-role {
          font: 500 11px/1 var(--sans, system-ui);
          color: var(--fg-mute);
          letter-spacing: 0.04em;
          margin-top: 4px;
        }
        .csidebar-toggles {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          width: 100%;
          margin-bottom: 12px;
        }
        @media (max-width: 768px) {
          .mobile-app-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px var(--gutter);
            background: var(--surface);
            border-bottom: 1px solid var(--rule);
            position: sticky; top: 0; z-index: 70;
          }
        }
      `}</style>
    </>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { flexShrink: 0 },
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "preview":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="1" />
          <path d="M3 14l4-4 4 4 5-5 5 5" />
          <circle cx="8" cy="8.5" r="1.2" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l1.5-1.5" />
        </svg>
      );
  }
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

function initials(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// Deterministic pleasant accent colours, derived from a hash of the name.
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = [
    "linear-gradient(135deg, #1d4ed8, #3b82f6)",
    "linear-gradient(135deg, #b89968, #8a6f48)",
    "linear-gradient(135deg, #16a34a, #15803d)",
    "linear-gradient(135deg, #c2410c, #9a3412)",
    "linear-gradient(135deg, #7c3aed, #5b21b6)",
    "linear-gradient(135deg, #0891b2, #0e7490)",
  ];
  return palette[hash % palette.length]!;
}
