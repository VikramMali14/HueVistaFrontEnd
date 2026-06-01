import { getUiTheme, getUiVariant, hasSession } from "@/lib/auth";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { VariantToggle } from "@/components/shared/variant-toggle";
import { Nav } from "./nav";

interface SiteHeaderProps {
  showCta?: boolean;
  showSignIn?: boolean;
}

export async function SiteHeader({ showCta, showSignIn }: SiteHeaderProps) {
  const [theme, variant, authed] = await Promise.all([
    getUiTheme(),
    getUiVariant(),
    hasSession(),
  ]);
  return (
    <Nav
      showCta={showCta}
      showSignIn={showSignIn}
      authed={authed}
      themeToggle={<ThemeToggle theme={theme} />}
      variantToggle={<VariantToggle variant={variant} />}
    />
  );
}
