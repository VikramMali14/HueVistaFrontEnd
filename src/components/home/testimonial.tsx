import { Mono } from "@/components/ui/eyebrow";

export function Testimonial() {
  return (
    <section style={{ textAlign: "center" }}>
      <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 800, margin: "0 auto" }}>
        <Mono>The problem we solve</Mono>

        {/* No invented numbers. This used to open "Two of every five walk-ins end
            with 'let me think'" — a statistic with no study behind it, printed as
            fact. The difficulty it describes is real and needs no figure. */}
        <blockquote style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(26px, 3.5vw, 48px)", lineHeight: 1.18, letterSpacing: "-.035em", color: "var(--fg)", maxWidth: "24ch", margin: 0 }}>
          A shade card is small. A wall is not. Most customers leave saying <i>“let me think.”</i> Show them the room first.
        </blockquote>
      </div>
    </section>
  );
}
