"use client";

import { useEffect, useRef, useState } from "react";

export interface SectionNavItem {
  /** The id of the target section on the page (without the leading #). */
  id: string;
  /** Short card label. */
  label: string;
  /** Optional one-line hint under the label. */
  hint?: string;
}

/**
 * A FIXED side navigation menu that jumps to sections further down the same page.
 * Collapsed to a slim vertical tab pinned to the right edge; it slides open on
 * hover (desktop) or a tap/click of the tab, revealing the section list. Anchor
 * links (`#id`) — pair each with an `id` and `scroll-margin-top` on the target
 * section so the sticky app navbar doesn't cover the heading it lands on. Used on
 * long admin/portal pages where the working sections are a long scroll apart.
 */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  // Debounced open/close so crossing the small gap between the tab and the panel
  // never flickers the menu shut mid-move.
  const reveal = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  // Escape closes; a click/tap outside closes (covers touch, where there's no hover).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Jump to section"
      className={`hv-sidenav${open ? " is-open" : ""}`}
      onMouseEnter={reveal}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="hv-sidenav-tab"
        aria-expanded={open}
        aria-controls="hv-sidenav-panel"
        onClick={() => setOpen((v) => !v)}
        onFocus={reveal}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="hv-sidenav-tab-label">Sections</span>
      </button>

      <div className="hv-sidenav-panel" id="hv-sidenav-panel" role="menu" aria-hidden={!open}>
        <div className="hv-sidenav-heading">On this page</div>
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            className="hv-sidenav-link"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
          >
            <span className="hv-sidenav-link-label">
              {it.label}
              <span aria-hidden className="hv-sidenav-link-arrow">↓</span>
            </span>
            {it.hint && <span className="hv-sidenav-link-hint">{it.hint}</span>}
          </a>
        ))}
      </div>

      <style>{`
        .hv-sidenav {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          z-index: 70;
          display: flex;
          align-items: center;
          /* row-reverse: the tab sits flush to the viewport edge, the panel grows
             out to its left. */
          flex-direction: row-reverse;
        }
        .hv-sidenav-tab {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 8px;
          background: var(--nav-bg);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          backdrop-filter: blur(18px) saturate(150%);
          border: 1px solid var(--rule-strong);
          border-right: none;
          border-radius: 12px 0 0 12px;
          color: var(--fg-mute);
          cursor: pointer;
          box-shadow: -12px 0 32px -20px rgba(0,0,0,.5);
          transition: color .2s var(--ease), background .2s var(--ease);
        }
        .hv-sidenav-tab:hover, .hv-sidenav.is-open .hv-sidenav-tab { color: var(--fg); }
        .hv-sidenav-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .hv-sidenav-tab-label {
          writing-mode: vertical-rl;
          font: 400 10px/1 var(--mono);
          letter-spacing: .26em;
          text-transform: uppercase;
        }
        .hv-sidenav-panel {
          width: min(300px, 78vw);
          max-height: 78vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px;
          margin-right: 6px;
          background: var(--nav-bg-strong, var(--surface));
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid var(--rule-strong);
          border-radius: 14px;
          box-shadow: 0 24px 60px -28px rgba(0,0,0,.7);
          /* Collapsed: tucked off the right edge and non-interactive. */
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateX(12px);
          transition: opacity .26s var(--ease), transform .26s var(--ease), visibility .26s;
        }
        .hv-sidenav.is-open .hv-sidenav-panel {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: none;
        }
        .hv-sidenav-heading {
          font: 400 9px/1 var(--mono);
          letter-spacing: .28em;
          text-transform: uppercase;
          color: var(--fg-mute);
          padding: 2px 6px 10px;
        }
        .hv-sidenav-link {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid transparent;
          text-decoration: none;
          transition: border-color .18s var(--ease), background .18s var(--ease);
        }
        .hv-sidenav-link:hover { border-color: var(--accent); background: var(--surface-soft); }
        .hv-sidenav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .hv-sidenav-link-label {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font: 400 11px/1.2 var(--mono);
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--fg);
        }
        .hv-sidenav-link-arrow { color: var(--accent); }
        .hv-sidenav-link-hint { font: 300 13px/1.4 var(--serif); color: var(--fg-mute); }
        @media (max-width: 640px) {
          .hv-sidenav-tab { padding: 12px 6px; }
          .hv-sidenav-tab-label { letter-spacing: .2em; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hv-sidenav-panel { transition: opacity .01s, visibility .01s; transform: none; }
        }
      `}</style>
    </nav>
  );
}
