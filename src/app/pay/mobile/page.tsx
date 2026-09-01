import type { Metadata } from "next";
import { MobileCheckout } from "./checkout";

export const metadata: Metadata = {
  title: "Payment · HueVista",
  // This page exists to be opened by the app and then closed again. It has no
  // place in a search result, and a crawler that followed it would only ever
  // find a checkout it cannot open.
  robots: { index: false, follow: false },
};

/**
 * The phone app's checkout window.
 *
 * Razorpay Checkout is a web library — there is no supported way to open the
 * sheet from React Native without shipping a payment SDK and taking card data
 * onto the handset. So the app does what it already does for Google sign-in: it
 * opens a browser session at this page, lets the gateway run in a real browser
 * on a real origin (Razorpay refuses to run on `about:blank`, which is what an
 * inline WebView string would give it), and reads the outcome back off the
 * redirect to its own scheme.
 *
 * What this page is NOT is a place where money is decided. The order was created
 * by the app against the buyer's own session, priced server-side; the outcome is
 * verified by the app against the backend, which checks the signature over its
 * own record of that order. Everything this page holds — the key, the order id,
 * the amount it displays — is public checkout material that Razorpay would
 * receive anyway, and an order this backend did not issue fails verification no
 * matter what the sheet reports. This page cannot grant anything.
 */
export default function MobileCheckoutPage() {
  return <MobileCheckout />;
}
