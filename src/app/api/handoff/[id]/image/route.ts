import { NextResponse } from "next/server";
import { putImage, sessionExists, takeImage } from "@/lib/handoff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

/** Confirm the bytes really are a JPEG/PNG/WebP — the client-declared MIME is not trusted. */
function isRealImage(ab: ArrayBuffer): boolean {
  const b = new Uint8Array(ab.slice(0, 12));
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp =
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // "WEBP"
  return jpeg || png || webp;
}

// Phone uploads the chosen photo here (multipart form-data, field "file").
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!sessionExists(id)) {
    return NextResponse.json(
      { message: "This code has expired. Refresh the page on your computer for a new one." },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: "Expected an image upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No image was provided." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ message: "Use a JPEG, PNG, or WebP photo." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Photo is larger than 10 MB." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  if (!isRealImage(bytes)) {
    return NextResponse.json({ message: "That file isn't a valid JPEG, PNG, or WebP image." }, { status: 400 });
  }
  if (!putImage(id, bytes, file.type)) {
    return NextResponse.json({ message: "This session has expired." }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

// Desktop fetches the uploaded photo once it's ready (one-shot — consumed on read).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = takeImage(id);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.bytes, {
    status: 200,
    headers: { "Content-Type": img.contentType, "Cache-Control": "no-store" },
  });
}
