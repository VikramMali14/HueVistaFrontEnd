import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { customerShopStatus, requireRole } from "@/lib/auth";
import { AssignedProductsView } from "@/components/app/assigned-products";

export const metadata: Metadata = {
  title: "Your products",
  description: "The companies and products your paint shop unlocked for you.",
};

export default async function AssignedProductsPage() {
  // Customers only — the products behind this page hang off the access code a
  // customer redeemed, so nobody else can have any. This was the one app page with
  // no role guard while the nav already hid its tab from everyone but customers, so
  // an admin or retailer opening the URL fired a request that could only ever come
  // back 404 ("No access code is linked to this account") and log a console error
  // under an otherwise correct-looking empty state.
  await requireRole(["CUSTOMER"]);

  // And customers a shop actually onboarded. A shop is the ONLY way products get
  // assigned — a customer is linked to one by redeeming its code, and nothing else
  // creates that link — so an account that signed up on its own (Google, e-mail) has
  // no shop, no code and therefore no products, for as long as it redeems nothing.
  //
  // This page does not exist for them. It used to answer with a page of its own
  // explaining the emptiness, which made "My products" look like a real part of a
  // shopless customer's account that simply had nothing in it yet — the page was
  // reachable, titled, and bookmarkable for an account it can never have anything to
  // say to. Bouncing to the dashboard is the same answer requireRole and
  // requireFeature already give for a page you may not open, and the banner there
  // says why and how to change it (redeem a code), which a bare 404 could not.
  //
  // Only a DEFINITE "no" closes it. The entitlement read can also simply fail, and
  // turning that into a bounce would tell a customer who redeemed a code last week
  // that no shop stands behind their account — a confident lie, told to the exact
  // people this page is for, every time the backend hiccups. That case falls through
  // to the view, which reports the failure instead of inventing an answer.
  if ((await customerShopStatus()) === "none") {
    redirect("/dashboard?denied=noshop");
  }

  return <AssignedProductsView />;
}
