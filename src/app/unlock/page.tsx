import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { getCurrentUserResult, hasSession } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = {
  title: "Unlock your projects",
  description: "Enter the code from your paint shop to unlock your projects.",
};

/**
 * PUBLIC page, with three quite different jobs behind one code box — which is why it
 * reads the session before it renders anything.
 *
 * - Nobody signed in: the walk-in flow. The code auto-creates the customer's account
 *   (named by the shop) and signs them in.
 * - A CUSTOMER signed in: the code is added to the account they already have, so the
 *   projects, boards and credits they hold survive it. Minting a second account here
 *   was the bug — every "unlock your projects" link in the app leads to this page, and
 *   it was taking those projects away.
 * - A shop / distributor / painter / admin signed in: no code box at all. Redeeming
 *   would destroy the role on their account, and the walk-in route would silently
 *   swap a shop's till session for a customer's. They are asked to sign out first.
 */
export default async function UnlockPage() {
  const [{ user }, sessionPresent] = await Promise.all([getCurrentUserResult(), hasSession()]);
  return (
    <>
      <SiteHeader />
      <main id="main" style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        {/* A session cookie is here but the profile behind it could not be read — the
            backend is restarting, or the token is mid-refresh. Guessing "signed out" is
            the one answer that must not be given: it runs the walk-in route and mints a
            SECOND account for somebody who already has one. A walk-in, the visitor this
            page is really for, carries no session cookie and never lands here. */}
        {!user && sessionPresent ? (
          <SessionUnknown />
        ) : (
          <UnlockForm signedInAs={user ? { name: user.name, role: user.role } : null} />
        )}
      </main>
      <Footer />
    </>
  );
}

function SessionUnknown() {
  return (
    <div>
      <Eyebrow>Unlock · shop code</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 60px)", marginTop: 12 }}>
        One moment.
      </h1>
      <Lead style={{ marginTop: 20, maxWidth: "50ch" }}>
        We couldn&rsquo;t check which account is signed in on this browser just now, and a
        code has to go to the right one. Reload the page in a moment and the box will be
        here.
      </Lead>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 28 }}>
        {/* A real reload, not a client navigation: the point is to ask the backend
            again, and Next would happily serve this same render from its cache. */}
        <a className="btn btn-brass" href="/unlock">Try again <span className="arr">→</span></a>
        <Link className="btn btn-ghost" href="/">Back to home</Link>
      </div>
    </div>
  );
}
