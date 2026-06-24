/**
 * Offline DEMO MODE flag.
 *
 * When `NEXT_PUBLIC_DEMO_MODE=1`, the frontend runs with NO backend: the two
 * backend boundaries (server-action `serverFetch` and the `/bff/*` proxy) are
 * intercepted and answered with canned demo fixtures (see ./server, ./bff).
 *
 * It is a NEXT_PUBLIC_ var on purpose — it must be readable from the Edge
 * middleware, Server Components/Actions, AND the browser (the sign-in page shows
 * the demo credentials). The value is not a secret; it only toggles demo data.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export function isDemoMode(): boolean {
  return DEMO_MODE;
}
