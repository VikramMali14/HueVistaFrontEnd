import { api } from "./api";
import type { CheckoutEventBody } from "./api";
import { announceBalanceChanged } from "@/hooks/use-account-balance";
import type {
  AiCreditSummary,
  CartCatalogue,
  CartOrder,
  ProjectPurchaseOptions,
  ProjectReopenResult,
  PurchasablePlan,
  StoreOrder,
} from "./types";

/**
 * How a checkout outcome gets back to the server.
 *
 * Injectable because the kiosk cannot use the default. Every other flow reports through
 * the BFF, which authenticates with the buyer's session — but a walk-in at a shop counter
 * has no session at all until AFTER they have paid, so the BFF answers 401 and the one
 * flow most likely to be abandoned would be the one flow with no record of it. The kiosk
 * passes a server action instead, which also carries the counter's real IP through.
 *
 * Must never reject: these run alongside live payment code.
 */
export type CheckoutReporter = (reference: string, body: CheckoutEventBody) => void | Promise<void>;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

/**
 * The bits of a Razorpay Checkout instance we use. `on` is how the gateway reports a
 * REFUSED payment — a declined card, a UPI collect that timed out — which arrives on the
 * `payment.failed` event and nowhere else. Nothing in this file listened for it before,
 * so those buyers simply vanished: no handler, no dismiss, no record anywhere.
 */
interface RazorpayInstance {
  open: () => void;
  on?: (event: string, handler: (payload: RazorpayFailure) => void) => void;
}

