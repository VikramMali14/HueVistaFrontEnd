import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { SignInForm } from "@/app/sign-in/form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free HueVista account to keep the room and the colours you picked.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Dedicated CUSTOMER signup — distinct from the retailer/shop signup (/trial).
 * A walk-in who redeemed a shop code lands here to keep their own work; the account
 * is created with the CUSTOMER role (no shop fields, no Google, no retailer UI), so
 * they never get funnelled into the shop login. Retailers go to /trial instead.
 */
export default async function JoinPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  // Default to the dashboard: a fresh account has no guest cookie, so the guest
  // studio (/studio) would bounce it straight back to /redeem.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <>
      <SiteHeader showSignIn />
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "72px var(--gutter) 140px" }}>
        <Eyebrow>Create account · for you</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 68px)", margin: "16px 0 14px" }}>
          Keep your <i>colours.</i>
        </h1>
        <Lead style={{ maxWidth: "46ch" }}>
          A free, personal account — your room previews and the shades you picked stay with you.
          No shop to set up, no card.
        </Lead>

        <SignInForm action={registerAction} mode="register" next={safeNext} accountType="customer" showGoogle={false} />

        <p style={{ marginTop: 36, font: "300 italic 17px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Already have an account?{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(safeNext)}`}
            style={{ color: "var(--accent-soft)", borderBottom: "1px solid var(--rule-brass)" }}
          >
            Sign in.
          </Link>
        </p>
        <p style={{ marginTop: 16, font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          Run a paint shop?{" "}
          <Link href="/trial" style={{ color: "var(--accent-soft)" }}>
            Request a shop account
          </Link>{" "}
          and we&apos;ll set you up.
        </p>
      </main>
      <Footer />
    </>
  );
}
