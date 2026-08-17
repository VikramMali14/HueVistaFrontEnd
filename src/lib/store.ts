"use server";

import { cookies, headers } from "next/headers";
import { HttpError, storeServerApi } from "./api";
import type { CheckoutEventBody } from "./api";
import { clientIpFromHeaders } from "./client-ip";
import { config } from "./config";
import type { StoreCheckoutResult, StoreOrder } from "./types";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

async function clientIp(): Promise<string | undefined> {
  return clientIpFromHeaders(await headers());
}

/**
 * Public kiosk: create the Razorpay order for one image upload at this store's
 * price. The client opens it in Checkout (UPI / QR included).
 */
export async function createStoreOrderAction(
  slug: string,
): Promise<StoreOrder | { error: string }> {
  "use server";
  try {
    return await storeServerApi.createOrder(slug.trim(), await clientIp());
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { error: "This store link doesn't exist. Check the URL with the shop." };
      return { error: err.message };
    }
    return { error: "Could not start the payment. Please try again." };
  }
}

/**
 * Public kiosk: report what happened to a Checkout the counter opened.
 *
 * A walk-in has no session until after they have paid, so the kiosk cannot use the BFF
 * route every other flow reports through — it would answer 401 for exactly the buyers
 * most likely to walk away. This action reaches the backend directly and, like the order
 * and verify calls beside it, forwards the counter's real IP so an abandoned kiosk sale
 * is attributable to the shop it happened at.
 *
 * Never throws: it is called alongside live payment code, and a failed bookkeeping call
 * must not become an error in front of a customer.
 */
export async function reportStoreCheckoutEventAction(
  reference: string,
  body: CheckoutEventBody,
): Promise<void> {
  "use server";
  try {
    await storeServerApi.reportAttempt(reference, body, await clientIp());
  } catch {
    // Telemetry only — see above.
  }
}

/**
 * Public kiosk: verify the Checkout success payload.
 *
 * On success the backend issues the shop's pickup code AND opens (or reuses) the
 * account the purchase belongs to, handing back a real session. We persist that
 * session exactly as any sign-in would, so the customer walks away from the till
 * already inside their own studio rather than at a sign-up form.
 *
 * When the account is a fresh unclaimed one, its access token is also parked in a
 * separate short-lived cookie. Signing in later REPLACES the session, so without
 * parking it the token that authorises "move this room onto my real account" would be
 * gone by the time we knew which account to move it to.
 */
export async function verifyStorePaymentAction(
  slug: string,
  payload: {
    orderId: string;
    paymentId: string;
    signature: string;
    email?: string;
    name?: string;
  },
): Promise<
  | {
      code: string;
      shopName: string;
      validDays: number;
      amountPaise: number;
      accountEmail?: string | null;
      claimable: boolean;
    }
  | { error: string }
> {
  "use server";
  try {
    const res: StoreCheckoutResult = await storeServerApi.verify(slug.trim(), payload, await clientIp());
    const jar = await cookies();

    if (res.session) {
      jar.set(config.sessionCookie, res.session.refreshToken, {
        ...cookieDefaults,
        maxAge: config.refreshTtlSeconds,
      });
      jar.set(config.accessCookie, res.session.accessToken, {
        ...cookieDefaults,
        maxAge: Math.max(60, res.session.expiresIn),
      });
    }

    // Only an unclaimed account is worth offering to merge. A purchase that landed on
    // an account the customer already had has nowhere to go.
    const claimable = Boolean(res.session) && !res.existingAccount;
    if (claimable && res.session) {
      jar.set(config.kioskClaimCookie, res.session.accessToken, {
        ...cookieDefaults,
        maxAge: config.kioskClaimTtlSeconds,
      });
    } else {
      jar.delete(config.kioskClaimCookie);
    }
    // Kiosk purchases carry no brand restriction — clear any stale filter.
    jar.delete(config.guestBrandsCookie);

    return {
      code: res.code,
      shopName: res.shopName,
      validDays: res.validDays,
      amountPaise: res.amountPaise,
      accountEmail: res.accountEmail ?? null,
      claimable,
    };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not confirm the payment. If money left your account, ask at the counter." };
  }
}
