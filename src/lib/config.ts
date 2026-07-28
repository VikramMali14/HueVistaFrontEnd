export const config = {
  apiOrigin:
    process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ??
    "http://localhost:8080",
  internalApiOrigin:
    process.env.API_INTERNAL_ORIGIN?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ??
    "http://localhost:8080",
  sessionCookie: "hv_refresh",
  accessCookie: "hv_access",
  // Anonymous guest token (redeemed a shop access code, no account). Scopes the
  // /api/guest/* endpoints. Lives only as long as the code is valid.
  guestCookie: "hv_guest",
  // Paint companies the shop unlocked for the current guest (JSON array of brand
  // names). LABELLING only — the restriction itself is enforced server-side from the
  // access code (see lib/catalogue.ts). Set alongside the guest token at redeem time.
  guestBrandsCookie: "hv_guest_brands",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
} as const;

/**
 * The addresses we ask people to write to.
 *
 * One place, because these were literals scattered across the footer, all three legal
 * pages and the pricing page — every one of them the same `hello@` on a domain the
 * backend never sends from, so a reply-to landed nowhere near the senders. Route by
 * what the message is ABOUT: a billing question should not queue behind general
 * enquiries, and a privacy request should reach someone who can action it.
 *
 * These are inboxes people write TO. The addresses the product sends FROM live in the
 * backend's MAIL_FROM / MAIL_BILLING_FROM — see the API's .env.example.
 */
export const contact = {
  /** General enquiries, partnerships, "I'd like a shop account". */
  general: "team@huevista.org",
  /** Product help — the in-app support widget is the faster path. */
  support: "support@huevista.org",
  /** Cancellations, refunds, invoices, anything about money. */
  billing: "payments@huevista.org",
} as const;
