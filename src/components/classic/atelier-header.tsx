import { t } from "@/lib/i18n";
import type { UiLocale } from "@/lib/types";

interface ClassicAtelierHeaderProps {
  locale: UiLocale;
}

export function ClassicAtelierHeader({ locale }: ClassicAtelierHeaderProps) {
  return (
    <div className="ctopbar">
      <h1>{t(locale, "atelier.title")}</h1>
    </div>
  );
}
