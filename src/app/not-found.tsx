import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { NotFoundBody } from "@/components/layout/not-found-body";

export default function NotFound() {
  return (
    <>
      {/* Next.js does not read a `metadata` export from not-found.tsx, so every 404
          inherited the root layout's title — the marketing tagline — and a tab, a
          bookmark or a history entry for a missing page was indistinguishable from
          the home page. A <title> rendered here is hoisted into <head>. */}
      <title>404 — Page not found · HueVista</title>
      <meta name="robots" content="noindex" />
      <SiteHeader />
      <NotFoundBody />
      <Footer />
    </>
  );
}
