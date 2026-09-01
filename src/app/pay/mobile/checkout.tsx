"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Where the outcome is handed back. Fixed, not read from the query — a redirect
 * target a caller can name is an open redirect, and this page is reachable by
 * anyone with the URL. A build under a different scheme (a staging app) sets the
 * env var; nothing a visitor types can move it.
 */
const APP_REDIRECT =
  process.env.NEXT_PUBLIC_MOBILE_PAY_REDIRECT || "huevista://pay/callback";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// `window.Razorpay` is declared once, in src/lib/payments.ts, where the website's
// own checkouts live. Re-declaring it here would have to match that type exactly
// and would break the moment either side changed.

/** Razorpay ids are `order_` / `pay_` + base62. Anything else never reaches the sheet. */
const ORDER_ID = /^order_[A-Za-z0-9]{6,32}$/;
const KEY_ID = /^rzp_[A-Za-z0-9_]{6,40}$/;

interface RazorpayFailure {
  error?: { code?: string; description?: string; metadata?: { payment_id?: string } };
}

interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load")));
      return;
    }
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load"));
    document.body.appendChild(s);
  });
}

/**
 * The outcome, as the app reads it.
 *
 * A fragment rather than a query string, for the same reason the OAuth code
 * comes back in one: a fragment is not sent to a server, does not reach a proxy
 * log, and does not survive into browser history the way a query does. The app
 * already has `fragmentParams` for exactly this shape.
 */
function handBack(params: Record<string, string | undefined>) {
  const frag = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) frag.set(k, v);
  window.location.replace(`${APP_REDIRECT}#${frag.toString()}`);
}

function Checkout() {
  const q = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // The outcome already sent, kept so the manual button below re-sends THAT
  // rather than a cancellation. A buyer whose browser refused the scheme
  // redirect has still paid, and telling the app otherwise would throw away a
  // completed purchase at the last step.
  const [sent, setSent] = useState<Record<string, string | undefined> | null>(null);
  // Checkout must be opened exactly once. React's development StrictMode mounts
  // effects twice, and two sheets over one order is two charges waiting to happen.
  const started = useRef(false);

  const order = q.get("order") ?? "";
  const key = q.get("key") ?? "";
  const amount = Number(q.get("amount") ?? "");
  const currency = q.get("currency") || "INR";
  const description = q.get("desc") || "HueVista";

  const finish = useCallback((params: Record<string, string | undefined>) => {
    setSent(params);
    handBack(params);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!ORDER_ID.test(order) || !KEY_ID.test(key) || !Number.isInteger(amount) || amount <= 0) {
      setError("This payment link is not valid. Start again from the app.");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await loadCheckout();
      } catch {
        if (!cancelled) setError("The payment library could not be loaded. Check your connection and try again.");
        return;
      }
      if (cancelled || !window.Razorpay) return;

      const rzp = new window.Razorpay({
        key,
        amount,
        currency,
        order_id: order,
        name: "HueVista",
        description,
        prefill: {
          ...(q.get("email") ? { email: q.get("email") } : {}),
          ...(q.get("name") ? { name: q.get("name") } : {}),
          ...(q.get("contact") ? { contact: q.get("contact") } : {}),
        },
        theme: { color: "#c08b4e" },
        handler: (resp: CheckoutSuccess) =>
          finish({
            status: "success",
            order_id: resp.razorpay_order_id,
            payment_id: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          }),
        // Closing the sheet is an answer too, and the app needs it: without this
        // the buyer lands back on a screen that is still spinning on a payment
        // that will never arrive.
        modal: { ondismiss: () => finish({ status: "cancelled" }) },
      });

      // A refused card reaches `payment.failed` and nowhere else. Reported back so
      // the app can say what the gateway said rather than "something went wrong".
      rzp.on?.("payment.failed", (payload: RazorpayFailure) =>
        finish({
          status: "failed",
          code: payload?.error?.code,
          description: payload?.error?.description,
        }),
      );

      rzp.open();
    })();

    return () => {
      cancelled = true;
    };
  }, [order, key, amount, currency, description, q, finish]);

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        {error ? (
          <>
            <h1 style={S.h1}>Payment could not start</h1>
            <p style={S.p}>{error}</p>
            <button type="button" style={S.btn} onClick={() => handBack({ status: "cancelled" })}>
              Back to the app
            </button>
          </>
        ) : (
          <>
            <h1 style={S.h1}>
              {sent?.status === "success"
                ? "Paid. Returning to the app…"
                : sent
                  ? "Returning to the app…"
                  : "Opening payment…"}
            </h1>
            <p style={S.p}>
              {sent
                ? "If the app does not come back on its own, tap below."
                : "Do not close this window. Razorpay is loading."}
            </p>
            {/* Shown from the start, not only on failure: on the handful of Android
                browsers that refuse a scheme redirect fired from script, this button
                is the only way back, and a buyer who has just paid must never be
                stranded looking for one. */}
            <button
              type="button"
              style={S.btn}
              onClick={() => handBack(sent ?? { status: "cancelled" })}
            >
              Back to the app
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export function MobileCheckout() {
  return (
    <Suspense fallback={null}>
      <Checkout />
    </Suspense>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "var(--bg, #100e0c)",
    color: "var(--fg, #ece8e1)",
    font: "400 15px/1.5 var(--sans, system-ui, sans-serif)",
  },
  card: { maxWidth: 380, textAlign: "center", display: "grid", gap: 12 },
  h1: { font: "500 20px/1.25 var(--serif, system-ui, sans-serif)", margin: 0 },
  p: { margin: 0, color: "var(--fg-soft, #c4bdb2)" },
  btn: {
    marginTop: 8,
    padding: "12px 18px",
    borderRadius: 999,
    border: "1px solid var(--rule-strong, rgba(236,232,225,.16))",
    background: "transparent",
    color: "inherit",
    font: "500 13px/1 var(--sans, system-ui, sans-serif)",
    cursor: "pointer",
  },
};
