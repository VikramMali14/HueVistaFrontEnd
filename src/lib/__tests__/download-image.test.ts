// @vitest-environment jsdom
/**
 * Saving a stored image, which the product spent its life not doing.
 *
 * Every "download the image" button was `<a download href="https://…s3…">`. The
 * attribute is same-origin-only, so the browser ignored it and navigated to a bare
 * JPEG instead — and anyone who saved it by hand got a file named after the storage
 * key. These cases pin the two halves of the fix: bytes are actually fetched, and the
 * name is ours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadRemoteImage } from "../download-image";
import { downloadBlob } from "../download-blob";

vi.mock("../download-blob", () => ({ downloadBlob: vi.fn() }));

const S3 =
  "https://image-storage-original.s3.ap-south-1.amazonaws.com/u/abc.jpg?X-Amz-Signature=deadbeef";

const fetchMock = vi.fn();

function image(type = "image/jpeg", body = "bytes") {
  return new Response(body, { status: 200, headers: { "content-type": type } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(downloadBlob).mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("downloadRemoteImage", () => {
  it("saves the bytes under the name we chose", async () => {
    fetchMock.mockResolvedValue(image());

    const ok = await downloadRemoteImage(S3, "huevista-ai-image-sunlit-living-room-20260820");

    expect(ok).toBe(true);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    // Not `ad289bfc-4ba5-460b-a903-012d64a611e6.jpg`, which is what the browser's own
    // save produced when the anchor navigated instead of downloading.
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe(
      "huevista-ai-image-sunlit-living-room-20260820.jpg",
    );
  });

  it("goes through the same-origin passthrough before trying S3 directly", async () => {
    fetchMock.mockResolvedValue(image());

    await downloadRemoteImage(S3, "pic");

    // One request, and it is ours: a direct cross-origin fetch would be blocked on any
    // deployment whose bucket carries no CORS rule, which is the case this exists for.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/media?url=");
  });

  it("falls back to S3 when the passthrough cannot serve it", async () => {
    // The proxy answering 503 is exactly what production did before it could resolve a
    // bucket; a deployment whose bucket IS configured should still save the file.
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(image("image/png"));

    const ok = await downloadRemoteImage(S3, "pic");

    expect(ok).toBe(true);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(S3);
    // The stored render may be a PNG — the extension follows the bytes, not the button.
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe("pic.png");
  });

  it("does not proxy a URL that is already ours, and sends the session with it", async () => {
    fetchMock.mockResolvedValue(image());

    await downloadRemoteImage("/bff/api/images/files/u/abc.jpg", "pic");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/bff/api/images/files/u/abc.jpg");
    // That route authenticates from the cookie; omitting it would 401.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin" });
  });

  it("refuses to save something that is not an image", async () => {
    // An expired signature answers 200 with an XML error on some paths; saving that as
    // a .jpg hands the customer a file their gallery will not open.
    fetchMock.mockResolvedValue(
      new Response("<Error/>", { status: 200, headers: { "content-type": "application/xml" } }),
    );

    expect(await downloadRemoteImage(S3, "pic")).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("reports failure rather than throwing when nothing can be fetched", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    // False is the signal the caller needs to offer its own way out — it must not be an
    // exception that leaves a button spinning.
    expect(await downloadRemoteImage(S3, "pic")).toBe(false);
    expect(await downloadRemoteImage("", "pic")).toBe(false);
  });
});
