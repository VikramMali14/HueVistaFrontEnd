import { Mono } from "@/components/ui/eyebrow";

export function Testimonial() {
  return (
    <section style={{ textAlign: "center" }}>
      <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 800, margin: "0 auto" }}>
        <Mono>The problem we solve</Mono>

        <blockquote style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(26px, 3.5vw, 48px)", lineHeight: 1.18, letterSpacing: "-.035em", color: "var(--fg)", maxWidth: "24ch", margin: 0 }}>
          Two of every five walk-ins end with <i>“let me think.”</i> A preview at the counter turns thinking into an order — the same afternoon.
        </blockquote>
      </div>
    </section>
  );
}
