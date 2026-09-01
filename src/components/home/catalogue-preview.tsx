import { LinkButton } from "@/components/ui/button";
import { Lead } from "@/components/ui/eyebrow";

const SWATCHES = [
  "#a47148", "#d6a78a", "#8a5a3a", "#1a1612", "#f3eee4",
  "#c9a17a", "#5b6c5b", "#7a3c2a", "var(--ivory)", "#3e4a52",
  "#8c98a8", "#a9b8a4", "#d4c7a5", "#6e7d6c", "#bda58a",
  "#2f3b3a", "#e2c7a9", "#9b6e4a", "#465259", "#cbb89e",
  "#79584a", "#a78b6c", "#dac1a3", "#3b4845",
];

export function CataloguePreview() {
  return (
    <section className="hv-cat" aria-labelledby="catalogue-title">
      <div className="hv-cat-inner reveal r-stack-md">
        <div className="hv-cat-copy">
          {/* One long line at a set measure, where the four headings above it are
              short. A heading is not obliged to be two lines with an italic
              clause on the second — that was the shape of every one of them, and
              a page whose headings all scan identically has, in effect, one
              heading repeated at eight different sizes. */}
          <h2 id="catalogue-title" className="display hv-cat-title">
            Every shade, with the code it was sold under.
          </h2>
          <Lead>
            Filter by colour family, finish, or depth. Search by shade code or name.
            Find what looks closest across brands by colour science — not by
            approximation.
          </Lead>
          <div className="hv-cat-cta">
            <LinkButton href="/catalogue">Browse the catalogue <span className="arr">→</span></LinkButton>
            <LinkButton href="/gallery" variant="ghost">See it on real walls</LinkButton>
          </div>
        </div>
        <div className="hv-cat-preview" aria-hidden>
          {/* Decoration, so no labels. Each tile used to carry a tooltip reading
              "AP-2104", "AP-2105" … — sequential invented codes in a real
              company's format, none of which exist in anyone's range. */}
          {SWATCHES.map((hex, i) => (
            <div key={i} style={{ background: hex, "--i": i } as React.CSSProperties} />
          ))}
        </div>
      </div>
    </section>
  );
}
