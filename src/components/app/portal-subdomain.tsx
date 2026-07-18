"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";

/**
 * Shows the retailer's reserved white-label subdomain ({org-slug}.huevista.com).
 * Deliberately NOT a live link: subdomain hosting is still rolling out, so a
 * link would 404 from the retailer's own portal header. Becomes a link again
 * once host-based routing ships.
 *
 * The slug normally arrives from the page's single org fetch; when that fetch
 * failed (`slug === undefined`) this falls back to fetching the orgs itself.
 * Renders nothing until resolved — never a placeholder domain that looks real.
 */
export function PortalSubdomain({ slug: slugProp }: { slug?: string | null }) {
  const [slug, setSlug] = useState<string | null>(slugProp ?? null);
  const [resolved, setResolved] = useState(slugProp !== undefined);

  useEffect(() => {
    if (slugProp !== undefined) return;
    let cancelled = false;
    api
      .listMyOrgs()
      .then((orgs) => {
        if (cancelled) return;
        setSlug(orgs.find((o) => o.slug)?.slug ?? null);
        setResolved(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slugProp]);

  if (!resolved) return null;
  if (!slug) return <Mono>Set up your shop below</Mono>;
  return (
    <span
      title="White-label subdomains are rolling out — contact us to switch yours on early."
      style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}
    >
      <Mono brass>{slug}.huevista.com</Mono>
      <Mono>· coming soon</Mono>
    </span>
  );
}
