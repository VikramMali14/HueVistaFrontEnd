"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";

const NAV_SECTIONS = [
  {
    section: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "■" },
      { href: "/atelier", label: "Visualiser", icon: "▣" },
      { href: "/portal", label: "Customer codes", icon: "◫" },
    ],
  },
] as const;

interface SidebarProps {
  user: AuthUser | null;
  themeToggle?: ReactNode;
}

export function Sidebar({ user, themeToggle }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="csidebar">
      <div className="csidebar-brand">
        <span className="dot" />
        HueVista
      </div>
      {NAV_SECTIONS.map((sec) => (
        <div key={sec.section}>
          <div className="csidebar-section">{sec.section}</div>
          {sec.links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} className={`csidebar-link${active ? " active" : ""}`}>
                <span aria-hidden style={{ width: 16, display: "inline-block", textAlign: "center", opacity: 0.7 }}>{l.icon}</span>
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="csidebar-foot">
        {themeToggle}
        <div style={{ flex: 1 }}>
          {user && (
            <>
              <div className="name">{user.name}</div>
              <div style={{ fontSize: 12, color: "var(--fg-mute)" }}>{user.email}</div>
            </>
          )}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            style={{ background: "transparent", border: "1px solid var(--rule-strong)", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "var(--fg-soft)", font: "500 12px/1 var(--sans)" }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
