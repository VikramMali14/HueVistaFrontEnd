import { getCurrentUser, requireAccessToken } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";
import { SupportWidget } from "@/components/support/support-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  const user = await getCurrentUser();
  return (
    <>
      <AppNav user={user} />
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}>{children}</main>
      <SupportWidget />
    </>
  );
}
