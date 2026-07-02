/**
 * Custom Next.js incremental cache handler (wired via `cacheHandler` in
 * next.config.ts).
 *
 * The default handler refuses to store fetch responses over 2MB, so the
 * full shade catalogue from GET /api/shades never entered the data cache and
 * every ISR revalidation re-downloaded the whole payload ("Failed to set
 * Next.js data cache … items over 2MB can not be cached"). Next.js skips that
 * size check whenever a custom handler is configured, so this Map-based store
 * lifts the limit while keeping revalidate semantics (staleness is judged by
 * Next.js from `lastModified`).
 *
 * In-memory only: entries don't survive a restart (the app just re-fetches),
 * which is fine for the single-process `next start` the Docker image runs.
 */

// Module-scoped so every handler instance Next.js constructs shares one store.
const store = new Map();

// Entries untouched for this long are dropped on the next write — long enough
// to keep stale-while-revalidate serving for hourly-revalidated data, short
// enough that abandoned keys don't accumulate.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

module.exports = class CacheHandler {
  constructor(options) {
    this.options = options;
  }

  async get(key) {
    return store.get(key) ?? null;
  }

  async set(key, data, ctx) {
    const now = Date.now();
    for (const [existingKey, entry] of store) {
      if (now - entry.lastModified > MAX_AGE_MS) store.delete(existingKey);
    }
    store.set(key, { value: data, lastModified: now, tags: ctx.tags ?? [] });
  }

  async revalidateTag(tags) {
    const wanted = [tags].flat();
    for (const [key, entry] of store) {
      if (entry.tags.some((tag) => wanted.includes(tag))) store.delete(key);
    }
  }

  // Per-request cache hook; nothing request-scoped to reset in a shared store.
  resetRequestCache() {}
};
