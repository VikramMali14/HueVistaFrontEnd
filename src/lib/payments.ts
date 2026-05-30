import { api } from "./api";

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
      theme: { color: "#b89968" },
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
