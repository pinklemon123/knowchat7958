import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ensureStorageDirectories } from "./storage";

export type UploadErrorCode =
  | "INVALID_MULTIPART"
  | "MISSING_FILE"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE";

export class UploadError extends Error {
  constructor(
    public readonly code: UploadErrorCode,
    message: string
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export type TempUpload = {
  tempPath: string;
  originalName: string;
  reportedMimeType: string;
  sizeBytes: number;
  title?: string;
  collectionId?: string;
  fields: Record<string, string>;
};

export function getMaxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 100 * 1024 * 1024;
}

function displayFileName(fileName: string) {
  const normalized = fileName.replaceAll("\\", "/");
  return path.posix.basename(normalized).trim() || "upload";
}

async function removeTempFile(tempPath: string | null) {
  if (!tempPath) return;
  try {
    await unlink(tempPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function parseMultipartUpload(
  request: Request,
  options: { maxUploadBytes?: number; allowedFields?: string[] } = {}
): Promise<TempUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new UploadError("INVALID_MULTIPART", "Content-Type must be multipart/form-data");
  }
  if (!request.body) {
    throw new UploadError("MISSING_FILE", "Upload request has no body");
  }

  const directories = await ensureStorageDirectories();
  const maxUploadBytes = options.maxUploadBytes ?? getMaxUploadBytes();
  const allowedFields = new Set(options.allowedFields ?? ["title", "collectionId"]);
  let tempPath: string | null = null;
  let originalName = "";
  let reportedMimeType = "application/octet-stream";
  let fileCount = 0;
  let fileTooLarge = false;
  let writePromise: Promise<void> | null = null;
  const fields: Record<string, string> = {};

  try {
    const parser = Busboy({
      headers: Object.fromEntries(request.headers.entries()),
      limits: {
        files: 1,
        fileSize: maxUploadBytes,
        fields: 4,
        fieldSize: 64 * 1024,
        parts: 6
      }
    });

    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      if (fieldName !== "file") {
        stream.resume();
        return;
      }

      originalName = displayFileName(info.filename);
      reportedMimeType = info.mimeType || "application/octet-stream";
      tempPath = path.join(directories.temp, `${randomUUID()}.upload`);
      stream.on("limit", () => {
        fileTooLarge = true;
      });
      writePromise = pipeline(stream, createWriteStream(tempPath, { flags: "wx" }));
    });

    parser.on("field", (name, value) => {
      if (allowedFields.has(name)) fields[name] = value.trim();
    });

    parser.on("filesLimit", () => {
      fileCount = Math.max(fileCount, 2);
    });

    const webBody = request.body as unknown as Parameters<typeof Readable.fromWeb>[0];
    await pipeline(Readable.fromWeb(webBody), parser);
    if (writePromise) await writePromise;

    if (fileCount > 1) {
      throw new UploadError("TOO_MANY_FILES", "Only one file may be uploaded per request");
    }
    if (!tempPath || !originalName) {
      throw new UploadError("MISSING_FILE", "The multipart field named file is required");
    }
    if (fileTooLarge) {
      throw new UploadError("FILE_TOO_LARGE", `File exceeds the ${maxUploadBytes}-byte upload limit`);
    }

    const fileStat = await stat(tempPath);
    if (fileStat.size === 0) {
      throw new UploadError("EMPTY_FILE", "Empty files are not accepted");
    }

    return {
      tempPath,
      originalName,
      reportedMimeType,
      sizeBytes: fileStat.size,
      title: fields.title || undefined,
      collectionId: fields.collectionId || undefined,
      fields
    };
  } catch (error) {
    if (writePromise) {
      try {
        await writePromise;
      } catch {
        // The original parsing/write error is reported below after cleanup.
      }
    }
    await removeTempFile(tempPath);
    if (error instanceof UploadError) throw error;
    throw new UploadError("INVALID_MULTIPART", error instanceof Error ? error.message : "Invalid multipart upload");
  }
}
