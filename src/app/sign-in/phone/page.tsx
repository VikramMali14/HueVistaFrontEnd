import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Logo } from "@/components/ui/logo";
import { AuthArt } from "@/components/auth/auth-art";
import { phoneSignInEnabled } from "@/lib/firebase";
import { PhoneSignInForm } from "./phone-form";

export const metadata: Metadata = {
  title: "Sign in with your mobile",
  description: "Sign in to HueVista with your mobile number — no password needed.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Sign in with a mobile number.
 *
 * <p>Its own page rather than a third field on /sign-in, because it is a different
 * conversation: two steps, a countdown, and no password anywhere in it. Squeezing that
 * into the email form would make the common case — someone who has a password —
 * busier for the sake of the other one.
 *
 * <p>There is no separate "create an account" version. The number IS the identity: if
 * it has an account the customer lands on it, and if it does not, one is opened. Asking
 * somebody to know in advance which of those they are would be asking them something
 * only we can answer.
 */
export default async function PhoneSignInPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return (
    <>
      <SiteHeader showSignIn={false} />
      <div className="auth-shell">
        <AuthArt>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(20px, 4vw, 36px)", padding: "28px 0" }}>
            <Logo size="lg" />
            <p style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(21px, 4.5vw, 30px)", lineHeight: 1.15, color: "var(--ivory)", maxWidth: "18ch", letterSpacing: "-.02em", margin: 0 }}>
              Your number is your key. No password to forget.
            </p>
          </div>
        </AuthArt>

        <section className="auth-form-wrap">
          <Eyebrow>Mobile sign-in</Eyebrow>
          <h1>Sign in with your <i>mobile.</i></h1>
          <Lead style={{ maxWidth: "42ch" }}>
            We&apos;ll text you a code. If you&apos;ve been here before you&apos;ll land right back in your
            projects; if not, we&apos;ll set you up in a moment.
          </Lead>

          <PhoneSignInForm next={next ?? "/dashboard"} enabled={phoneSignInEnabled} />

          <p className="auth-foot">
            Prefer a password? <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in with your email.</Link>
          </p>
        </section>
      </div>

      <style>{`
        body { display: flex; flex-direction: column; min-height: 100vh; }
        .auth-shell { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 88px); }
        .auth-art { position: relative; overflow: hidden; isolation: isolate; background: #2a100e; border-right: 1px solid var(--rule); padding: 56px; color: #ebe5d7; display: flex; flex-direction: column; justify-content: space-between; }
        .auth-art > * { position: relative; z-index: 2; }
        .auth-art > .auth-art-layers { position: absolute; z-index: 0; }
        .auth-art .corner { display: flex; justify-content: space-between; align-items: baseline; font: 400 12px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; color: rgba(235,229,215,.6); }
        .auth-form-wrap { display: flex; flex-direction: column; justify-content: center; padding: 80px; background: var(--bg); color: var(--fg); }
        .auth-form-wrap h1 { font-family: var(--serif); font-weight: 650; font-size: clamp(40px, 4.5vw, 60px); line-height: 1; letter-spacing: -.02em; margin: 16px 0 12px; color: var(--fg); }
        .auth-form-wrap h1 i { color: var(--accent-soft); }
        .auth-form-wrap > * { max-width: 480px; width: 100%; }
        .auth-foot { margin-top: 40px; font: 300 italic 17px/1.5 var(--serif); color: var(--fg-mute); }
        .auth-foot a { color: var(--accent-soft); border-bottom: 1px solid var(--rule-brass); }
        .auth-foot a:hover { color: var(--accent); }
        @media (max-width: 1100px) { .auth-shell { grid-template-columns: 1fr; } .auth-art { padding: 48px; min-height: 280px; border-right: none; border-bottom: 1px solid var(--rule); } .auth-form-wrap { padding: 64px 40px; } }
      `}</style>
    </>
  );
}
