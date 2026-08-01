import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Serves locally-stored receipts in development. In production Vercel Blob
 * serves them directly and this route is never hit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // Reject anything that isn't a bare filename — no traversal, no absolute paths.
  const safe = path.basename(decodeURIComponent(name));
  if (!safe || safe !== decodeURIComponent(name) || safe.startsWith(".")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await readFile(path.join(process.cwd(), "uploads", safe));
    const ext = path.extname(safe).toLowerCase();
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
