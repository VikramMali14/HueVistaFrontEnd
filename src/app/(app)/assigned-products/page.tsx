import type { Metadata } from "next";
import Link from "next/link";
import { customerHasShop, requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
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

  // And customers a shop actually onboarded. An account that signed up on its own —
  // a Google login, an email address — has no access code and therefore no assigned
  // products, so this page could only ever tell them the same 404 in a slightly
  // prettier way. The nav hides the tab for them; this covers the URL, and says
  // something true instead of something broken.
  if (!(await customerHasShop())) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Eyebrow>Your products</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
          Nothing <i>assigned.</i>
        </h1>
        <Lead style={{ maxWidth: "52ch" }}>
          This page shows the paint companies and products a shop has picked out for you,
          and it fills up when you unlock with a shop&rsquo;s access code. You signed up on
          your own, so there is no shop behind this account yet — the whole catalogue is
          open to you in the studio in the meantime.
        </Lead>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link className="btn btn-brass" href="/studio">
            Start a room <span className="arr">→</span>
          </Link>
          <Link className="btn btn-ghost" href="/unlock">
            I have a shop code <span className="arr">→</span>
          </Link>
        </div>
      </div>
    );
  }

  return <AssignedProductsView />;
}
