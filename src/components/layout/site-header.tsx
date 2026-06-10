import { getUiTheme, hasSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Nav } from "./nav";

interface SiteHeaderProps {
  showCta?: boolean;
  showSignIn?: boolean;
}

export async function SiteHeader({ showCta, showSignIn }: SiteHeaderProps) {
  const [theme, authed] = await Promise.all([
    getUiTheme(),
    hasSession(),
  ]);
  return (
    <Nav
      showCta={showCta}
      showSignIn={showSignIn}
      authed={authed}
      themeToggle={<ThemeToggle theme={theme} />}
    />
  );
}
