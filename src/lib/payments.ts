import { api } from "./api";
import type { PurchasablePlan } from "./types";

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

/**
 * Start a paid monthly subscription for {@param plan}. Asks the backend to create
 * a Razorpay subscription, then sends the browser to the returned hosted checkout
 * URL where the retailer pays; the Razorpay webhook activates the plan afterwards.
 *
 * Does not resolve on success — it navigates away. Throws (incl. HttpError 401 when
 * the user isn't signed in) so the caller can route to sign-in or show an error.
 */
export async function subscribeToPlan(plan: PurchasablePlan): Promise<void> {
  const sub = await api.createSubscription({ plan });
  if (!sub.paymentUrl) {
    throw new Error("Could not start checkout. Please try again.");
  }
  window.location.href = sub.paymentUrl;
}

interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
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
