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
  // Anonymous guest token (unlocked with a shop access code, no account). Scopes the
  // /api/guest/* endpoints. Lives only as long as the code is valid.
  guestCookie: "hv_guest",
  // Paint companies the shop unlocked for the current guest (JSON array of brand
  // names). LABELLING only — the restriction itself is enforced server-side from the
  // access code (see lib/catalogue.ts). Set alongside the guest token at unlock time.
  guestBrandsCookie: "hv_guest_brands",
  refreshTtlSeconds: 60 * 60 * 24 * 7,
} as const;

/**
 * Where this site actually lives.
 *
 * One place, because the canonical origin was hardcoded as `https://huevista.com` in
 * the root layout's metadataBase and the unlock instruction spelled out
 * `huevista.com/unlock` in four more files — including the "Paid. You're in." screen a
 * walk-in customer sees the moment their kiosk payment clears. That domain has no DNS
 * record at all; the app is served from app.huevista.org. So every canonical URL, every
 * WhatsApp link preview and every post-payment instruction pointed a paying customer at
 * a host that does not resolve.
 *
 * Read from the environment so a preview deployment points its canonicals at itself
 * rather than at production. Anything user-facing that names the site should read this
 * rather than spell out a domain.
 */
const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://app.huevista.org"
).replace(/\/$/, "");

export const site = {
  /** Canonical origin, no trailing slash. metadataBase, robots and sitemap read this. */
  origin: SITE_ORIGIN,
  /** Host alone, for prose that should not carry a scheme. */
  host: SITE_ORIGIN.replace(/^https?:\/\//, ""),
  /** Where a customer unlocks their projects with a shop access code. */
  unlockUrl: `${SITE_ORIGIN}/unlock`,
  /** What we tell a customer to type — a bare host reads better than a full URL. */
  unlockLabel: `${SITE_ORIGIN.replace(/^https?:\/\//, "")}/unlock`,
  /** Root domain the reserved white-label subdomains hang off ({shop}.huevista.org). */
  whiteLabelDomain: "huevista.org",
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
  /** Display form, for anything a human reads. */
  phone: "+91 63784 82381",
  /** Dialable form, for tel: links. */
  phoneE164: "+916378482381",
  /** Hours the phone is actually answered — don't publish a number without them. */
  phoneHours: "Monday to Saturday, 10:00–19:00 IST",
  /**
   * The registered business. Payment processors and the Contact Us page both need the
   * legal entity, not just the brand, and it must match the KYC filing exactly.
   */
  legalName: "Vikram Mali",
  entityType: "Sole proprietorship trading as HueVista",
  addressLines: [
    "HueVista",
    "Proprietor: Vikram Mali",
    "Mount Road, Manpur, Abu Road",
    "Sirohi, Rajasthan 307026",
    "India",
  ],
  /** One-line form, for prose that can't take a block. */
  addressInline:
    "Mount Road, Manpur, Abu Road, Sirohi, Rajasthan 307026, India",
} as const;
