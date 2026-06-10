import { getCurrentUser, getUiTheme, requireAccessToken } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SupportWidget } from "@/components/support/support-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  const [user, theme] = await Promise.all([getCurrentUser(), getUiTheme()]);
  return (
    <>
      <AppNav user={user} themeToggle={<ThemeToggle theme={theme} />} />
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}>{children}</main>
      <SupportWidget />
    </>
  );
}
