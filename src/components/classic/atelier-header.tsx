import Link from "next/link";
import { t } from "@/lib/i18n";
import type { UiLocale } from "@/lib/types";

interface ClassicAtelierHeaderProps {
  locale: UiLocale;
}

export function ClassicAtelierHeader({ locale }: ClassicAtelierHeaderProps) {
  return (
    <div className="ctopbar">
      <h1>{t(locale, "atelier.title")}</h1>
      <div className="grow" />
      <Link
        href="/dashboard"
        className="btn btn-sm btn-ghost"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {t(locale, "atelier.toolbar.open")}
      </Link>
    </div>
  );
}
