import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import {
  requestShopAccountAction,
  resendShopRequestCodeAction,
  verifyShopRequestAction,
} from "@/lib/leads";
import { ShopLeadForm } from "./lead-form";

export const metadata: Metadata = {
  title: "Bring HueVista to your counter",
  description:
    "Request a free HueVista shop account — fill the form, confirm your email, and your account opens within 24 hours. No card, no plan to choose.",
};

/**
 * Shop-account request page — where every "get started" CTA lands.
 *
 * The shop fills in its details and chooses its own password, confirms the email
 * with a code, and the account opens: within 24 hours at the outside, usually as
 * soon as an admin sees the request. There is no plan to pick and no card to
 * enter; every shop starts free and buys a plan later if it wants one.
 */
export default function TrialPage() {
  return (
    <>
      <SiteHeader showSignIn />
      <main id="main" style={{ maxWidth: 860, margin: "0 auto", padding: "72px var(--gutter) 140px" }}>
        <Eyebrow>For paint shops · free account</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 68px)", margin: "16px 0 14px" }}>
          Bring it to <i>your counter.</i>
        </h1>
        <Lead style={{ maxWidth: "54ch" }}>
          Fill this in, confirm your email, and your shop account opens — free, with AI previews
          included, within 24 hours at the very latest. No card, no plan to choose, nobody to
          wait on the phone for.
        </Lead>

        <div style={{ marginTop: 48 }}>
          <ShopLeadForm
            action={requestShopAccountAction}
            verifyAction={verifyShopRequestAction}
            resendAction={resendShopRequestCodeAction}
          />
        </div>

        <p style={{ marginTop: 48, font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Not a shop? If you got an access code from your paint shop,{" "}
          <Link href="/unlock" style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}>
            unlock it here
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
