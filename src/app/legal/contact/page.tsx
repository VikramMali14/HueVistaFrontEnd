import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "How to reach HueVista — registered address, email and phone for support, billing and legal enquiries.",
};

const label: React.CSSProperties = {
  font: "500 10px/1 var(--mono)",
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
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
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
              HueVista
              <br />
              Proprietor: Vikram Mali
              <br />
              Mount Road, Manpur, Abu Road
              <br />
              Sirohi, Rajasthan 307026
              <br />
              India
            </address>
          </section>

          <section>
            <span style={label}>Email</span>
            <p style={body}>
              General and support —{" "}
              <a href="mailto:hello@huevista.com" style={{ color: "var(--accent)" }}>
                hello@huevista.com
              </a>
              <br />
              Billing, payments and refunds —{" "}
              <a href="mailto:payments@huevista.com" style={{ color: "var(--accent)" }}>
                payments@huevista.com
              </a>
            </p>
          </section>

          <section>
            <span style={label}>Phone</span>
            <p style={body}>
              <a href="tel:+916378482381" style={{ color: "var(--accent)" }}>
                +91 63784 82381
              </a>
              <br />
              Monday to Saturday, 10:00–19:00 IST.
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
              <a href="mailto:hello@huevista.com" style={{ color: "var(--accent)" }}>
                hello@huevista.com
              </a>{" "}
              with &ldquo;Grievance&rdquo; in the subject, addressed to Vikram Mali, Proprietor, at
              the address above. We acknowledge within two business days and aim to resolve within
              fifteen.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
