import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Receipt image storage. Vercel Blob in production; a local ./uploads directory
 * in development so the app runs with nothing but Postgres and an API key.
 */
export async function storeReceipt(params: {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const { filename, contentType, bytes } = params;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`receipts/${filename}`, Buffer.from(bytes), {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  // basename() so a crafted filename can't escape the uploads directory.
  const safe = path.basename(filename);
  await writeFile(path.join(dir, safe), bytes);
  return `/api/uploads/${encodeURIComponent(safe)}`;
}
