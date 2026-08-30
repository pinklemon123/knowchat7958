import path from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { getDataRoot } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const coverTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

function coverPaths() {
  const directory = path.join(getDataRoot(), "ui");
  return {
    directory,
    image: path.join(directory, "recent-cover.bin"),
    metadata: path.join(directory, "recent-cover.json"),
    temporary: path.join(directory, "recent-cover.tmp")
  };
}

async function removeFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function GET() {
  const paths = coverPaths();
  try {
    const [content, metadataText] = await Promise.all([
      readFile(paths.image),
      readFile(paths.metadata, "utf8")
    ]);
    const metadata = JSON.parse(metadataText) as { mimeType?: string };
    const mimeType = metadata.mimeType && coverTypes.has(metadata.mimeType) ? metadata.mimeType : "image/jpeg";
    return new Response(content, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ ok: false, code: "COVER_NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ ok: false, code: "COVER_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const cover = form.get("cover");
  if (!(cover instanceof File)) {
    return Response.json({ ok: false, code: "COVER_REQUIRED" }, { status: 400 });
  }
  if (!coverTypes.has(cover.type)) {
    return Response.json({ ok: false, code: "INVALID_COVER_TYPE", error: "仅支持 JPG、PNG、WebP 或 GIF" }, { status: 415 });
  }
  if (cover.size === 0 || cover.size > MAX_COVER_BYTES) {
    return Response.json({ ok: false, code: "INVALID_COVER_SIZE", error: "封面图片需小于 5 MB" }, { status: 413 });
  }

  const paths = coverPaths();
  await mkdir(paths.directory, { recursive: true });
  try {
    await writeFile(paths.temporary, Buffer.from(await cover.arrayBuffer()), { flag: "w" });
    await rename(paths.temporary, paths.image);
    await writeFile(paths.metadata, JSON.stringify({ mimeType: cover.type, updatedAt: new Date().toISOString() }), "utf8");
    return Response.json({ ok: true, updatedAt: Date.now() });
  } catch (error) {
    await removeFile(paths.temporary);
    console.error("Recent cover upload failed", error);
    return Response.json({ ok: false, code: "COVER_WRITE_FAILED" }, { status: 500 });
  }
}

export async function DELETE() {
  const paths = coverPaths();
  await Promise.all([removeFile(paths.image), removeFile(paths.metadata), removeFile(paths.temporary)]);
  return Response.json({ ok: true });
}
