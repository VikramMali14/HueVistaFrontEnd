import Link from "next/link";
import { t } from "@/lib/i18n";
import { AccountVerification } from "@/components/app/account-verification";
import { ClassicDashboardLive } from "./classic-dashboard-live";
import type { AuthUser, UiLocale } from "@/lib/types";

interface ClassicDashboardProps {
  user: AuthUser | null;
  locale: UiLocale;
}

export function ClassicDashboard({ user, locale }: ClassicDashboardProps) {
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "dashboard.title")}</h1>
        <div className="grow" />
        <Link href="/atelier" className="btn btn-sm">
          + {t(locale, "dashboard.newProject")}
        </Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <header style={{ marginBottom: 20 }}>
          <h2 style={{ font: "600 20px/1.3 var(--sans)", margin: 0, color: "var(--fg)" }}>
            {firstName
              ? t(locale, "dashboard.greeting", { name: firstName })
              : t(locale, "dashboard.greetingFallback")}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--fg-mute)", fontSize: 14 }}>
            Pick up a saved project, or start a new one.
          </p>
        </header>

        <AccountVerification user={user} />
        <ClassicDashboardLive />
      </div>
    </>
  );
}
