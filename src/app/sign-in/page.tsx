import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/lib/auth";
import { Nav } from "@/components/layout/nav";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { SignInForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your HueVista atelier.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return (
    <>
      <Nav showSignIn={false} />
      <div className="auth-shell">
        <aside className="auth-art">
          <div className="corner">
            <span className="roman" style={{ fontSize: 18 }}>I.</span>
            <span>Plate XVII &nbsp;·&nbsp; Terracotta &nbsp;·&nbsp; AP-1428</span>
          </div>
          <div>
            <Mono style={{ color: "rgba(235,229,215,.7)" }}>From the Journal</Mono>
            <p style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontWeight: 300, fontSize: 36, lineHeight: 1.2, color: "var(--ivory)", maxWidth: "16ch", letterSpacing: "-.01em", marginTop: 24 }}>
              "The colour, at the counter, before the can opens."
            </p>
            <Mono style={{ marginTop: 24, display: "inline-block", color: "rgba(235,229,215,.7)" }}>— On the founding of HueVista, Belgavi · MMXXV</Mono>
          </div>
          <div className="corner">
            <span>Volume I &nbsp;·&nbsp; The Atelier</span>
            <span>MMXXVI</span>
          </div>
        </aside>

        <section className="auth-form-wrap">
          <Eyebrow>Welcome back</Eyebrow>
          <h1>Sign in to <br /><i>your atelier.</i></h1>
          <Lead style={{ maxWidth: "42ch" }}>The counter, the catalogue, the saved scenes — all where you left them.</Lead>
          <SignInForm action={loginAction} next={next ?? "/atelier"} />
          <p className="auth-foot">New to HueVista? <Link href="/trial">Begin a fourteen-day trial.</Link></p>
        </section>
      </div>

      <style>{`
        body { display: flex; flex-direction: column; min-height: 100vh; }
        .auth-shell { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: calc(100vh - 88px); }
        .auth-art { position: relative; overflow: hidden; background: radial-gradient(ellipse at 30% 25%, rgba(255,235,210,.32), transparent 60%), linear-gradient(160deg, #b96b48 0%, #7a3a2f 55%, #2a100e 100%); border-right: 1px solid var(--rule); padding: 56px; color: var(--ivory); display: flex; flex-direction: column; justify-content: space-between; }
        .auth-art .corner { display: flex; justify-content: space-between; align-items: baseline; font: 400 10px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; color: rgba(235,229,215,.6); }
        .auth-form-wrap { display: flex; flex-direction: column; justify-content: center; padding: 80px; background: var(--charcoal); }
        .auth-form-wrap h1 { font-family: var(--serif); font-weight: 300; font-size: clamp(48px, 5vw, 72px); line-height: .95; letter-spacing: -.02em; margin: 16px 0 12px; }
        .auth-form-wrap h1 i { color: var(--brass-soft); }
        .auth-form-wrap > * { max-width: 480px; width: 100%; }
        .auth-foot { margin-top: 40px; font: 300 italic 17px/1.5 var(--serif); color: var(--mute); }
        .auth-foot a { color: var(--brass-soft); border-bottom: 1px solid var(--rule-brass); }
        .auth-foot a:hover { color: var(--brass); }
        @media (max-width: 1100px) { .auth-shell { grid-template-columns: 1fr; } .auth-art { padding: 48px; min-height: 280px; border-right: none; border-bottom: 1px solid var(--rule); } .auth-form-wrap { padding: 64px 40px; } }
      `}</style>
    </>
  );
}
