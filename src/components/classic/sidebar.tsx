"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/auth";
import { t } from "@/lib/i18n";
import type { AuthUser, UiLocale } from "@/lib/types";

interface SidebarProps {
  user: AuthUser | null;
  locale: UiLocale;
  themeToggle?: ReactNode;
  variantToggle?: ReactNode;
  localeToggle?: ReactNode;
}

export function Sidebar({ user, locale, themeToggle, variantToggle, localeToggle }: SidebarProps) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: t(locale, "sidebar.dashboard"), icon: "■" },
    { href: "/atelier", label: t(locale, "sidebar.visualiser"), icon: "▣" },
    { href: "/portal", label: t(locale, "sidebar.customerCodes"), icon: "◫" },
  ];
  return (
    <aside className="csidebar">
      <div className="csidebar-brand">
        <span className="dot" />
        HueVista
      </div>
      <div>
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link key={l.href} href={l.href} className={`csidebar-link${active ? " active" : ""}`}>
              <span aria-hidden style={{ width: 16, display: "inline-block", textAlign: "center", opacity: 0.7 }}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="csidebar-foot">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {localeToggle}
          {variantToggle}
          {themeToggle}
        </div>
        <div style={{ flex: 1 }}>
          {user && <div className="name">{user.name}</div>}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label={t(locale, "common.signOut")}
            title={t(locale, "common.signOut")}
            style={{ background: "transparent", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--fg-soft)", font: "500 12px/1 var(--sans)" }}
          >
            {t(locale, "common.signOut")}
          </button>
        </form>
      </div>
    </aside>
  );
}
