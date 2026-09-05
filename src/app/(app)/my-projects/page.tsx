import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProjectsAndCredits } from "@/components/app/projects-and-credits";

export const metadata: Metadata = {
  title: "Projects & credits",
  description: "How many projects you hold, how to get more, and your AI image credits.",
};

/**
 * The customer's own billing page.
 *
 * Everything a customer can hold or buy, in one place. Until now it was scattered: the
 * project count lived in a strip on the dashboard, the AI wallet was tucked under a
 * "no plan needed" message on /plan (a page about shop subscriptions, which a customer
 * cannot buy), and there was nowhere at all that simply answered "what do I have and
 * how do I get more".
 *
 * CUSTOMER only. A shop's equivalent is /plan, which sells the things a shop buys —
 * monthly tiers, points, project credits against a subscription — none of which a
 * customer account may hold.
 */
export default async function MyProjectsPage() {
  await requireRole(["CUSTOMER"]);

  return (
    <div className="hv-mp">
      {/* See .hv-aura in globals.css — the wash every app screen's header gets. */}
      <div className="hv-aura" aria-hidden />

      <header className="hv-mp-head">
        <Eyebrow className="hv-rise">Your account</Eyebrow>
        <h1 className="display hv-mp-title hv-rise hv-rise-1">Projects &amp; credits</h1>

        {/* The definitions used to live here, as a two-column glossary between the
            title and the content: a reader had to be taught the vocabulary before
            being shown their own balance in it. They now sit where each thing is
            sold, which is the only place the distinction is actually load-bearing
            — nobody needs "what is a credit" explained twice before being told
            they hold four. */}
        <p className="hv-mp-sub hv-rise hv-rise-2">
          What you hold, what it has made, and what else you can add.
        </p>
      </header>

      {/* The two counters and the counter that sells, wired together so a purchase on
          this page is reflected by the balances on it. They were three independent
          fetch-once panels, which meant buying credits left the balance directly above
          the cart still reading its pre-payment number. */}
      <ProjectsAndCredits />

      {/* Deliberately says "the counter" rather than "any HueVista shop": which is
          true depends on the issuing shop's numbering, and this page has no scheme
          loaded to tell them apart. The colour board itself carries the precise
          answer in its footer, where it matters. */}
      <div className="hv-mp-foot">
        <p>
          Every colour carries a code the counter can look up.{" "}
          <Link href="/studio">Start a room</Link> and your board is built as you go.
        </p>
      </div>

      <style>{`
        /* Wide enough for the till and the two balances to sit side by side, and no
           wider: past this the till's own rows start stretching, and a price list whose
           price is a hand's width from the thing it prices is harder to read, not
           grander. Every column of TEXT on the page keeps its own measure below. */
        .hv-mp { position: relative; max-width: 1120px; }

        .hv-mp-head, .hv-mp-foot { position: relative; z-index: 1; }
        .hv-mp-title {
          font-size: clamp(36px, 5.4vw, 60px); margin: 14px 0 22px; letter-spacing: -.02em;
        }

        .hv-mp-sub {
          margin: 0; max-width: 54ch;
          font: 400 16px/1.65 var(--sans); color: var(--fg-soft);
        }

        /* The rule spans the page; the sentence keeps its measure. They were the same
           element, so the rule stopped at 58ch — a line ending a third of the way across
           reads as a border that failed rather than as one closing the page. */
        .hv-mp-foot {
          margin-top: 52px; padding-top: 24px; border-top: 1px solid var(--rule);
        }
        .hv-mp-foot p {
          margin: 0; font: 400 14px/1.7 var(--sans); color: var(--fg-mute); max-width: 58ch;
        }
        .hv-mp-foot a { color: var(--accent-text); }
      `}</style>
    </div>
  );
}
