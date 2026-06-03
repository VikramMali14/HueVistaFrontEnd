"use client";

import { t } from "@/lib/i18n";
import { AccessCodes } from "@/components/app/access-codes";
import { RetailerCustomers } from "@/components/app/retailer-customers";
import { PortalSubdomain } from "@/components/app/portal-subdomain";
import type { UiLocale } from "@/lib/types";

interface ClassicPortalProps {
  locale: UiLocale;
}

/**
 * Classic-variant portal. Uses the SAME live components as the premium portal
 * (real access codes with a working "issue" flow + real customers) instead of
 * the old hardcoded sample table.
 */
export function ClassicPortal({ locale }: ClassicPortalProps) {
  return (
    <>
      <div className="ctopbar">
        <h1>{t(locale, "portal.title")}</h1>
        <div className="grow" />
        <PortalSubdomain />
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
        <section>
          <h3 style={{ margin: "0 0 6px", font: "600 16px/1.3 var(--sans)", color: "var(--fg)" }}>Active codes</h3>
          <p style={{ margin: "0 0 16px", color: "var(--fg-mute)", fontSize: 14 }}>
            Issue a code and share it with a customer. They redeem it at <code>/redeem</code> to start visualising.
          </p>
          <AccessCodes />
        </section>

        <section>
          <h3 style={{ margin: "0 0 6px", font: "600 16px/1.3 var(--sans)", color: "var(--fg)" }}>Customers &amp; projects</h3>
          <RetailerCustomers />
        </section>
      </div>
    </>
  );
}
