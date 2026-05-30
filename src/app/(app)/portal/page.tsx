import type { Metadata } from "next";
import { getUiLocale, getUiVariant, requireRole } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { Placeholder } from "@/components/ui/placeholder";
import { ClassicPortal } from "@/components/classic/portal";
import { RetailerCustomers } from "@/components/app/retailer-customers";

export const metadata: Metadata = {
  title: "The Annex",
  description: "Customer portal — your white-label storefront.",
};

const CODES = [
  { code: "SHARDA-7K2N", customer: "Pooja Deshmukh", validity: "7 days", left: "5 d 14 h", status: "active" as const },
  { code: "SHARDA-9PXM", customer: "Mohan Patil", validity: "14 days", left: "11 d 02 h", status: "active" as const },
  { code: "SHARDA-3QRA", customer: "Anita Rao", validity: "3 days", left: "expired", status: "expired" as const },
];

export default async function PortalPage() {
  // The portal is a retailer/admin-only feature; deny shoppers and distributors.
  await requireRole(["RETAILER", "ADMIN"]);
  const [variant, locale] = await Promise.all([getUiVariant(), getUiLocale()]);
  if (variant === "classic") return <ClassicPortal locale={locale} />;
  return (
    <>
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>vi · the annex</Eyebrow>
          <Mono>shardapaints.huevista.com</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Your white-label<br /><i>customer portal.</i></h1>
        <Lead style={{ marginTop: 24 }}>Issue temporary access codes for your customers. They visualise colours on your subdomain — without seeing shade codes. When they're ready, they "Send to retailer" and you receive the full project.</Lead>
      </header>
      <section className="r-stack-md" style={{ marginBottom: 56, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>i · what they see</Mono>
          <h2 className="display" style={{ fontSize: 56, marginBottom: 24 }}>Quiet. Branded. <i>Yours.</i></h2>
          <p style={{ font: "300 italic 19px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>The customer sees your shopfront, your logo, your subdomain — and a single instruction: <i>upload a photograph</i>. They never see shade codes; they pick by feel. You get the codes.</p>
        </div>
        <Placeholder tone="terracotta" grain corners tag="STOREFRONT" style={{ aspectRatio: "4 / 5" }} />
      </section>
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Active <i>codes.</i></h2>
        <LinkButton href="/portal" variant="ghost" size="sm">Issue a new code <span className="arr">→</span></LinkButton>
      </section>
      <section className="hv-portal-table" style={{ border: "1px solid var(--rule)" }}>
        <div className="hv-portal-row hv-portal-head" style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1fr", padding: "18px 24px", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
          {["Code", "Customer", "Validity", "Time left", "Status"].map((h) => (<Mono key={h}>{h}</Mono>))}
        </div>
        {CODES.map((c, i) => (
          <div key={c.code} className="hv-portal-row" style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1fr", padding: "22px 24px", borderBottom: i === CODES.length - 1 ? "none" : "1px solid var(--rule)", alignItems: "center" }}>
            <span data-label="Code" style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--accent)" }}>{c.code}</span>
            <span data-label="Customer" style={{ font: "300 italic 18px/1 var(--serif)" }}>{c.customer}</span>
            <Mono><span data-label="Validity">{c.validity}</span></Mono>
            <Mono><span data-label="Time left">{c.left}</span></Mono>
            <span data-label="Status" style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: c.status === "active" ? "var(--accent)" : "var(--fg-mute-deep)" }}>{c.status}</span>
          </div>
        ))}
      </section>
      <section style={{ marginTop: 56 }}>
        <h2 className="display" style={{ fontSize: 48, marginBottom: 8 }}>
          Customers &amp; <i>projects.</i>
        </h2>
        <p style={{ font: "300 italic 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Each customer gets one project with their access code. Grant another when they want a second
          room — or they can pay for one themselves from the visualiser.
        </p>
        <RetailerCustomers />
      </section>
    </>
  );
}
