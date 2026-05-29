import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";

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
          Enter the email associated with your counter. We will send a reset link if an account exists.
        </Lead>
        <form
          action="/api/auth/forgot-password"
          method="post"
          style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 48 }}
        >
          <div className="field">
            <label className="field-label" htmlFor="email">Shop email</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="suresh@shardapaints.in" />
          </div>
          <button type="submit" className="btn" style={{ justifyContent: "center" }}>
            Send reset link <span className="arr">→</span>
          </button>
          <Mono>
            We will never share your email. If no account exists, no email is sent and no error is shown — to protect
            your privacy.
          </Mono>
        </form>
        <p style={{ marginTop: 40, font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Remembered it? <Link href="/sign-in" style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}>Sign in.</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
