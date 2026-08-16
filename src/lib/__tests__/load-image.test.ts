// @vitest-environment jsdom
/**
 * The CORS fallback every canvas in the app depends on.
 *
 * The bug: S3 answers a presigned GET without `Access-Control-Allow-Origin` unless
 * the bucket carries a CORS rule, so a `crossOrigin="anonymous"` load — the only
 * kind a canvas can read back — is blocked and the room renders blank. These cases
 * hold the retry through `/api/media` to three promises: it happens, it happens only
 * where it can help, and it happens once per host rather than once per image.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { loadCrossOriginImage, __resetCorsMemo } from "../load-image";

const S3 = "https://image-storage-original.s3.ap-south-1.amazonaws.com/free-projects/house-1/a.png?X-Amz-Signature=abc";

/** Every src a fake image was pointed at, in order. */
let attempts: string[] = [];
/** Decides which srcs "load". Set per test. */
let loads: (src: string) => boolean;

class FakeImage {
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 10;
  naturalHeight = 10;
  #src = "";

  set src(value: string) {
    this.#src = value;
    attempts.push(value);
    // Real image loads are async; settling synchronously would let a handler
    // assigned after `src` never run.
    queueMicrotask(() => (loads(value) ? this.onload?.() : this.onerror?.()));
  }
  get src() {
    return this.#src;
  }
}

const realImage = globalThis.Image;
globalThis.Image = FakeImage as unknown as typeof Image;
afterAll(() => {
  globalThis.Image = realImage;
});

beforeEach(() => {
  attempts = [];
  loads = () => true;
  __resetCorsMemo();
});

describe("loadCrossOriginImage", () => {
  it("loads straight from S3 when the bucket allows it", async () => {
    await loadCrossOriginImage(S3);

    // The whole point of presigning is that these bytes never touch our server.
    expect(attempts).toEqual([S3]);
  });

  it("asks for crossOrigin credentials-free access, so the canvas stays readable", async () => {
    const img = (await loadCrossOriginImage(S3)) as unknown as FakeImage;

    expect(img.crossOrigin).toBe("anonymous");
  });

  it("retries through the same-origin proxy when S3 blocks the CORS load", async () => {
    loads = (src) => src.startsWith("/api/media");

    await expect(loadCrossOriginImage(S3)).resolves.toBeDefined();

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe(S3);
    expect(attempts[1]).toBe(`/api/media?url=${encodeURIComponent(S3)}`);
  });

  it("remembers the blocked host, so a room full of masks pays the failure once", async () => {
    loads = (src) => src.startsWith("/api/media");
    await loadCrossOriginImage(S3);
    attempts = [];

    const mask = S3.replace("a.png", "mask-1.png");
    await loadCrossOriginImage(mask);

    expect(attempts).toEqual([`/api/media?url=${encodeURIComponent(mask)}`]);
  });

  it("does not proxy a same-origin URL — the proxy cannot help and would loop", async () => {
    loads = () => false;

    await expect(loadCrossOriginImage("/bff/api/images/files/x.png")).rejects.toThrow();

    expect(attempts).toEqual(["/bff/api/images/files/x.png"]);
  });

  it("does not proxy data: URLs", async () => {
    loads = () => false;

    await expect(loadCrossOriginImage("data:image/png;base64,AAAA")).rejects.toThrow();

    expect(attempts).toHaveLength(1);
  });

  it("reports the original URL when both routes fail", async () => {
    loads = () => false;

    // A genuinely missing or expired image must still look missing, not like a
    // proxy problem — the URL in the message is the one the caller asked for.
    await expect(loadCrossOriginImage(S3)).rejects.toThrow(S3);
    expect(attempts).toHaveLength(2);
  });
});
