import { hasSession } from "@/lib/auth";
import { libraryHasRooms } from "@/lib/free-projects-server";
import { Nav } from "./nav";

interface SiteHeaderProps {
  showCta?: boolean;
  showSignIn?: boolean;
}

export async function SiteHeader({ showCta, showSignIn }: SiteHeaderProps) {
  // Together: neither answer depends on the other, and this runs on every
  // marketing page. `libraryHasRooms` reads a tagged, revalidated fetch, so the
  // cost here is a cache hit rather than a call per render.
  const [authed, galleryLive] = await Promise.all([hasSession(), libraryHasRooms()]);
  return <Nav showCta={showCta} showSignIn={showSignIn} authed={authed} galleryLive={galleryLive} />;
}
