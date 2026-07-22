import type { CSSProperties } from "react";

export interface SectionNavItem {
  /** The id of the target section on the page (without the leading #). */
  id: string;
  /** Short card label. */
  label: string;
  /** Optional one-line hint under the label. */
  hint?: string;
}

/**
 * A row of cards that jump to sections further down the same page. Pure anchor
 * links (`#id`) — no JS — so it works before hydration; pair it with an `id` and
 * `scroll-margin-top` on each target section so the sticky app navbar doesn't
 * cover the heading it lands on. Used on long admin/portal pages where the
 * working sections (wallet, audit, subscriptions…) are a long scroll apart.
 */
export function SectionNav({ items, style }: { items: SectionNavItem[]; style?: CSSProperties }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Jump to section"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
        ...style,
      }}
    >
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className="section-nav-card"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "14px 16px",
            border: "1px solid var(--rule-strong)",
            borderRadius: 10,
            background: "var(--surface-soft)",
            textDecoration: "none",
            transition: "border-color .2s var(--ease), transform .2s var(--ease)",
          }}
        >
          <span style={{ font: "400 11px/1.2 var(--mono)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--fg)", display: "flex", justifyContent: "space-between", gap: 8 }}>
            {it.label}
            <span aria-hidden style={{ color: "var(--accent)" }}>↓</span>
          </span>
          {it.hint && (
            <span style={{ font: "300 13px/1.4 var(--serif)", color: "var(--fg-mute)" }}>{it.hint}</span>
          )}
        </a>
      ))}
      <style>{`
        .section-nav-card:hover { border-color: var(--accent); transform: translateY(-1px); }
        .section-nav-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>
    </nav>
  );
}
