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
    <div style={{ maxWidth: 760 }}>
      <Eyebrow>Projects &amp; credits</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        What you <i>have.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch" }}>
        A project is one room: your photo, its walls marked, every colour you try, and the
        colour board at the end. The AI image is the one thing it doesn&rsquo;t include —
        that comes out of the credits below.
      </Lead>

      {/* The two counters and the counter that sells, wired together so a purchase on
          this page is reflected by the balances on it. They were three independent
          fetch-once panels, which meant buying credits left the balance directly above
          the cart still reading its pre-payment number. */}
      <ProjectsAndCredits />

      {/* And what those credits actually bought. Renders nothing until there is a
          picture to show, so the page is unchanged for an account that has not made
          one yet. */}
      <div style={{ marginTop: 36 }}>
        <AiImagesStrip />
      </div>

      {/* Deliberately says "the counter" rather than "any HueVista shop": which is
          true depends on the issuing shop's numbering, and this page has no scheme
          loaded to tell them apart. The colour board itself carries the precise
          answer in its footer, where it matters. */}
      <p style={{ marginTop: 32, font: "400 14px/1.6 var(--sans)", color: "var(--fg-mute)", maxWidth: "58ch" }}>
        Every colour you see carries a code. Take it to the counter and they can look up
        the exact shade, or the closest match in a company they stock —{" "}
        <Link href="/studio" style={{ color: "var(--accent)" }}>
          start a room
        </Link>{" "}
        and your board is built as you go.
      </p>
    </div>
  );
}
