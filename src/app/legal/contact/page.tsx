import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { contact } from "@/lib/config";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "How to reach HueVista — registered address, email and phone for support, billing and legal enquiries.",
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

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          Contact <i>us.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          A real address, a real inbox and a real phone. Reach us any of these ways — we reply
          within one business day.
        </Lead>

        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 40 }}>
          <section>
            <span style={label}>Registered business</span>
            <address style={{ ...body, fontStyle: "normal" }}>
              {contact.addressLines.map((line, i) => (
                <span key={line}>
                  {line}
                  {i < contact.addressLines.length - 1 && <br />}
                </span>
              ))}
            </address>
          </section>

          <section>
            <span style={label}>Email</span>
            <p style={body}>
              General enquiries —{" "}
              <a href={`mailto:${contact.general}`} style={{ color: "var(--accent-text)" }}>
                {contact.general}
              </a>
              <br />
              Product help —{" "}
              <a href={`mailto:${contact.support}`} style={{ color: "var(--accent-text)" }}>
                {contact.support}
              </a>
              <br />
              Billing, payments and refunds —{" "}
              <a href={`mailto:${contact.billing}`} style={{ color: "var(--accent-text)" }}>
                {contact.billing}
              </a>
            </p>
          </section>

          <section>
            <span style={label}>Phone</span>
            <p style={body}>
              <a href={`tel:${contact.phoneE164}`} style={{ color: "var(--accent-text)" }}>
                {contact.phone}
              </a>
              <br />
              {contact.phoneHours}.
            </p>
          </section>

          <section>
            <span style={label}>In the app</span>
            <p style={body}>
              Signed-in shops can use the support chat from the dashboard — it reaches the same
              people and carries your account details with it, which is usually the fastest route
              for anything billing-related.
            </p>
          </section>

          <section>
            <span style={label}>Grievances</span>
            <p style={body}>
              If something has gone wrong and a first reply has not resolved it, write to{" "}
              <a href={`mailto:${contact.general}`} style={{ color: "var(--accent-text)" }}>
                {contact.general}
              </a>{" "}
              with &ldquo;Grievance&rdquo; in the subject, addressed to {contact.legalName},
              Proprietor, at the address above. We acknowledge within two business days and aim to
              resolve within fifteen.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
