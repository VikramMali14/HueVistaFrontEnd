"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";

/** Shows the retailer's real white-label subdomain ({org-slug}.huevista.com). */
export function PortalSubdomain() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listMyOrgs()
      .then((orgs) => {
        if (!cancelled) setSlug(orgs.find((o) => o.slug)?.slug ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <Mono>{slug ? `${slug}.huevista.com` : "your-shop.huevista.com"}</Mono>;
}