interface RazorpayFailure {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
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
 * Follows one Checkout and reports what became of it.
 *
 * Three of the outcomes a payment can have exist only in this browser — the window
 * opening, the buyer closing it, the gateway refusing the card. None of them reaches our
 * server on its own, so without this the admin payment audit could only ever list the
 * checkouts that worked, which is the opposite of what an audit is for.
 *
 * `settled` is the important part. Razorpay calls `ondismiss` when the modal closes, and
 * in some flows that includes the automatic close after a SUCCESSFUL payment — reporting
 * that as abandonment would file a completed sale under "buyer walked away". Once the
 * success handler has run, the dismissal is no longer news.
 */
function track(reference: string, report: CheckoutReporter = api.reportCheckoutEvent) {
  let settled = false;
  const context = () => ({
    pageUrl: typeof window === "undefined" ? undefined : window.location.href,
    referrer: typeof document === "undefined" || !document.referrer ? undefined : document.referrer,
  });

  return {
    /** Call as soon as the success handler fires, before any awaiting. */
    settle() {
      settled = true;
    },
    opened() {
      void report(reference, { status: "OPENED", ...context() });
    },
    dismissed() {
      if (settled) return;
      void report(reference, { status: "ABANDONED", ...context() });
    },
    /** Razorpay refused the payment — its error object says why, so pass it all on. */
    failed(payload: RazorpayFailure) {
      settled = true;
      const e = payload?.error ?? {};
      void report(reference, {
        status: "FAILED",
        ...context(),
        paymentId: e.metadata?.payment_id,
        errorCode: e.code,
        errorDescription: e.description,
        errorSource: e.source,
        errorStep: e.step,
        errorReason: e.reason,
      });
    },
    /** The charge went through but our own verification did not. */
    verifyFailed(paymentId: string, message: string) {
      void report(reference, {
        status: "VERIFY_FAILED",
        ...context(),
        paymentId,
        errorDescription: message,
      });
    },
  };
}

type Tracker = ReturnType<typeof track>;

/** Wire the tracker to the instance and open it, so no flow can forget a listener. */
function openTracked(rzp: RazorpayInstance, tracker: Tracker) {
  rzp.on?.("payment.failed", (payload) => tracker.failed(payload));
  tracker.opened();
  rzp.open();
}

/**
 * The card was charged, but confirming it with our server failed.
 *
 * This is the one failure in here that must never be told to "try again": the money has
 * already left. Razorpay has the payment and the webhook will settle it, so a retry buys
 * the same thing twice. Every verification step below raises THIS rather than a bare
 * Error so callers can say so — the panel used to surface the raw message next to a
 * live Pay button, which is how a failed activation turns into a double charge.
 */
export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

function verificationFailed(e: unknown): PaymentVerificationError {
  return new PaymentVerificationError(
    e instanceof Error ? e.message : "Payment verification failed.",
  );
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
  // A plan checkout is keyed by the SUBSCRIPTION id — that is what the backend opened
  // the audit row under, since a subscription has no order to name it by.
  const tracker = track(subscriptionId);

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: keyId,
      subscription_id: subscriptionId,
      name: "HueVista",
      description: `${sub.planDisplayName} plan`,
      theme: { color: "#7c5cff" },
      handler: async (resp: SubscriptionCheckoutSuccess) => {
        tracker.settle();
        try {
          await api.verifySubscription({
            subscriptionId: resp.razorpay_subscription_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(false); } },
    });
    openTracked(rzp, tracker);
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
  report?: CheckoutReporter,
  /**
   * What the walk-in already told the kiosk about themselves, so Checkout does not ask
   * a second time. Collected before this opens, because the address is how they get
   * back into what they are about to buy — and asking for it AFTER the payment means
   * asking someone who has already got what they came for.
   */
  prefill?: { email?: string; name?: string; contact?: string },
): Promise<boolean> {
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId, report);

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      // ALWAYS the merchant of record, never the shop. HueVista sets this price,
      // collects this payment and keeps all of it — the shop earns reward points, not a
      // share (see the Terms, "In-store kiosk and reward points"). Putting the shop's
      // name in the merchant slot said the shop was being paid, which is both untrue and
      // exactly what a payment processor reads as collecting on behalf of third parties.
      // The shop still names itself in the description, where it belongs.
      name: "HueVista",
      description: order.shopName
        ? `One room visualisation · ${order.shopName}`
        : "One room visualisation",
      theme: { color: "#7c5cff" },
      ...(prefill && (prefill.email || prefill.name || prefill.contact)
        ? { prefill: { ...(prefill.email ? { email: prefill.email } : {}), ...(prefill.name ? { name: prefill.name } : {}), ...(prefill.contact ? { contact: prefill.contact } : {}) } }
        : {}),
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          await onSuccess({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(false); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * Buy reward points. Points are a shop's own balance — extra projects and reopens are
 * paid for with them, at a rate that falls with the shop's plan — so this is the one
 * top-up flow there is.
 *
 * The COUNT is what travels; the amount is priced server-side from it, so the browser
 * never names a rupee figure. Resolves `true` once the points are credited, `false` if
 * the buyer closes Checkout, and throws on a real error.
 */
export async function buyPoints(
  points: number,
  prefill?: { name?: string; email?: string },
): Promise<boolean> {
  const order = await api.createPointsOrder(points);
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId);

  return new Promise<boolean>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: `${order.points.toLocaleString("en-IN")} points`,
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          await api.verifyPointsPurchase({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(false); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * Buy ONE extra project with money, at the buyer's own plan rate (₹199 with no plan,
 * down to ₹45 on Business).
 *
 * Nothing about the price travels from the browser: the order is created server-side
 * from the caller's plan, and verification re-reads it back from Razorpay. Points are the
 * cheaper rail for the same thing (see `api.pointsPayProjectCredit`) — this exists for
 * shops that would rather pay for one project than hold a balance.
 *
 * Resolves the refreshed purchase options once the project is credited, `null` if the
 * buyer closes Checkout, and throws on a real error.
 */
export async function buyOneProject(
  prefill?: { name?: string; email?: string },
  credits = 1,
): Promise<ProjectPurchaseOptions | null> {
  const order = await api.createProjectOrder(credits);
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId);

  return new Promise<ProjectPurchaseOptions | null>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: credits === 1 ? "1 extra project" : `${credits} projects`,
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          const fresh = await api.verifyProjectPurchase({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          // The projects are on the account now, so every counter on screen — the
          // navbar's included — is one payment out of date until it hears about it.
          announceBalanceChanged();
          resolve(fresh);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(null); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * Pay by card for another validity window on a lapsed project.
 *
 * The order is created (and refused) server-side: a project a live plan or a shop code
 * already covers never reaches Checkout, so nobody is charged to unlock something that
 * was never locked. Which project is extended comes off the order, not from here.
 *
 * Resolves the reopen result, `null` if the buyer closes Checkout, and throws on a real
 * error.
 */
export async function reopenProjectWithMoney(
  projectId: string,
  prefill?: { name?: string; email?: string },
): Promise<ProjectReopenResult | null> {
  const order = await api.createReopenOrder(projectId);
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId);

  return new Promise<ProjectReopenResult | null>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: "Reopen project",
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          resolve(
            await api.verifyReopen({
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            }),
          );
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(null); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * Top up the AI image wallet.
 *
 * The ONLY way an AI image is paid for. There used to be a per-project rail beside this —
 * a flat purchase that added one image to one room — and, under both of them, an image
 * included with rooms bought certain ways. Both are gone: a credit belongs to the account,
 * works on any room it owns, and is the single answer to "what does a picture cost?".
 *
 * Only the COUNT travels. The amount is priced server-side at the current rate, so the
 * browser can neither name its own price nor claim a launch discount that has ended.
 *
 * Resolves the refreshed wallet once the credits land, `null` if the buyer closes
 * Checkout, and throws on a real error.
 */
export async function buyAiCredits(
  credits: number,
  prefill?: { name?: string; email?: string },
): Promise<AiCreditSummary | null> {
  const order = await api.createAiCreditOrder(credits);
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId);

  return new Promise<AiCreditSummary | null>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: `${order.credits} AI image credit${order.credits === 1 ? "" : "s"}`,
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          const fresh = await api.verifyAiCreditPurchase({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          announceBalanceChanged();
          resolve(fresh);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(null); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * Pay for a basket: projects, AI image credits and combos, in one Checkout.
 *
 * The other buy functions in this file each sell one thing behind one button, which is the
 * shape the product had before this: somebody doing up two rooms opened Checkout six times.
 * This is the one flow where the size of the order is visible to both sides, which is what
 * makes an offer at ₹289 possible at all.
 *
 * Only quantities and (at most) a code travel. The amount is priced server-side from the
 * catalogue's own rates and the offer the subtotal has earned, and verification re-reads
 * the order back from Razorpay — so a browser can neither name its own price nor claim a
 * discount the basket has not reached.
 *
 * Resolves the refreshed counter once the projects and credits land, `null` if the buyer
 * closes Checkout, and throws on a real error. A `PaymentVerificationError` means the money
 * has already left and must never be retried — see the class note.
 */
export async function checkoutCart(
  basket: {
    projects: number;
    credits: number;
    combos: number;
    bundles: number;
    discountCode?: string;
  },
  prefill?: { name?: string; email?: string },
): Promise<CartCatalogue | null> {
  const order: CartOrder = await api.createCartOrder(basket);
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment library unavailable.");

  const tracker = track(order.orderId);

  return new Promise<CartCatalogue | null>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amountPaise,
      currency: order.currency,
      order_id: order.orderId,
      name: "HueVista",
      description: describeBasket(order),
      prefill: { name: prefill?.name ?? "", email: prefill?.email ?? "" },
      theme: { color: "#7c5cff" },
      handler: async (resp: CheckoutSuccess) => {
        tracker.settle();
        try {
          const fresh = await api.verifyCartPurchase({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          announceBalanceChanged();
          resolve(fresh);
        } catch (e) {
          tracker.verifyFailed(resp.razorpay_payment_id, String(e));
          reject(verificationFailed(e));
        }
      },
      modal: { ondismiss: () => { tracker.dismissed(); resolve(null); } },
    });
    openTracked(rzp, tracker);
  });
}

/**
 * What the Checkout sheet — and the buyer's bank statement — should call this basket.
 *
 * Built from what the order GRANTS rather than from the lines the cart sent, because that
 * is the thing the buyer is actually getting and the only description that stays true when
 * a combo is in the basket.
 */
function describeBasket(order: CartOrder): string {
  const parts: string[] = [];
  if (order.projectsGranted > 0) {
    parts.push(`${order.projectsGranted} project${order.projectsGranted === 1 ? "" : "s"}`);
  }
  if (order.creditsGranted > 0) {
    parts.push(`${order.creditsGranted} AI credit${order.creditsGranted === 1 ? "" : "s"}`);
  }
  return parts.join(" + ") || "HueVista basket";
}
