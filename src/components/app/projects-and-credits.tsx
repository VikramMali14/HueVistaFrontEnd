"use client";

import { useCallback, useState } from "react";
import { AiCreditWallet } from "@/components/app/ai-credit-wallet";
import { AiImagesStrip } from "@/components/app/ai-images-strip";
import { CreditsCart } from "@/components/app/credits-cart";
import { CustomerProjectsPanel } from "@/components/app/customer-projects-panel";

/**
 * The customer's billing page, in the order a statement of account is read:
 * what you hold, what it bought you, and then what else is for sale.
 *
 * <b>Why they need wiring at all.</b> Two of these panels COUNT what the account holds
 * and a third SELLS it, and each fetched once on mount and never again. So the most
 * ordinary thing anybody does on this page — buy three AI credits — left the balance
 * still reading whatever it read before the payment. The purchase had gone through, the
 * money had left, and the only screen the buyer had for checking said nothing had
 * changed. People bought twice. The cart reports a completed purchase through
 * {@code onPurchased}; that bumps a {@code reloadKey} the counting panels refetch on.
 * Deliberately a shared key rather than each panel polling: nothing here changes except
 * as a result of a payment made here, so a poll would be a request every few seconds to
 * be told what the page already knows.
 *
 * <b>Why this order.</b> The page is called "Projects &amp; credits" and it is reached
 * from the navbar's own balance — people arrive to see where they stand. It used to open
 * with the till: a 1,400px price list, four boxed options and a coupon rack, with the two
 * balances pushed into a 340px rail beside it and the pictures they had already paid for
 * a further screen below that. On a phone the shop ran for two full screens before the
 * account appeared at all. The argument for that was that most arrivals come from a "buy
 * another" link and have already answered "what do I have" — but a customer who followed
 * a buy link has not stopped wanting to know what they hold, and the ones who came to
 * check were being sold to first. Balances, then the pictures those credits bought, then
 * the shop. Nothing is gone; the page just answers before it asks.
 *
 * <b>Why a client component around a server page.</b> The page itself is a server
 * component and should stay one — it is the thing that enforces CUSTOMER-only access.
 * State shared between siblings has to live in a common parent, so this is the smallest
 * possible parent that can hold it.
 */
