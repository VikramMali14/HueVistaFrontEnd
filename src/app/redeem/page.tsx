import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { RedeemForm } from "./redeem-form";

export const metadata: Metadata = {
  title: "Redeem a code",
  description: "Enter the access code from your paint shop to unlock your projects.",
};

/**
 * PUBLIC page. Redeeming needs NO login: entering the code auto-creates the
 * customer's account (named by the shop) and signs them in. Any existing session
 * is logged out first (handled in redeemAccountAction), so whoever holds the code
 * lands as themselves — never on top of the retailer's or a previous customer's
 * session.
 */
export default function RedeemPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        <RedeemForm />
      </main>
      <Footer />
    </>
  );
}
