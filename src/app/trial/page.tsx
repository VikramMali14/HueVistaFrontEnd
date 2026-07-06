import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { requestShopAccountAction } from "@/lib/leads";
import { ShopLeadForm } from "./lead-form";

export const metadata: Metadata = {
  title: "Bring HueVista to your counter",
  description:
    "Request a HueVista shop account — we set up your login, your organisation and a 14-day trial, then call you back within a working day.",
};

/**
 * Shop-account request page. Shops are provisioned by an admin (not self-serve),
 * so every "get started / try it free" CTA lands here: a lead-capture form with
 * a call-back promise, instead of the retired self-signup or a bare mailto link.
 */
export default function TrialPage() {
  return (
    <>
      <SiteHeader showSignIn />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "72px var(--gutter) 140px" }}>
        <Eyebrow>For paint shops · 14-day trial</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 68px)", margin: "16px 0 14px" }}>
          Bring it to <i>your counter.</i>
        </h1>
        <Lead style={{ maxWidth: "54ch" }}>
          Tell us about your shop and we&apos;ll set everything up — your login, your organisation,
          and a 14-day trial with AI previews included. No card, no self-service maze; a person
          calls you back within a working day.
        </Lead>

        <div style={{ marginTop: 48 }}>
          <ShopLeadForm action={requestShopAccountAction} />
        </div>

        <p style={{ marginTop: 48, font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Not a shop? If you got an access code from your paint shop,{" "}
          <Link href="/redeem" style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}>
            redeem it here
          </Link>
          {" "}— or{" "}
          <Link href="/join" style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}>
            create a free personal account
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
