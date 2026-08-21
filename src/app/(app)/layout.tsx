import { customerHasShop, getCurrentUser, getMyAccess, requireAccessToken } from "@/lib/auth";
import { libraryHasRooms } from "@/lib/free-projects-server";
import { AppNav } from "@/components/app/app-nav";
import { SupportWidget } from "@/components/support/support-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  // Loaded together: the nav needs the role AND the shop's page grant to decide
  // which tabs exist, a distributor may have switched some of them off, and the
  // Library tab only exists once a room is actually on the shelf.
  const [user, access, libraryLive, hasShop] = await Promise.all([
    getCurrentUser(),
    getMyAccess(),
    libraryHasRooms(),
    // Whether a shop stands behind this customer. Decides the "My products" tab,
    // which can only lead to a 404 for an account that signed up on its own.
    customerHasShop(),
  ]);
  return (
    <>
      <AppNav user={user} access={access} libraryLive={libraryLive} hasShop={hasShop} />
      {/* hv-app-main is read by globals.css, which uses it to stop the marketing site's
          band rules applying to app screens — see the note beside them. */}
      <main
        id="main"
        className="hv-app-main"
        style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}
      >
        {children}
      </main>
      <SupportWidget />
    </>
  );
}
