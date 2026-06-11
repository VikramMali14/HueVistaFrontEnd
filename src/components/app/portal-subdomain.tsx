"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";

/**
 * Shows the retailer's real white-label subdomain ({org-slug}.huevista.com) as
 * a link to the live storefront. Renders nothing until the fetch resolves —
 * never a placeholder domain that looks like an assigned one.
 */
export function PortalSubdomain() {
  const [slug, setSlug] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!resolved) return null;
  if (!slug) return <Mono>Set up your shop below</Mono>;
  return (
    <a href={`https://${slug}.huevista.com`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <Mono brass>{slug}.huevista.com ↗</Mono>
    </a>
  );
}
