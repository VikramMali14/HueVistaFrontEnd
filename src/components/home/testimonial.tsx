import { Mono } from "@/components/ui/eyebrow";

export function Testimonial() {
  return (
    <section style={{ textAlign: "center" }}>
      <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, maxWidth: 880, margin: "0 auto" }}>
        <Mono>The problem we solve</Mono>

        <blockquote style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(30px, 4vw, 56px)", lineHeight: 1.15, letterSpacing: "-.03em", color: "var(--fg)", maxWidth: "22ch", margin: 0 }}>
          Two of every five walk-ins end with <i>“let me think.”</i> A preview at the counter turns thinking into an order — the same afternoon.
        </blockquote>
      </div>
    </section>
  );
}
