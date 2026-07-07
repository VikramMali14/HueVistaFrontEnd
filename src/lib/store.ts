"use server";

import { cookies, headers } from "next/headers";
import { HttpError, storeServerApi } from "./api";
import { config } from "./config";
import type { StoreCheckoutResult, StoreOrder } from "./types";

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

async function clientIp(): Promise<string | undefined> {
  const hdrs = await headers();
  return (
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip")?.trim() || undefined
  );
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
 * Public kiosk: verify the Checkout success payload. On success the backend
 * issues the shop's access code and a guest token; we store the token in the
 * same httpOnly guest cookie the /redeem flow uses, so /studio just works.
 * Returns the pickup code the customer keeps for the counter.
 */
export async function verifyStorePaymentAction(
  slug: string,
  payload: { orderId: string; paymentId: string; signature: string },
): Promise<
  | { code: string; shopName: string; validDays: number; amountPaise: number }
  | { error: string }
> {
  "use server";
  try {
    const res: StoreCheckoutResult = await storeServerApi.verify(slug.trim(), payload, await clientIp());
    const jar = await cookies();
    const ttlSeconds = Math.max(60, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
    jar.set(config.guestCookie, res.guestToken, { ...cookieDefaults, maxAge: ttlSeconds });
    // Kiosk codes carry no brand restriction — clear any stale filter.
    jar.delete(config.guestBrandsCookie);
    return {
      code: res.code,
      shopName: res.shopName,
      validDays: res.validDays,
      amountPaise: res.amountPaise,
    };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not confirm the payment. If money left your account, ask at the counter." };
  }
}
