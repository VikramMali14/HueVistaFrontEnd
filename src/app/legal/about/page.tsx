import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { contact } from "@/lib/config";
import { fetchCatalogueSize } from "@/lib/catalogue";
import { FREE_PLAN_PROJECTS } from "@/lib/free-plan";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Who HueVista is, what it sells and who runs it — the registered business behind the paint visualiser.",
};

const label: React.CSSProperties = {
  font: "500 12px/1 var(--mono)",
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  display: "block",
  marginBottom: 10,
};

const body: React.CSSProperties = {
  font: "300 18px/1.6 var(--serif)",
  color: "var(--fg-soft)",
  margin: 0,
};

/**
 * "About Us" is its own line on a payment processor's review checklist, separate from
 * Contact Us — and /method explains how the product works without ever saying who is
 * behind it or what, exactly, is being sold. This page answers those two, plainly, and
 * names the registered entity so it can be matched against the KYC filing.
 *
 * The catalogue figure is read from the backend rather than written down. Every
 * hardcoded count on this site has drifted past the truth at some point; a number in a
 * document a reviewer is checking is the worst place for that to happen again. Null when
 * the backend is unreachable, and the sentence then simply omits it.
 */
export default async function AboutPage() {
  const size = await fetchCatalogueSize();
  return (
    <>
      <SiteHeader />
      <main id="main" style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Company</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          About <i>us.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          HueVista lets a paint shop show a customer their own room in a colour before the
          can is opened. Built in India, for Indian counters.
        </Lead>

        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 40 }}>
          <section>
            <span style={label}>What we do</span>
            <p style={body}>
              Choosing paint from a shade card asks someone to imagine a whole wall from a
              square the size of a stamp. HueVista removes the guesswork: a photograph of the
              real room is uploaded, the walls are found, and any shade from the shop&rsquo;s
              catalogue is laid onto them so the customer can see the room before deciding.
              The shade codes stay intact throughout, so whatever is chosen on screen is
              something the shop can actually tint and sell.
            </p>
          </section>

          <section>
            <span style={label}>Who it is for</span>
            <p style={body}>
              Paint retailers, not consumers. A shop subscribes, gets its own catalogue and
              a link it can share with customers, and works through them at the counter or
              over WhatsApp. Walk-in customers can also buy a single visualisation at a
              shop&rsquo;s in-store kiosk link without creating an account.
            </p>
          </section>

          <section>
            <span style={label}>What we sell</span>
            <p style={body}>
              Monthly software subscriptions to paint retailers, priced in Indian rupees and
              billed through Razorpay; single room visualisations bought by walk-in customers
              at a shop&rsquo;s kiosk link; and account credit — extra projects, project
              reopens and points — bought by shops on top of a plan. Everything is delivered
              electronically and immediately. Nothing is shipped. Every shop has a free plan
              that needs no card — {FREE_PLAN_PROJECTS} projects every month, for as long as
              the account exists.
            </p>
          </section>

          <section>
            <span style={label}>The catalogue</span>
            <p style={body}>
              {size
                ? `We currently hold ${size.shades.toLocaleString("en-IN")} shades across
                   ${size.brands} paint ${size.brands === 1 ? "company" : "companies"}, with
                   more being added. `
                : "We hold the published shade ranges of the paint companies we carry, with more being added. "}
              Shade names, codes and colour values belong to the paint companies that
              publish them. HueVista is an independent product: it is not made, sponsored,
              endorsed or approved by any paint company, and we do not act for any of them.
            </p>
          </section>

          <section>
            <span style={label}>Honesty about the previews</span>
            <p style={body}>
              Previews are generated by AI and shade colours are taken from the companies&rsquo;
              own shade cards, so both can differ from the paint that ends up on the wall.
              We say so on the pages where colours are shown, before anyone pays rather than
              after, and we tell every customer to check the physical shade card at the
              counter before buying. A tool that oversells its own accuracy costs a shop a
              returned tin and a customer&rsquo;s trust.
            </p>
          </section>

          <section>
            <span style={label}>The business</span>
            <p style={body}>
              HueVista is a sole proprietorship, owned and run by {contact.legalName},
              registered at {contact.addressInline}. It is a small, independent operation —
              the same person who builds the product answers the support mail.
            </p>
          </section>

          <section>
            <span style={label}>Reaching us</span>
            <p style={body}>
              Write to{" "}
              <a href={`mailto:${contact.general}`} style={{ color: "var(--accent-text)" }}>
                {contact.general}
              </a>{" "}
              or call{" "}
              <a href={`tel:${contact.phoneE164}`} style={{ color: "var(--accent-text)" }}>
                {contact.phone}
              </a>{" "}
              ({contact.phoneHours}). Billing and refund questions go to{" "}
              <a href={`mailto:${contact.billing}`} style={{ color: "var(--accent-text)" }}>
                {contact.billing}
              </a>
              . Full postal address, grievance process and response times are on our{" "}
              <a href="/legal/contact" style={{ color: "var(--accent-text)" }}>
                contact page
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
