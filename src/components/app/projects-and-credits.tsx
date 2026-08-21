"use client";

import { useCallback, useState } from "react";
import { AiCreditWallet } from "@/components/app/ai-credit-wallet";
import { CreditsCart } from "@/components/app/credits-cart";
import { CustomerProjectsPanel } from "@/components/app/customer-projects-panel";

/**
 * The three panels on the customer's billing page, wired to each other.
 *
 * <b>Why they need wiring at all.</b> Two of them COUNT what the account holds and the
 * third SELLS it, and each fetched once on mount and never again. So the most ordinary
 * thing anybody does on this page — buy three AI credits — left the balance directly
 * above the cart still reading whatever it read before the payment. The purchase had
 * gone through, the money had left, and the only screen the buyer had for checking said
 * nothing had changed. People bought twice.
 *
 * <b>How.</b> The cart already reports a completed purchase through {@code onPurchased};
 * that bumps a counter, and the counter is a {@code reloadKey} the counting panels
 * refetch on. Deliberately a shared key rather than each panel polling: nothing on this
 * page changes except as a result of a payment made on it, so a poll would be a request
 * every few seconds to be told what the page already knows.
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
    // One stack with one gap, rather than three margins that have to be kept in step.
    // The two counters and the counter that sells are the same weight of thing and sit
    // at the same rhythm; a page whose spacing wanders reads as unfinished however good
    // the panels on it are.
    <div className="hv-pac">
      {/* The counter first, and on a wide screen it keeps the wide column.

          Everything on this page used to be one 780px column down the left of a 1280px
          page: three full-width cards, stacked, with half the screen empty beside them.
          A stack of identical rectangles in a ribbon is most of what makes a screen read
          as static — there is no shape to it, nothing is nearer or further, and the eye
          has no reason to go anywhere except down. Two columns give it a shape without
          moving anything: the till stays first in the source, first on a phone, and the
          largest thing on the page, and the balances come off the bottom of the stack to
          sit beside it where they read as the account they describe.

          Quantities, the special offer, one payment for the lot — and everything on it
          good for a year.

          It used to sit third, under the two balances, on the reasoning that somebody
          arriving here is answering "what do I have" before "what do I want". That is
          true of the first visit and of almost no other: this page is reached from a
          "buy another project" link, from an empty balance, from a room that has run out
          — every route in is somebody who has already answered the first question and
          come here for the second. Two full-width cards of counting above the thing they
          came to do is a shop that makes you walk past the stockroom to reach the till.

          The balances have not been demoted, only moved to where they answer something:
          directly below, where "you hold 2 projects and 4 credits" reads as the receipt
          for what was just bought rather than as a preamble to buying it. The cart's own
          footer already carries the live figures for anyone deciding quantities, so
          nothing needed to reach the till is now below it. */}
      <div className="hv-pac-till">
        <CreditsCart onPurchased={onPurchased} />
      </div>

      {/* What is on the account. Both panels count and neither sells: the till is the
          one place on this page anything is bought, so a customer is never shown the
          same project at two prices through two buttons.

          Wrapped rather than laid out as bare grid children, because both of these
          render nothing at all in ordinary states — the wallet while it is loading, and
          for an account that may not hold credits — and a grid whose columns are assigned
          by nth-child rearranges itself when one of its children declines to exist. */}
      <div className="hv-pac-side">
        <CustomerProjectsPanel showBuy={false} reloadKey={reloadKey} />
        <AiCreditWallet showBuy={false} reloadKey={reloadKey} />
      </div>

      <style>{`
        .hv-pac {
          display: grid; gap: 22px; margin-top: 36px; position: relative; z-index: 1;
          grid-template-columns: minmax(0, 1fr) minmax(0, 340px);
          align-items: start;
        }
        .hv-pac-side {
          display: grid; gap: 22px; align-content: start;
          /* The till is by far the taller column, so the balances would otherwise scroll
             out of sight while somebody is still adding to their basket — and what they
             hold is exactly the number a person checks against while deciding how much to
             buy. Stuck below the app bar they stay in view for the whole of that decision.
             --nav-h is the sticky header's own height, so this cannot park under it. */
          position: sticky; top: calc(var(--nav-h) + 16px);
        }
        /* The till is the tall one, so it takes the whole left column however many
           balances end up beside it. */
        .hv-pac-till { grid-row: 1 / -1; }
        /* An account the counter is not for renders no till at all. Without this the
           balances would sit in a 340px column with two thirds of the page blank beside
           them — worse than the single column they replaced. */
        .hv-pac:has(.hv-pac-till:empty) { grid-template-columns: minmax(0, 1fr); }
        .hv-pac-till:empty { display: none; }

        /* The wallet carries its own top margin for the screens it appears on alone.
           Inside this stack the gap is the spacing, and two of them stack up. */
        .hv-pac section { margin-top: 0; }

        /* One column below the point where 340px of balances stops leaving the till a
           readable width. The source order is already till-first, so this needs no
           reordering — which is the whole reason the till is first in the source. */
        @media (max-width: 1080px) {
          .hv-pac { grid-template-columns: minmax(0, 1fr); }
          .hv-pac-till { grid-row: auto; }
          /* In one column the balances are BELOW the till rather than beside it, and a
             sticky element in the normal flow would pin itself over the content under it
             on the way past. */
          .hv-pac-side { position: static; }
        }

        /* ── Arriving ──────────────────────────────────────────────────────
           Each panel rises into place a beat after the one above it. The stagger
           is doing a job rather than decorating: this page is three cards of
           near-identical construction, and shown all at once they read as one
           undifferentiated slab. Dealt in order, the eye is walked down them —
           till, projects, credits — which is the order they are meant to be read
           in and the reason they are in that order.

           Keyframes rather than a scroll observer, filling both ways. Two of these
           panels only exist once their fetch has resolved, which is exactly when
           they should animate; an observer that had already swept the page would
           either miss them or, worse, leave them at opacity 0 for good. */
        .hv-pac-till > *, .hv-pac-side > * { animation: hv-pac-rise .55s var(--ease) both; }
        .hv-pac-side > *:nth-child(1) { animation-delay: .08s; }
        .hv-pac-side > *:nth-child(2) { animation-delay: .16s; }
        @keyframes hv-pac-rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: none; }
        }

        /* ── Answering ─────────────────────────────────────────────────────
           A card the pointer is over lifts a hair and warms its rule. Small on
           purpose: these are not buttons and must not pretend to be, but a page
           where nothing at all responds to the pointer is the specific thing that
           reads as a screenshot rather than a screen. The lit top hairline each
           card carries brightens with it, so the response is the card's own
           detail doing something rather than a new effect bolted on.

           transform and border-color only — no shadow, no size change — so nothing
           below the pointer moves and no row of prices reflows. */
        .hv-pac-till > *, .hv-pac-side > * {
          transition: transform .3s var(--ease), border-color .3s var(--ease);
        }
        .hv-pac-till > *:hover, .hv-pac-side > *:hover {
          transform: translateY(-2px); border-color: var(--rule-strong);
        }
        .hv-pac-till > *::before, .hv-pac-side > *::before {
          transition: opacity .3s var(--ease); opacity: .65;
        }
        .hv-pac-till > *:hover::before, .hv-pac-side > *:hover::before { opacity: 1; }

        @media (max-width: 560px) {
          .hv-pac, .hv-pac-side { gap: 16px; }
          .hv-pac { margin-top: 28px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hv-pac-till > *, .hv-pac-side > * { animation: none; transition: none; }
          .hv-pac-till > *:hover, .hv-pac-side > *:hover { transform: none; }
        }
        /* A pointer-driven lift is meaningless on a touch screen and, worse, sticks
           on after a tap — the card stays lifted until something else is touched. */
        @media (hover: none) {
          .hv-pac-till > *:hover, .hv-pac-side > *:hover { transform: none; }
          .hv-pac-till > *::before, .hv-pac-side > *::before { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
