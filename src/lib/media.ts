import { config } from "./config";

/**
 * Make a backend-supplied image/mask URL loadable by the browser (<img>, WebGL).
 *
 * The backend returns either:
 *   - an absolute S3 *presigned* URL → publicly fetchable, load as-is (cross-origin).
 *   - a relative `/api/images/files/...` or `/api/projects/.../mask` path (the default
 *     local-storage path). Those endpoints require the access token, which lives in an
 *     HttpOnly cookie the browser can't attach to a raw <img> request. Routing them
 *     through the same-origin BFF (`/bff/...`) lets the proxy attach `Authorization`
 *     server-side, AND keeps the canvas same-origin (untainted) so `exportPng()` works.
 *
 * Both `api/images/...` and `api/projects/...` are already allow-listed by the BFF.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Absolute URL: if it points at our own API origin, route via BFF so auth is attached;
  // otherwise (e.g. an S3 presigned URL) load it directly.
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      const api = new URL(config.apiOrigin);
      if (u.origin === api.origin && u.pathname.startsWith("/api/")) {
        return `/bff${u.pathname}${u.search}`;
      }
    } catch {
      /* fall through and return as-is */
    }
    return url;
  }

  if (url.startsWith("/bff/")) return url;
  if (url.startsWith("/api/")) return `/bff${url}`;
  return url;
}

/** Where the same-origin media passthrough lives. */
export const MEDIA_PROXY_PATH = "/api/media";

/**
 * The same-origin address for a remote image.
 *
 * A presigned S3 URL is fetchable by anyone holding it but carries no
 * `Access-Control-Allow-Origin`, so a `crossOrigin="anonymous"` load — the kind
 * every canvas needs — is blocked unless the bucket has a CORS rule. Routing it
 * through our own origin removes the requirement. Used as a fallback by
 * `loadCrossOriginImage`, never as the first choice: a direct S3 load costs this
 * server nothing, which is the reason the backend presigns in the first place.
 *
 * The route re-validates the target; this only builds the address.
 */
export function mediaProxyUrl(url: string): string {
  return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}
