import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { AiImagesStrip } from "@/components/app/ai-images-strip";
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
      {/* The one piece of atmosphere on the page, and it is behind the words rather
          than around them: two very low-opacity accent washes that drift against each
          other. A billing screen is a column of rectangles by nature, and a column of
          rectangles on a flat ground is what makes one read as a form to be filled in.
          Decorative and inert — no text sits on it, it is aria-hidden, and it stops
          moving entirely under reduced motion. */}
      <div className="hv-mp-aura" aria-hidden />

      <header className="hv-mp-head">
        <Eyebrow className="hv-mp-rise">Projects &amp; credits</Eyebrow>
        <h1 className="display hv-mp-title hv-mp-rise hv-mp-d1">
          What you <i>have.</i>
        </h1>
        <Lead className="hv-mp-rise hv-mp-d2" style={{ maxWidth: "56ch" }}>
          A project is one room: your photo, its walls marked, every colour you try, and the
          colour board at the end. The AI image is the one thing it doesn&rsquo;t include —
          that comes out of the credits below.
        </Lead>
      </header>

      {/* The two counters and the counter that sells, wired together so a purchase on
          this page is reflected by the balances on it. They were three independent
          fetch-once panels, which meant buying credits left the balance directly above
          the cart still reading its pre-payment number. */}
      <ProjectsAndCredits />

      {/* And what those credits actually bought. Renders nothing until there is a
          picture to show, so the page is unchanged for an account that has not made
          one yet. */}
      <div className="hv-mp-strip">
        <AiImagesStrip />
      </div>

      {/* Deliberately says "the counter" rather than "any HueVista shop": which is
          true depends on the issuing shop's numbering, and this page has no scheme
          loaded to tell them apart. The colour board itself carries the precise
          answer in its footer, where it matters. */}
      <div className="hv-mp-foot">
        <p>
          Every colour you see carries a code. Take it to the counter and they can look up
          the exact shade, or the closest match in a company they stock —{" "}
          <Link href="/studio">start a room</Link> and your board is built as you go.
        </p>
      </div>

      <style>{`
        /* Wide enough for the till and the two balances to sit side by side, and no
           wider: past this the till's own rows start stretching, and a price list whose
           price is a hand's width from the thing it prices is harder to read, not
           grander. Every column of TEXT on the page keeps its own measure below. */
        .hv-mp { position: relative; max-width: 1120px; }

        /* ── The backdrop ──────────────────────────────────────────────────
           Sized off the header and pinned behind it, never around the whole
           column: a wash that follows the panels down the page would tint the
           prices, and a price on a coloured ground is the one thing a billing
           screen must not do. */
        .hv-mp-aura {
          position: absolute; z-index: 0; pointer-events: none;
          inset: -140px -30% auto -30%; height: 460px;
          background:
            radial-gradient(46% 52% at 22% 34%, rgba(124,92,255,.16), transparent 68%),
            radial-gradient(38% 44% at 76% 20%, rgba(160,128,255,.10), transparent 70%);
          filter: blur(14px);
          opacity: 0;
          animation: hv-mp-aura-in 1.4s var(--ease) .1s forwards,
                     hv-mp-aura-drift 22s ease-in-out 1.4s infinite alternate;
        }
        @keyframes hv-mp-aura-in { to { opacity: 1; } }
        @keyframes hv-mp-aura-drift {
          from { transform: translate3d(0, 0, 0) scale(1); }
          to   { transform: translate3d(-3%, 12px, 0) scale(1.08); }
        }

        .hv-mp-head, .hv-mp-strip, .hv-mp-foot { position: relative; z-index: 1; }
        .hv-mp-title {
          font-size: clamp(36px, 5.4vw, 60px); margin: 14px 0 16px; letter-spacing: -.02em;
        }

        /* The header arrives rather than appearing. A plain keyframe filling BOTH
           ways, with no observer behind it, deliberately: the .reveal class this
           project uses elsewhere depends on a mount only the marketing pages carry,
           and content stuck at opacity 0 where that mount is missing is worse than
           content that never moved at all. */
        .hv-mp-rise { animation: hv-mp-rise .62s var(--ease) both; }
        .hv-mp-d1 { animation-delay: .07s; }
        .hv-mp-d2 { animation-delay: .14s; }
        @keyframes hv-mp-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }

        .hv-mp-strip { margin-top: 44px; }
        /* The rule spans the page; the sentence keeps its measure. They were the same
           element, so the rule stopped at 58ch — a line ending a third of the way across
           reads as a border that failed rather than as one closing the page. */
        .hv-mp-foot {
          margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--rule);
        }
        .hv-mp-foot p {
          margin: 0; font: 400 14px/1.7 var(--sans); color: var(--fg-mute); max-width: 58ch;
        }
        .hv-mp-foot a { color: var(--accent); }

        @media (prefers-reduced-motion: reduce) {
          .hv-mp-aura { animation: none; opacity: 1; }
          .hv-mp-rise { animation: none; }
        }
      `}</style>
    </div>
  );
}
