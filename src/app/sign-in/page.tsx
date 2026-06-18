import type { Metadata } from "next";
import Link from "next/link";
import { loginAction, registerAction } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Logo } from "@/components/ui/logo";
import { AuthArt } from "@/components/auth/auth-art";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your HueVista studio.",
};

interface PageProps {
  searchParams: Promise<{ next?: string; mode?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { next, mode, error } = await searchParams;
  // /sign-in?mode=register — the free, no-shop account (e.g. a walk-in customer
  // keeping their guest work). registerAction treats the shop fields as optional.
  const register = mode === "register";
  return (
    <>
      <SiteHeader showSignIn={false} />
      <div className="auth-shell">
        <AuthArt>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(20px, 4vw, 36px)", padding: "28px 0" }}>
            <Logo size="lg" />
            <p style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(21px, 4.5vw, 30px)", lineHeight: 1.15, color: "var(--ivory)", maxWidth: "18ch", letterSpacing: "-.02em", margin: 0 }}>
              See the colour on the wall before the can opens.
            </p>
          </div>
        </AuthArt>

        <section className="auth-form-wrap">
          <Eyebrow>{register ? "Create account" : "Sign in"}</Eyebrow>
          <h1>{register ? <>Create your <i>account.</i></> : <>Welcome <i>back.</i></>}</h1>
          <Lead style={{ maxWidth: "42ch" }}>
            {register
              ? "Free, no card — your projects, colours and saved previews stay with you for good."
              : "Your projects, colours and saved previews — right where you left them."}
          </Lead>
          <SignInForm
            action={register ? registerAction : loginAction}
            mode={register ? "register" : "signin"}
            next={next ?? "/dashboard"}
            initialError={error === "google" ? "Google sign-in didn’t complete. Please try again, or use your email below." : undefined}
          />
          <p className="auth-foot">
            {register ? (
              <>Already have an account? <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in.</Link></>
            ) : (
              <>New to HueVista? <Link href="/trial">Start your free 14-day trial.</Link></>
            )}
          </p>
        </section>
      </div>

      <style>{`
        body { display: flex; flex-direction: column; min-height: 100vh; }
        .auth-shell { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 88px); }
        .auth-art { position: relative; overflow: hidden; isolation: isolate; background: #2a100e; border-right: 1px solid var(--rule); padding: 56px; color: #ebe5d7; display: flex; flex-direction: column; justify-content: space-between; }
        .auth-art > * { position: relative; z-index: 2; }
        .auth-art > .auth-art-layers { position: absolute; z-index: 0; }
        .auth-art .corner { display: flex; justify-content: space-between; align-items: baseline; font: 400 10px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; color: rgba(235,229,215,.6); }
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
