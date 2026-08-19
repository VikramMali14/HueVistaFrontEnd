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
      {/* What is already on the account, first. Somebody arriving here is answering "what
          do I have" before "what do I want", and a counter shown above the answer is a
          shop assistant talking over the question. Both panels count and neither sells:
          the cart below is the one place on this page anything is bought, so a customer
          is never shown the same project at two prices through two buttons. */}
      <CustomerProjectsPanel showBuy={false} reloadKey={reloadKey} />
      <AiCreditWallet showBuy={false} reloadKey={reloadKey} />

      {/* The counter. Quantities, the special offer, one payment for the lot — and
          everything on it good for a year. */}
      <CreditsCart onPurchased={onPurchased} />

      <style>{`
        .hv-pac { display: grid; gap: 22px; margin-top: 36px; }
        /* The wallet carries its own top margin for the screens it appears on alone.
           Inside this stack the gap is the spacing, and two of them stack up. */
        .hv-pac > section { margin-top: 0; }
        @media (max-width: 560px) { .hv-pac { gap: 16px; margin-top: 28px; } }
      `}</style>
    </div>
  );
}
