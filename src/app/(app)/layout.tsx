import { getCurrentUser, getUiLocale, getUiTheme, getUiVariant, requireAccessToken } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";
import { Sidebar } from "@/components/classic/sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { VariantToggle } from "@/components/shared/variant-toggle";
import { LocaleToggle } from "@/components/shared/locale-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  const [user, theme, variant, locale] = await Promise.all([
    getCurrentUser(),
    getUiTheme(),
    getUiVariant(),
    getUiLocale(),
  ]);
  const themeToggle = <ThemeToggle theme={theme} />;
  const variantToggle = <VariantToggle variant={variant} />;
  const localeToggle = <LocaleToggle locale={locale} />;

  if (variant === "classic") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
        <Sidebar
          user={user}
          locale={locale}
          themeToggle={themeToggle}
          variantToggle={variantToggle}
          localeToggle={localeToggle}
        />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    );
  }

  return (
    <>
      <AppNav user={user} themeToggle={themeToggle} variantToggle={variantToggle} />
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}>{children}</main>
    </>
  );
}
