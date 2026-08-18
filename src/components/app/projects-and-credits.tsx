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
    <>
      {/* What is already on the account, first. Somebody arriving here is answering "what
          do I have" before "what do I want", and a counter shown above the answer is a
          shop assistant talking over the question. Both panels count and neither sells:
          the cart below is the one place on this page anything is bought, so a customer
          is never shown the same project at two prices through two buttons. */}
      <div style={{ marginTop: 32 }}>
        <CustomerProjectsPanel showBuy={false} reloadKey={reloadKey} />
      </div>

      <div style={{ marginTop: 28 }}>
        <AiCreditWallet showBuy={false} reloadKey={reloadKey} />
      </div>

      {/* The counter. Quantities, an offer over ₹289, one payment for the lot — and
          everything on it good for a year. */}
      <div style={{ marginTop: 28 }}>
        <CreditsCart onPurchased={onPurchased} />
      </div>
    </>
  );
}
