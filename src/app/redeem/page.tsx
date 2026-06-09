import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { hasSession } from "@/lib/auth";
import { RedeemForm } from "./redeem-form";
import { GuestRedeemForm } from "./guest-redeem-form";

export const metadata: Metadata = {
  title: "Redeem a code",
  description: "Enter the access code from your paint shop to unlock your project.",
};

/**
 * PUBLIC page. A customer who got a code from their shop can redeem it WITHOUT an
 * account (guest flow → two options: continue as guest, or sign in to keep their
 * work). A visitor who is already signed in gets the account redeem instead, which
 * links the shop to their profile.
 */
export default async function RedeemPage() {
  const signedIn = await hasSession();
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        {signedIn ? <RedeemForm /> : <GuestRedeemForm />}
      </main>
      <Footer />
    </>
  );
}
