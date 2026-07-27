import { getCurrentUser, getMyAccess, requireAccessToken } from "@/lib/auth";
import { AppNav } from "@/components/app/app-nav";
import { SupportWidget } from "@/components/support/support-widget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAccessToken();
  // Loaded together: the nav needs the role AND the shop's page grant to decide
  // which tabs exist, and a distributor may have switched some of them off.
  const [user, access] = await Promise.all([getCurrentUser(), getMyAccess()]);
  return (
    <>
      <AppNav user={user} access={access} />
      <main style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "40px var(--gutter) 96px" }}>{children}</main>
      <SupportWidget />
    </>
  );
}
