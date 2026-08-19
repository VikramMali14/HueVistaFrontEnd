"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * How many projects and AI image credits an account can spend right now.
 *
 * <h2>Why "projects" is a sum</h2>
 *
 * A customer can hold projects two ways, and they are not alternatives:
 *
 *   - a shop ONBOARDED them with an access code, which carries an allowance and a
 *     window (`CustomerEntitlement`);
 *   - they BOUGHT project credits with their own money (`ProjectPurchaseOptions
 *     .availableCredits`).
 *
 * The product talks as though these are mutually exclusive — one kind of customer or
 * the other — and for most accounts they are. But nothing stops a shop-onboarded
 * customer buying a project from the cart when their allowance runs out, and plenty do
 * exactly that: it is the button in front of them when the shop's projects are gone.
 * Counting only the entitlement then tells somebody who has just paid that they hold
 * nothing, which is the worst moment to be wrong.
 *
 * An EXPIRED entitlement contributes zero — its remaining allowance is not spendable —
 * while bought credits are governed by their own validity and still are. That asymmetry
 * is the reason this is a shared hook rather than a sum written out at each call site.
 */
export interface AccountBalance {
  /** Projects that can be started right now. */
  projects: number;
  /** Spendable AI image credits. */
  credits: number;
  /**
   * Whether this account can hold AI credits at all. False for a painter or
   * distributor, who own no rooms and would have nothing to spend one on — the backend
   * says so rather than the UI guessing, and callers should hide the figure entirely
   * rather than show a zero that can never move.
   */
  creditsEligible: boolean;
  /** False until the first fetch settles, so callers can render nothing rather than a
   *  zero that is about to become a three. */
  loaded: boolean;
}

const EMPTY: AccountBalance = { projects: 0, credits: 0, creditsEligible: false, loaded: false };

/** Fired after anything that spends or buys, so the figures on screen follow the money. */
const BALANCE_CHANGED = "huevista:balance-changed";

/**
 * Tell every mounted balance readout that it is now out of date.
 *
 * Called from the payment helpers rather than from each screen: a purchase changes the
 * account, not the page it happened on, and the navbar showing yesterday's number after
 * a successful payment is the single most alarming way to be wrong about money.
 */
export function announceBalanceChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BALANCE_CHANGED));
}

/**
 * Read the account's two balances, refreshing on route change and after any purchase.
 *
 * @param enabled false for a role that holds neither (a distributor, a signed-out
 *        shell). The hook still runs — hooks must — but it makes no requests and stays
 *        unloaded, so a caller can gate on role without moving the call out of the
 *        component tree.
 *
 * Every request is settled independently: a wallet that fails to load must not blank a
 * project count that arrived perfectly well, because the two answer different questions
 * and one of them being unavailable is not evidence about the other.
 */
export function useAccountBalance(enabled: boolean): AccountBalance & { reload: () => void } {
  const [balance, setBalance] = useState<AccountBalance>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setBalance(EMPTY);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [ent, options, wallet] = await Promise.allSettled([
        api.getMyEntitlement(),
        api.getProjectPurchaseOptions(),
        api.getAiCredits(),
      ]);
      if (cancelled) return;

      // A shop's allowance, but only while the window it came with is still open.
      const shopProjects =
        ent.status === "fulfilled" && ent.value && !ent.value.expired
          ? Math.max(0, ent.value.projectsRemaining)
          : 0;
      const boughtProjects =
        options.status === "fulfilled" ? Math.max(0, options.value.availableCredits) : 0;
      const eligible = wallet.status === "fulfilled" && wallet.value.eligible;

      setBalance({
        projects: shopProjects + boughtProjects,
        credits: eligible ? Math.max(0, wallet.value.balance) : 0,
        creditsEligible: eligible,
        // Loaded means "we asked and something answered". All three failing is a
        // network state, not a balance of zero, and saying "0 projects" to someone
        // holding five would be worse than saying nothing at all.
        loaded:
          ent.status === "fulfilled" ||
          options.status === "fulfilled" ||
          wallet.status === "fulfilled",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  // Anything that took money, anywhere in the app.
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener(BALANCE_CHANGED, reload);
    return () => window.removeEventListener(BALANCE_CHANGED, reload);
  }, [enabled, reload]);

  return { ...balance, reload };
}
