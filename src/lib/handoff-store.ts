/**
 * In-memory relay for the "upload from your phone" hand-off.
 *
 * The desktop creates a session and shows a QR code; the phone opens /m/<id>,
 * uploads a photo, and the desktop polls until the image arrives. State lives in
 * this Node process (stashed on globalThis so it survives dev HMR reloads). Good
 * for local dev and a single backend instance — a multi-instance/serverless
 * deployment would need a shared store (Redis/S3) instead.
 */

import { randomUUID } from "crypto";

export const HANDOFF_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SESSIONS = 500; // hard cap so a flood of POSTs can't exhaust memory

interface HandoffEntry {
  bytes?: ArrayBuffer;
  contentType?: string;
  createdAt: number;
  ready: boolean;
}

const g = globalThis as unknown as { __hvHandoff?: Map<string, HandoffEntry> };
const store: Map<string, HandoffEntry> = g.__hvHandoff ?? (g.__hvHandoff = new Map());

function gc() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > HANDOFF_TTL_MS) store.delete(k);
  }
}

export function createSession(): string {
  gc();
  // Bound memory: if still at the cap after gc, evict the oldest sessions.
  if (store.size >= MAX_SESSIONS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i <= store.size - MAX_SESSIONS; i++) {
      const entry = oldest[i];
      if (entry) store.delete(entry[0]);
    }
  }
  const id = randomUUID();
  store.set(id, { createdAt: Date.now(), ready: false });
  return id;
}

export function sessionExists(id: string): boolean {
  gc();
  return store.has(id);
}

export function putImage(id: string, bytes: ArrayBuffer, contentType: string): boolean {
  gc();
  const e = store.get(id);
  if (!e) return false;
  e.bytes = bytes;
  e.contentType = contentType;
  e.ready = true;
  e.createdAt = Date.now(); // refresh TTL on upload
  return true;
}

export function isReady(id: string): "ready" | "pending" | "missing" {
  gc();
  const e = store.get(id);
  if (!e) return "missing";
  return e.ready ? "ready" : "pending";
}

/** Retrieve the uploaded image once, then drop it (one-shot delivery). */
export function takeImage(id: string): { bytes: ArrayBuffer; contentType: string } | null {
  gc();
  const e = store.get(id);
  if (!e || !e.ready || !e.bytes) return null;
  store.delete(id);
  return { bytes: e.bytes, contentType: e.contentType ?? "image/jpeg" };
}
