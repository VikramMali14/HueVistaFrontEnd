/**
 * Real-client-IP resolution shared by every server-side caller that forwards
 * an IP to the backend's per-IP rate limiters.
 *
 * X-Forwarded-For is client-forgeable: whatever the CLIENT sends arrives as
 * the LEFTMOST entries, and each proxy in the chain APPENDS the socket
 * address it actually saw. Trust therefore counts from the RIGHT — taking
 * the first entry (as this code once did) lets an attacker rotate a fake IP
 * per request and sail past every per-IP limit.
 *
 * TRUSTED_PROXY_HOPS = how many proxies sit between the internet and this
 * Next server AND append to X-Forwarded-For (default 1 — the single
 * ingress/reverse-proxy of the Docker deployment). With N trusted hops the
 * real client is the Nth entry from the end; anything left of it is
 * client-supplied noise.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? "1") || 1);

export function clientIpFromHeaders(h: Headers): string | undefined {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[Math.max(0, parts.length - TRUSTED_PROXY_HOPS)];
    }
  }
  // Set by nginx-style proxies; forgeable only when no proxy overwrites it,
  // in which case X-Forwarded-For above is absent too (direct exposure —
  // there is no header-based truth in that topology).
  return h.get("x-real-ip")?.trim() || undefined;
}
