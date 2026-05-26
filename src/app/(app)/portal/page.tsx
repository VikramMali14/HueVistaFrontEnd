import type { Metadata } from "next";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { Placeholder } from "@/components/ui/placeholder";

export const metadata: Metadata = {
  title: "The Annex",
  description: "Customer portal — your white-label storefront.",
};

const CODES = [
  { code: "SHARDA-7K2N", customer: "Pooja Deshmukh", validity: "7 days", left: "5 d 14 h", status: "active" as const },
  { code: "SHARDA-9PXM", customer: "Mohan Patil", validity: "14 days", left: "11 d 02 h", status: "active" as const },
  { code: "SHARDA-3QRA", customer: "Anita Rao", validity: "3 days", left: "expired", status: "expired" as const },
];

export default function PortalPage() {
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
      <section style={{ marginBottom: 56, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>i · what they see</Mono>
          <h2 className="display" style={{ fontSize: 56, marginBottom: 24 }}>Quiet. Branded. <i>Yours.</i></h2>
          <p style={{ font: "300 italic 19px/1.6 var(--serif)", color: "var(--ivory-soft)", maxWidth: "44ch" }}>The customer sees your shopfront, your logo, your subdomain — and a single instruction: <i>upload a photograph</i>. They never see shade codes; they pick by feel. You get the codes.</p>
        </div>
        <Placeholder tone="terracotta" grain corners tag="STOREFRONT" style={{ aspectRatio: "4 / 5" }} />
      </section>
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Active <i>codes.</i></h2>
        <LinkButton href="/portal" variant="ghost" size="sm">Issue a new code <span className="arr">→</span></LinkButton>
      </section>
      <section style={{ border: "1px solid var(--rule)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1fr", padding: "18px 24px", borderBottom: "1px solid var(--rule)", background: "var(--charcoal-soft)" }}>
          {["Code", "Customer", "Validity", "Time left", "Status"].map((h) => (<Mono key={h}>{h}</Mono>))}
        </div>
        {CODES.map((c, i) => (
          <div key={c.code} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1fr", padding: "22px 24px", borderBottom: i === CODES.length - 1 ? "none" : "1px solid var(--rule)", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", letterSpacing: ".18em", color: "var(--brass)" }}>{c.code}</span>
            <span style={{ font: "300 italic 18px/1 var(--serif)" }}>{c.customer}</span>
            <Mono>{c.validity}</Mono>
            <Mono>{c.left}</Mono>
            <span style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: c.status === "active" ? "var(--brass)" : "var(--mute-deep)" }}>{c.status}</span>
          </div>
        ))}
      </section>
    </>
  );
}
