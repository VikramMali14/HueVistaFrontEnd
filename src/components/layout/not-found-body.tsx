import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { SwatchCube } from "@/components/ui/swatch-cube";

/**
 * The 404 itself — the cube, the words and the two ways out, with NO page chrome.
 *
 * Chrome is the caller's job because the two callers already have different chrome,
 * and getting that wrong is visible: a `notFound()` raised inside the (app) group
 * renders inside the app layout, which has already drawn the signed-in nav. The root
 * 404 brought the marketing header and footer with it, so a mistyped project id
 * produced one page carrying the studio's own toolbar, the app nav, the marketing
 * nav and the marketing footer — four navigations from two different products,
 * stacked. Splitting the body out lets each boundary supply its own frame once.
 */
export function NotFoundBody({ children }: { children?: React.ReactNode }) {
  return (
    <main id="main" style={{ textAlign: "center", padding: "120px 0 160px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 56 }}>
        <SwatchCube size={120} />
      </div>
      <Eyebrow>404 — Page not found</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(64px, 10vw, 160px)", marginTop: 24 }}>
        An unpainted <i>wall.</i>
      </h1>
      {children ?? (
        <>
          <Lead style={{ margin: "32px auto 56px" }}>
            This page doesn&rsquo;t exist or has moved. Head back to the homepage, or see how
            HueVista works.
          </Lead>
          <div style={{ display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <LinkButton href="/" variant="brass" size="lg">Go to homepage <span className="arr">→</span></LinkButton>
            <LinkButton href="/method" variant="ghost" size="lg">How it works <span className="arr">→</span></LinkButton>
          </div>
        </>
      )}
    </main>
  );
}
