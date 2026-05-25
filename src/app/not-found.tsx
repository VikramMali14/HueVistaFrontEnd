import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main style={{ textAlign: "center", padding: "160px 0" }}>
        <Eyebrow>404 · A quiet corner</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(72px, 11vw, 200px)", marginTop: 24 }}>We have <i>misplaced it.</i></h1>
        <Lead style={{ margin: "32px auto 56px" }}>The page you were looking for has wandered off. Try the homepage, or start a fresh visit to the atelier.</Lead>
        <div style={{ display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <LinkButton href="/" variant="brass" size="lg">Return home <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" variant="ghost" size="lg">Read the method <span className="arr">→</span></LinkButton>
        </div>
      </main>
      <Footer />
    </>
  );
}
