// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CheckoutEventBody } from "@/lib/api";

/**
 * What the payment audit depends on this file getting right.
 *
 * Three of the outcomes a checkout can have exist only in the browser — the window
 * opening, the buyer closing it, the gateway refusing the card — so if these reports are
 * not sent, the admin report can only ever show payments that worked, which is the
 * opposite of what an audit is for.
 *
 * The subtle one is the SUCCESS case. Razorpay fires `ondismiss` when the modal closes,
 * and in some flows that includes the automatic close after a payment succeeds. Reporting
 * that as abandonment would file completed sales under "buyer walked away".
 */

// Typed explicitly: an inferred `vi.fn(async () => {})` has a zero-argument signature,
// which makes every `mock.calls[n][1]` assertion below a type error.
const reportCheckoutEvent = vi.fn<(reference: string, body: CheckoutEventBody) => Promise<void>>(
  async () => {},
);
const createPointsOrder = vi.fn(async () => ({
  orderId: "order_points_1",
  points: 500,
  amount: 50000,
  currency: "INR",
  razorpayKeyId: "rzp_test_key",
}));
const verifyPointsPurchase = vi.fn(async () => ({}));

vi.mock("@/lib/api", () => ({
  api: { reportCheckoutEvent, createPointsOrder, verifyPointsPurchase },
}));

/** Captures the options Checkout was constructed with, so a test can fire its callbacks. */
interface Captured {
  handler: (resp: Record<string, string>) => Promise<void>;
  modal: { ondismiss: () => void };
  listeners: Record<string, (payload: unknown) => void>;
  opened: boolean;
}

let captured: Captured;

function installRazorpay() {
  captured = {
    handler: async () => {},
    modal: { ondismiss: () => {} },
    listeners: {},
    opened: false,
  };
  class FakeRazorpay {
    constructor(options: Record<string, unknown>) {
      captured.handler = options.handler as Captured["handler"];
      captured.modal = options.modal as Captured["modal"];
    }
    on(event: string, cb: (payload: unknown) => void) {
      captured.listeners[event] = cb;
    }
    open() {
      captured.opened = true;
    }
  }
  (window as unknown as { Razorpay: unknown }).Razorpay = FakeRazorpay;
}

/** Lets the queued `void report(...)` promises settle before asserting. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  installRazorpay();
  window.history.replaceState({}, "", "/plan?upgrade=1");
});

afterEach(() => {
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
});

/**
 * Start a checkout and hand back its still-pending promise, with Checkout already
 * constructed so a test can drive its callbacks.
 *
 * Wrapped in an object because awaiting an async function UNWRAPS a returned promise —
 * a bare `return promise` here would make every caller wait for the payment to finish
 * before it had anything to click.
 */
async function startCheckout(): Promise<{ promise: Promise<boolean> }> {
  const { buyPoints } = await import("@/lib/payments");
  const promise = buyPoints(500);
  await flush();
  return { promise };
}

function eventsFor(status: string) {
  return reportCheckoutEvent.mock.calls.filter(
    (c) => (c[1] as { status: string }).status === status,
  );
}

describe("checkout attempt tracking", () => {
  it("reports OPENED, with the page the buyer is on, before Checkout opens", async () => {
    const { promise } = await startCheckout();

    const opened = eventsFor("OPENED");
    expect(opened).toHaveLength(1);
    expect(opened[0]![0]).toBe("order_points_1");
    // The page URL is the whole point of the report — /plan and a quota wall inside the
    // studio both open this same checkout and were indistinguishable afterwards.
    expect((opened[0]![1] as { pageUrl: string }).pageUrl).toContain("/plan?upgrade=1");
    expect(captured.opened).toBe(true);

    captured.modal.ondismiss();
    await promise;
  });

  it("reports ABANDONED when the buyer closes the window without paying", async () => {
    const { promise } = await startCheckout();

    captured.modal.ondismiss();
    await expect(promise).resolves.toBe(false);
    await flush();

    const abandoned = eventsFor("ABANDONED");
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]![0]).toBe("order_points_1");
  });

  it("does NOT report abandonment when the dismiss follows a successful payment", async () => {
    const { promise } = await startCheckout();

    await captured.handler({
      razorpay_order_id: "order_points_1",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "sig",
    });
    // Razorpay closes the modal itself after a success; in some flows that fires
    // ondismiss too. A completed sale must not be recorded as a walk-away.
    captured.modal.ondismiss();
    await expect(promise).resolves.toBe(true);
    await flush();

    expect(eventsFor("ABANDONED")).toHaveLength(0);
  });

  it("forwards the gateway's error payload when a payment is refused", async () => {
    const { promise } = await startCheckout();

    expect(captured.listeners["payment.failed"]).toBeTypeOf("function");
    captured.listeners["payment.failed"]!({
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "Payment failed because of insufficient funds",
        source: "bank",
        step: "payment_authorization",
        reason: "payment_failed",
        metadata: { payment_id: "pay_failed_1" },
      },
    });
    await flush();

    const failed = eventsFor("FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0]![1]).toMatchObject({
      status: "FAILED",
      paymentId: "pay_failed_1",
      errorCode: "BAD_REQUEST_ERROR",
      errorSource: "bank",
      errorStep: "payment_authorization",
      errorReason: "payment_failed",
    });

    captured.modal.ondismiss();
    await promise;
    await flush();
    // A refusal is already an ending; the dismiss that follows it adds nothing.
    expect(eventsFor("ABANDONED")).toHaveLength(0);
  });

  it("reports VERIFY_FAILED when the charge lands but verification does not", async () => {
    verifyPointsPurchase.mockRejectedValueOnce(new Error("signature mismatch"));
    const { promise } = await startCheckout();

    const handled = captured.handler({
      razorpay_order_id: "order_points_1",
      razorpay_payment_id: "pay_2",
      razorpay_signature: "sig",
    });
    await expect(promise).rejects.toThrow();
    await handled;
    await flush();

    const vf = eventsFor("VERIFY_FAILED");
    expect(vf).toHaveLength(1);
    // The payment id is what makes this row actionable: it is how the money is found.
    expect((vf[0]![1] as { paymentId: string }).paymentId).toBe("pay_2");
  });

  it("never lets a failed report break the payment flow", async () => {
    reportCheckoutEvent.mockRejectedValue(new Error("telemetry down"));
    const { promise } = await startCheckout();

    await captured.handler({
      razorpay_order_id: "order_points_1",
      razorpay_payment_id: "pay_3",
      razorpay_signature: "sig",
    });

    // Bookkeeping is never worth a sale.
    await expect(promise).resolves.toBe(true);
  });
});
