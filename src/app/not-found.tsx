import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { SwatchCube } from "@/components/ui/swatch-cube";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main style={{ textAlign: "center", padding: "120px 0 160px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
          <SwatchCube size={120} />
        </div>
        <Eyebrow>404 — Page not found</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(64px, 10vw, 160px)", marginTop: 24 }}>Page not found.</h1>
        <Lead style={{ margin: "32px auto 56px" }}>This page doesn’t exist or has moved. Head back to the homepage, or see how HueVista works.</Lead>
        <div style={{ display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <LinkButton href="/" variant="brass" size="lg">Go to homepage <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" variant="ghost" size="lg">How it works <span className="arr">→</span></LinkButton>
        </div>
      </main>
      <Footer />
    </>
  );
}
