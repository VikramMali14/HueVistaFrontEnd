import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { leaveNewsletterAction } from "@/lib/newsletter";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Leave the HueVista monthly letter.",
  // Nothing here is worth indexing, and a crawler that followed a token out of a
  // leaked mail would unsubscribe the reader on their behalf.
  robots: { index: false, follow: false },
};

/**
 * Where the unsubscribe link in the welcome mail lands.
 *
 * It removes the address on load rather than asking for a confirming click. That is
 * the deliberate trade: the promise on the sign-up form is "cancel quietly, any time",
 * and a reader who has decided to leave should not have to press anything else. The
 * token only ever removes its own address, so the worst a stray click costs is a
 * subscription the clicker could re-create in one field.
 */
export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await leaveNewsletterAction(token)
    : { error: "That unsubscribe link is missing its token." };

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "120px var(--gutter) 160px" }}>
        <Eyebrow>Monthly letter</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(38px, 6vw, 68px)", marginTop: 16 }}>
          {result.ok ? <>You&rsquo;re <i>unsubscribed.</i></> : <>Something&rsquo;s <i>off.</i></>}
        </h1>
        <Lead style={{ marginTop: 20 }}>
          {result.ok
            ? "No more letters. Nothing else about your account changes, and you can join again any time from the journal."
            : result.error}
        </Lead>
        <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/journal" className="btn btn-ghost">
            Back to the journal <span className="arr">→</span>
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