export function ProjectsAndCredits() {
  const [reloadKey, setReloadKey] = useState(0);
  const onPurchased = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="hv-pac">
      {/* ── What you hold ────────────────────────────────────────────────
          The two balances read as one statement: a pair of columns under a
          single rule, not two cards floating in a rail. They are the same kind
          of fact and they are compared with each other constantly ("do I have a
          project AND a credit for what I want to do?"), which a shared baseline
          says and two bordered boxes do not.

          `describe={false}`: both panels can explain what a project or a credit
          IS, and the shop below defines each one where it sells it. Said here as
          well, the page states the same two facts three times, which is most of
          what made it read as a wall of text. */}
      <section className="hv-pac-statement" aria-label="What your account holds">
        <div className="hv-pac-stat">
          <CustomerProjectsPanel showBuy={false} describe={false} reloadKey={reloadKey} />
        </div>
        <div className="hv-pac-stat">
          <AiCreditWallet showBuy={false} describe={false} reloadKey={reloadKey} />
        </div>
      </section>

      {/* ── What they bought ─────────────────────────────────────────────
          Renders nothing until there is a picture to show, so an account that
          has not made one yet goes straight from the balances to the shop. */}
      <AiImagesStrip />

      {/* ── What else is for sale ────────────────────────────────────────
          Last, and no longer dressed as a card: it is the whole lower half of
          the page, and a 1,400px rounded rectangle is not a card, it is a
          section pretending to be one. */}
      <CreditsCart onPurchased={onPurchased} />

      <style>{`
        .hv-pac {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          /* One rhythm for the whole page. Three panels that each carried their
             own margins drifted apart by a few pixels at every breakpoint, which
             is the kind of thing that reads as "unfinished" without anyone being
             able to say why. */
          gap: 52px;
          margin-top: 36px;
        }

        /* ── The statement ────────────────────────────────────────────
           One panel, split down the middle. Stripping the two cards off
           these balances fixed the right problem — they were two competing
           boxes in a rail — but replacing them with nothing left the two
           figures the page exists to report floating in open cream with no
           edge, no ground and no weight, which reads as unfinished rather
           than as restrained. A statement of account is a document: it has
           a boundary, and the halves sit inside it under one rule. */
        .hv-pac-statement {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 1px solid var(--rule);
          border-radius: calc(var(--radius) * 1.5);
          background: var(--surface);
          overflow: hidden;
        }
        .hv-pac-stat { padding: 30px 32px; min-width: 0; }
        /* The divider is the panel's own, not a card edge on each half. */
        .hv-pac-stat + .hv-pac-stat { border-left: 1px solid var(--rule); }
        .hv-pac-stat > * { margin-top: 0; }

        /* Both panels are written to stand alone elsewhere (the wallet also
           appears on /plan), so they arrive carrying a card of their own.
           Inside this one they are columns, and that card comes off. */
        .hv-pac-stat :is(.hv-cpp, .hv-aiw) {
          border: none; border-radius: 0; background: none; padding: 0; box-shadow: none;
        }
        .hv-pac-stat :is(.hv-cpp, .hv-aiw)::before { display: none; }

        /* ── Making the pair a pair ────────────────────────────────────
           The two were built at different times and head themselves
           differently: projects puts a small label over a big figure,
           credits puts a serif heading on the left with the figure pushed
           to the right margin. Side by side that is not a comparison, it is
           two designs. Same eyebrow, same figure, same baseline, both. */
        .hv-pac-stat .hv-aiw-head { display: block; }
        .hv-pac-stat .hv-aiw-title {
          font: 500 11px/1 var(--sans); letter-spacing: .14em; text-transform: uppercase;
          color: var(--fg-mute); margin: 0 0 14px;
        }
        .hv-pac-stat .hv-cpp > .mono { margin-bottom: 14px !important; }

        /* The figures ARE the page. At 40px in brass on cream they were the
           quietest thing on a screen whose entire job is reporting them —
           a price list below shouted louder than the balance above it. Big,
           and in the page's own ink so they carry. */
        .hv-pac-stat :is(.hv-cpp-figure-n, .hv-aiw-balance-n) {
          font-size: clamp(46px, 6vw, 64px);
          color: var(--fg);
          line-height: .95;
        }
        .hv-pac-stat :is(.hv-cpp-figure, .hv-aiw-balance) { margin-bottom: 14px; gap: 12px; }
        .hv-pac-stat :is(.hv-cpp-figure-w, .hv-aiw-balance-w) { color: var(--fg-soft); }

        .hv-pac-stat .hv-aiw-lead,
        .hv-pac-stat .hv-aiw-expiry { max-width: 46ch; }

        /* History, not a headline. It is the tallest thing in the statement
           and was set at the same weight as the balance above it, so five
           ±1 rows outranked the two numbers the panel is for. */
        .hv-pac-stat .hv-aiw-log-note { font-size: 12.5px; color: var(--fg-soft); }
        .hv-pac-stat .hv-aiw-log-n { font-size: 12.5px; }
        .hv-pac-stat .hv-aiw-log-bal { font-size: 11.5px; }

        /* One column below the point where two halves stop being readable —
           and then the divider is the seam between them, not a left edge. */
        @media (max-width: 760px) {
          .hv-pac-statement { grid-template-columns: 1fr; }
          .hv-pac-stat { padding: 24px 20px; }
          .hv-pac-stat + .hv-pac-stat { border-left: none; border-top: 1px solid var(--rule); }
        }

        @media (max-width: 640px) {
          .hv-pac { gap: 40px; margin-top: 28px; }
          .hv-pac-statement { gap: 28px; padding-bottom: 28px; }
        }

        /* ── Arriving ──────────────────────────────────────────────────
           One quiet rise for the page, not a staggered deal of three cards.
           The stagger existed to break up "three near-identical slabs"; with the
           slabs gone it was animation covering for a layout problem. */
        .hv-pac > * { animation: hv-pac-rise .5s var(--ease) both; }
        .hv-pac > *:nth-child(2) { animation-delay: .06s; }
        .hv-pac > *:nth-child(3) { animation-delay: .12s; }
        @keyframes hv-pac-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hv-pac > * { animation: none; }
        }
      `}</style>
    </div>
  );
}
