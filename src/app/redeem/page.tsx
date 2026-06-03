import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { hasSession } from "@/lib/auth";
import { RedeemForm } from "./redeem-form";

export const metadata: Metadata = {
  title: "Redeem a code",
  description: "Enter the access code from your paint shop to unlock your project.",
};

/**
 * PUBLIC page. A customer who got a code from their shop can land here without an
 * account. If they're not signed in we prompt them to sign in / create an account
 * first (their credentials are saved on register), then they come back and redeem.
 */
export default async function RedeemPage() {
  const signedIn = await hasSession();
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        {signedIn ? (
          <RedeemForm />
        ) : (
          <div>
            <header style={{ marginBottom: 32 }}>
              <Eyebrow>Redeem · access code</Eyebrow>
              <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
                Have a code from<br /><i>your paint shop?</i>
              </h1>
              <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
                First, sign in or create a free account — that&apos;s where your projects and shop access live.
                Then enter your code and you&apos;re in.
              </Lead>
            </header>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <Link className="btn btn-brass" href="/sign-in?next=/redeem">
                Sign in to redeem <span className="arr">→</span>
              </Link>
              <Link className="btn btn-ghost" href="/trial?next=/redeem">
                New here? Create an account <span className="arr">→</span>
              </Link>
            </div>
            <p style={{ font: "300 italic 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 24, maxWidth: "52ch" }}>
              <Mono>Why an account?</Mono> Your shop&apos;s code links to your account, so your saved rooms and
              colour choices stay with you across visits. Retailers don&apos;t need a code.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
