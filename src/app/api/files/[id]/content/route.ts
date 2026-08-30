import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getStoredFileRecord } from "@/lib/library-files";
import { markLibraryItemOpened } from "@/lib/library";
import { safeResolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contentDisposition(fileName: string, inline: boolean) {
  const safeAscii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${inline ? "inline" : "attachment"}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, code: "INVALID_FILE_ID" }, { status: 400 });
  }

  const file = await getStoredFileRecord(id);
  if (!file) {
    return Response.json({ ok: false, code: "FILE_NOT_FOUND" }, { status: 404 });
  }

  const absolutePath = safeResolveStoragePath(file.relativePath);
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ ok: false, code: "FILE_CONTENT_MISSING" }, { status: 404 });
    }
    throw error;
  }

  const inline = file.mimeType === "application/pdf"
    || file.mimeType.startsWith("image/")
    || file.mimeType.startsWith("text/")
    || file.mimeType.startsWith("audio/")
    || file.mimeType.startsWith("video/")
    || file.mimeType === "application/json";
  await markLibraryItemOpened(file.itemId);
  const nodeStream = createReadStream(absolutePath);
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": contentDisposition(file.originalName, inline),
      "Cache-Control": "private, no-store",
      ETag: `"${file.sha256}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
