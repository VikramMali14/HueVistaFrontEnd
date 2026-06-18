import type { Metadata } from "next";
import { registerAction } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Marquee } from "@/components/layout/marquee";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { TrialForm } from "./form";

export const metadata: Metadata = {
  title: "Try it free",
  description: "Fourteen days. No card. Cancel quietly when you wish.",
};

export default async function TrialPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only forward a same-origin relative path (open-redirect guard).
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <>
      <Marquee items={["Try it free · Fourteen days · No card · Cancel quietly", "Asian Paints catalogue, day one", "For retailers, not consumers"]} />
      <SiteHeader showSignIn />
      <main>
        <div className="trial-shell">
          <aside className="trial-side">
            <Eyebrow>Free trial</Eyebrow>
            <h1>Begin a <br /><i>trial.</i></h1>
            <Lead style={{ marginTop: 24 }}>Fourteen days. No card. Cancel quietly when you wish.</Lead>
            <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 18 }}>
              {["Full Asian Paints catalogue from day one", "Up to 30 AI previews during the trial", "No card, no nudges, no auto-renewal", "One-to-one onboarding on a 30-minute call", "Your projects stay yours — export them any time"].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", font: "400 19px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
                  <span style={{ color: "var(--accent-soft)", fontFamily: "var(--mono)", fontSize: 22 }}>·</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid var(--rule)" }}>
              <p style={{ font: "400 22px/1.5 var(--serif)", color: "var(--fg)", maxWidth: "28ch" }}>
                Most shops have their first preview on screen within ten minutes of signing up.
              </p>
              <Mono style={{ marginTop: 18, display: "block" }}>No card &nbsp;·&nbsp; onboarding call included</Mono>
            </div>
          </aside>
          <TrialForm action={registerAction} next={safeNext} />
        </div>
      </main>
      <Footer />
      <style>{`
        .trial-shell { display: grid; grid-template-columns: 1fr 1.4fr; gap: 96px; padding: 100px 0 160px; }
        .trial-side { position: sticky; top: 120px; align-self: start; }
        .trial-side h1 { font-family: var(--serif); font-weight: 300; font-size: clamp(56px, 7vw, 108px); line-height: .92; letter-spacing: -.025em; margin: 24px 0 0; }
        .trial-side h1 i { color: var(--accent-soft); }
        @media (max-width: 1100px) {
          .trial-shell { grid-template-columns: 1fr; gap: 48px; padding-top: 60px; }
          .trial-side { position: static; }
        }
      `}</style>
    </>
  );
}
