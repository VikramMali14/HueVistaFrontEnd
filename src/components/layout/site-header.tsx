import { hasSession } from "@/lib/auth";
import { Nav } from "./nav";

interface SiteHeaderProps {
  showCta?: boolean;
  showSignIn?: boolean;
}

export async function SiteHeader({ showCta, showSignIn }: SiteHeaderProps) {
  const authed = await hasSession();
  return <Nav showCta={showCta} showSignIn={showSignIn} authed={authed} />;
}
