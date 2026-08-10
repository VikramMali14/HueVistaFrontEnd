/**
 * Where the backend lives when nothing says otherwise.
 *
 * `http://localhost:8080` is the right answer while developing and the wrong one in
 * production, and it used to be the answer in both. That default reached production
 * through the Content-Security-Policy, which `next.config.ts` builds from this same
 * variable at SERVER START — while `NEXT_PUBLIC_*` is inlined into the app at BUILD
 * time. Set the variable in the build but not the runtime container and the two
 * disagree: the pages correctly requested images from `https://api.huevista.org`, and
 * the header they were served with only permitted `http://localhost:8080`, so the
 * browser blocked every photograph on the marketing site.
 *
 * Defaulting per environment removes the trap rather than papering over it — a
 * production server with no API origin configured now names a host that at least
 * exists. The Dockerfile also carries the build arg through to a runtime ENV, so an
 * explicitly configured origin reaches both halves. Either fix alone leaves the other
 * hole open.
 */
const DEFAULT_API_ORIGIN =
  process.env.NODE_ENV === "production"
    ? "https://api.huevista.org"
    : "http://localhost:8080";

/**
 * An origin from the environment, or undefined when it is absent OR blank.
 *
 * Blank matters as much as absent: `ENV FOO=${FOO}` in a Dockerfile with no `--build-arg`
 * sets an EMPTY STRING, and `??` treats that as a perfectly good value. Every URL would
 * then be built as `/api/...` against no host at all.
 */
function originFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/$/, "");
  return trimmed ? trimmed : undefined;
}

export const config = {
  apiOrigin: originFrom(process.env.NEXT_PUBLIC_API_ORIGIN) ?? DEFAULT_API_ORIGIN,
  internalApiOrigin:
    originFrom(process.env.API_INTERNAL_ORIGIN) ??
    originFrom(process.env.NEXT_PUBLIC_API_ORIGIN) ??
    DEFAULT_API_ORIGIN,
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
 * Where this site actually lives.
 *
 * One place, because the canonical origin was hardcoded as `https://huevista.com` in
 * the root layout's metadataBase and the redeem instruction spelled out
 * `huevista.com/redeem` in four more files — including the "Paid. You're in." screen a
 * walk-in customer sees the moment their kiosk payment clears. That domain has no DNS
 * record at all; the app is served from app.huevista.org. So every canonical URL, every
 * WhatsApp link preview and every post-payment instruction pointed a paying customer at
 * a host that does not resolve.
 *
 * Read from the environment so a preview deployment points its canonicals at itself
 * rather than at production. Anything user-facing that names the site should read this
 * rather than spell out a domain.
 */
const SITE_ORIGIN =
  originFrom(process.env.NEXT_PUBLIC_SITE_ORIGIN) ?? "https://app.huevista.org";

export const site = {
  /** Canonical origin, no trailing slash. metadataBase, robots and sitemap read this. */
  origin: SITE_ORIGIN,
  /** Host alone, for prose that should not carry a scheme. */
  host: SITE_ORIGIN.replace(/^https?:\/\//, ""),
  /** Where a customer redeems a shop access code. */
  redeemUrl: `${SITE_ORIGIN}/redeem`,
  /** What we tell a customer to type — a bare host reads better than a full URL. */
  redeemLabel: `${SITE_ORIGIN.replace(/^https?:\/\//, "")}/redeem`,
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
