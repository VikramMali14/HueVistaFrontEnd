import { api } from "./api";
import type { PurchasablePlan, StoreOrder } from "./types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Payments are only available in the browser."));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load the payment library.")));
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment library."));
    document.body.appendChild(s);
  });
}

interface SubscriptionCheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

/**
 * Start a paid monthly subscription for {@param plan}. Asks the backend to create a
 * Razorpay subscription, opens the in-app Razorpay Checkout for it, then verifies the
 * payment on the server so the plan is ACTIVE the moment this resolves — no waiting on
 * the webhook, and the buyer never leaves the app.
 *
 * Resolves `true` once the subscription is verified/active, `false` if the buyer closes
 * the Checkout without paying. Throws on a real error (incl. HttpError 401 when the user
 * isn't signed in) so the caller can route to sign-in or show a message.
 *
 * Falls back to the hosted `paymentUrl` (full-page redirect) only if the in-app Checkout
 * can't be used — e.g. the backend didn't return a key/subscription id.
 */
export async function subscribeToPlan(plan: PurchasablePlan): Promise<boolean> {
  const sub = await api.createSubscription({ plan });

  if (!sub.razorpayKeyId || !sub.razorpaySubscriptionId) {
    if (sub.paymentUrl) {
      window.location.href = sub.paymentUrl;
      return await new Promise<boolean>(() => {}); // navigating away; never resolves
    }
    throw new Error("Could not start checkout. Please try again.");
  }

  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const keyId = sub.razorpayKeyId;
  const subscriptionId = sub.razorpaySubscriptionId;

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: keyId,
      subscription_id: subscriptionId,
      name: "HueVista",
      description: `${sub.planDisplayName} plan`,
      theme: { color: "#7c5cff" },
      handler: async (resp: SubscriptionCheckoutSuccess) => {
        try {
          await api.verifySubscription({
            subscriptionId: resp.razorpay_subscription_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Payment verification failed."));
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}

interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * In-store kiosk payment: opens Razorpay Checkout (card / UPI / QR) for a
 * pre-created public store order and hands the success payload to `onSuccess`,
 * which must verify it server-side (that's where the code is issued).
 * Resolves `true` after a verified payment, `false` if the customer closes
 * Checkout without paying; throws when verification fails.
 */
export async function openStoreCheckout(
  order: StoreOrder,
  onSuccess: (resp: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) => Promise<void>,
): Promise<boolean> {
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: order.shopName || "HueVista",
      description: "One room visualisation",
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        try {
          await onSuccess({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Payment verification failed."));
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}

/**
 * Full one-time purchase of a single extra project:
 *   create order -> open Razorpay Checkout -> verify on the server -> credit applied.
 * Resolves `true` when a project credit was added, `false` if the user dismisses
 * the modal, and throws on a real error (network / verification).
 */
export async function buyExtraProject(prefill?: { name?: string; email?: string }): Promise<boolean> {
  const order = await api.createProjectCreditOrder();
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: "One extra project",
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        try {
          await api.verifyProjectCredit({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Payment verification failed."));
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}
