"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";

const TABS = [
  { href: "/atelier", label: "iii · Atelier" },
  { href: "/dashboard", label: "v · Suite" },
  { href: "/portal", label: "vi · Annex" },
] as const;

interface AppNavProps { user: AuthUser | null; }

export function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  const folio = pathname.includes("dashboard") ? "v" : pathname.includes("portal") ? "vi" : "iii";
  return (
    <header>
      <div className="masthead-strip">
        <span>established · mmxxvi</span>
        <span><span className="dot" />&nbsp;&nbsp;hue vista · belgavi · india&nbsp;&nbsp;<span className="dot" /></span>
        <span>folio · {folio}</span>
      </div>
      <div className="app-nav-inner">
        <Link href="/" className="brand" style={{ fontSize: 24 }}><span className="brand-mark" />HueVista</Link>
        <div className="app-tabs">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`app-tab${pathname.startsWith(t.href) ? " active" : ""}`}>{t.label}</Link>
          ))}
        </div>
        <div className="app-nav-meta">
          {user && (<span style={{ font: "300 italic 16px/1 var(--serif)", color: "var(--ivory-soft)" }}>{user.name}</span>)}
          <form action={logoutAction}>
            <button type="submit" className="app-tab" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--mute)" }}>Sign out</button>
          </form>
        </div>
      </div>
      <style>{`
        .masthead-strip { background: #0a0805; color: var(--ivory-soft); border-bottom: 1px solid var(--rule); padding: 10px var(--gutter); font: 400 10px/1 var(--mono); letter-spacing: .32em; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; }
        .masthead-strip .dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--brass); }
        .app-nav-inner { background: rgba(21,17,13,.92); backdrop-filter: blur(20px) saturate(140%); border-bottom: 1px solid var(--rule); padding: 18px var(--gutter); display: flex; align-items: center; gap: 32px; position: sticky; top: 0; z-index: 60; }
        .app-tabs { display: flex; gap: 8px; margin-left: auto; }
        .app-tab { font: 400 11px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; padding: 12px 16px; color: var(--mute); border: 1px solid transparent; transition: color .25s var(--ease), border-color .25s var(--ease); }
        .app-tab.active, .app-tab:hover { color: var(--ivory); border-color: var(--rule-strong); }
        .app-nav-meta { display: flex; align-items: center; gap: 16px; }
      `}</style>
    </header>
  );
}
