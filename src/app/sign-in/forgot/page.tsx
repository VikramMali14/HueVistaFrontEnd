import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Reset passphrase",
  description: "Reset your HueVista passphrase.",
};

export default function ForgotPage() {
  return (
    <>
      <SiteHeader showSignIn={false} />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "120px 24px 160px" }}>
        <Eyebrow>Reset</Eyebrow>
        <h1
          className="display"
          style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}
        >
          A new <i>passphrase.</i>
        </h1>
        <Lead style={{ marginTop: 24 }}>
          Enter the email associated with your counter. We&apos;ll send a 6-digit reset code if an account exists.
        </Lead>
        <ForgotForm />
        <p style={{ marginTop: 40, font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Remembered it? <Link href="/sign-in" style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}>Sign in.</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
