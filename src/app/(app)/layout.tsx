import { getCurrentUser, getUiTheme, getUiVariant, requireAccessToken } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";
import { Sidebar } from "@/components/classic/sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  const [user, theme, variant] = await Promise.all([getCurrentUser(), getUiTheme(), getUiVariant()]);
  const toggle = <ThemeToggle theme={theme} />;

  if (variant === "classic") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
        <Sidebar user={user} themeToggle={toggle} />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    );
  }

  return (
    <>
      <AppNav user={user} themeToggle={toggle} />
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}>{children}</main>
    </>
  );
}
