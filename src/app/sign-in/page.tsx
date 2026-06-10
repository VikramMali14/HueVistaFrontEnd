import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Logo } from "@/components/ui/logo";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your HueVista studio.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return (
    <>
      <SiteHeader showSignIn={false} />
      <div className="auth-shell">
        <aside className="auth-art" style={{ color: "var(--ivory)" }}>
          <div className="corner">
            <span>Terracotta · AP-1428</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            <Logo size="lg" />
            <p style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 30, lineHeight: 1.15, color: "var(--ivory)", maxWidth: "18ch", letterSpacing: "-.02em", margin: 0 }}>
              See the colour on the wall before the can opens.
            </p>
          </div>
          <div className="corner">
            <span>HueVista</span>
            <span>Belgavi, India</span>
          </div>
        </aside>

        <section className="auth-form-wrap">
          <Eyebrow>Welcome back</Eyebrow>
          <h1>Welcome back.</h1>
          <Lead style={{ maxWidth: "42ch" }}>Your projects, colours and saved previews — right where you left them.</Lead>
          <SignInForm action={loginAction} next={next ?? "/dashboard"} />
          <p className="auth-foot">New to HueVista? <Link href="/trial">Start your free 14-day trial.</Link></p>
        </section>
      </div>

      <style>{`
        body { display: flex; flex-direction: column; min-height: 100vh; }
        .auth-shell { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 88px); }
        .auth-art { position: relative; overflow: hidden; background: radial-gradient(ellipse at 30% 25%, rgba(255,235,210,.32), transparent 60%), linear-gradient(160deg, #b96b48 0%, #7a3a2f 55%, #2a100e 100%); border-right: 1px solid var(--rule); padding: 56px; color: #ebe5d7; display: flex; flex-direction: column; justify-content: space-between; }
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
