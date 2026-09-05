import { Lead } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { NotFoundBody } from "@/components/layout/not-found-body";

/**
 * The 404 for signed-in screens.
 *
 * Its existence is the fix. Without one, a `notFound()` raised in here — the studio
 * does it for a ?project= that is not shaped like an id — fell through to the ROOT
 * 404, which brings the marketing header and footer with it. Next still wraps that in
 * this group's layout, so the result was the app nav and the marketing nav on one
 * page, the studio's own toolbar above both, and a marketing footer under a screen
 * nobody had signed out of.
 *
 * So: the same wall, the same words, no second set of chrome — the layout above has
 * already drawn the nav. The ways out are the signed-in ones too, because somebody
 * who lands here has a session and a dashboard, and "go to the homepage" is the one
 * suggestion that ignores both.
 */
export default function AppNotFound() {
  return (
    <>
      <title>404 — Page not found · HueVista</title>
      <meta name="robots" content="noindex" />
      <NotFoundBody>
        <Lead style={{ margin: "32px auto 56px" }}>
          This page doesn&rsquo;t exist, or the room behind it has moved. Your saved work is
          all on your dashboard.
        </Lead>
        <div style={{ display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <LinkButton href="/dashboard" variant="brass" size="lg">Back to my dashboard <span className="arr">→</span></LinkButton>
          <LinkButton href="/studio" variant="ghost" size="lg">Start a new room <span className="arr">→</span></LinkButton>
        </div>
      </NotFoundBody>
    </>
  );
}
