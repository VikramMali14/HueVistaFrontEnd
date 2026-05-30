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
