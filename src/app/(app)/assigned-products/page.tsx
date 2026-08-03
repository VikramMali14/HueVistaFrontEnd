import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
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
  return <AssignedProductsView />;
}
