import path from "node:path";
import type { PoolClient } from "pg";
import { requirePool, withTransaction } from "./db";
import type { FileRole, LibraryItemType } from "./library-types";
import {
  deleteStoredFile,
  deleteTempFile,
  hashFile,
  moveIntoLibrary
} from "./storage";
import type { TempUpload } from "./upload";
import { ensureLibraryFullTextSchema, extractTextForIndex } from "./library-search";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExistingFileRow = {
  item_id: string;
};

type CreatedItemRow = {
  id: string;
  title: string;
  type: LibraryItemType;
  location: "inbox";
  collection_id: string | null;
  created_at: Date;
};

type CreatedFileRow = {
  id: string;
  item_id: string;
  role: FileRole;
  original_name: string;
  relative_path: string;
  mime_type: string;
  extension: string | null;
  size_bytes: string | number;
  sha256: string;
  created_at: Date;
};

export type CreateUploadResult =
  | {
      duplicate: true;
      existingItemId: string;
    }
  | {
      duplicate: false;
      item: {
        id: string;
        title: string;
        type: LibraryItemType;
        location: "inbox";
        collectionId: string | null;
        createdAt: Date;
      };
      file: {
        id: string;
        itemId: string;
        role: FileRole;
        originalName: string;
        relativePath: string;
        mimeType: string;
        extension: string | null;
        sizeBytes: number;
        sha256: string;
        createdAt: Date;
      };
    };

export class LibraryUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryUploadValidationError";
  }
}

function extensionFromName(originalName: string) {
  const extension = path.extname(originalName).slice(1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : null;
}

function titleFromUpload(upload: TempUpload) {
  const explicitTitle = upload.title?.trim();
  if (explicitTitle) return explicitTitle;
  const extension = path.extname(upload.originalName);
  return path.basename(upload.originalName, extension).trim() || upload.originalName;
}

function itemTypeForFile(mimeType: string, extension: string | null): LibraryItemType {
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    ["pdf", "doc", "docx", "md", "txt", "rtf", "odt"].includes(extension ?? "")
  ) {
    return "document";
  }
  return "other";
}

async function findExistingItem(sha256: string, client?: PoolClient) {
  const queryable = client ?? (await requirePool());
  const result = await queryable.query<ExistingFileRow>(
    "SELECT item_id FROM files WHERE sha256 = $1 LIMIT 1",
    [sha256]
  );
  return result.rows[0]?.item_id ?? null;
}

async function collectionExists(collectionId: string) {
  const db = await requirePool();
  const result = await db.query("SELECT 1 FROM collections WHERE id = $1 LIMIT 1", [collectionId]);
  return result.rowCount === 1;
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string }).code === "23505";
}

export async function createLibraryItemFromUpload(upload: TempUpload): Promise<CreateUploadResult> {
  if (upload.collectionId && !UUID_PATTERN.test(upload.collectionId)) {
    await deleteTempFile(upload.tempPath);
    throw new LibraryUploadValidationError("collectionId must be a valid UUID");
  }

  let tempConsumed = false;
  let storedRelativePath: string | null = null;
  let createdPhysicalFile = false;
  let uploadSha256: string | null = null;

  try {
    if (upload.collectionId && !(await collectionExists(upload.collectionId))) {
      throw new LibraryUploadValidationError("collectionId does not exist");
    }

    const sha256 = await hashFile(upload.tempPath);
    uploadSha256 = sha256;
    const existingItemId = await findExistingItem(sha256);
    if (existingItemId) {
      await deleteTempFile(upload.tempPath);
      tempConsumed = true;
      return { duplicate: true, existingItemId };
    }

    const extension = extensionFromName(upload.originalName);
    const stored = await moveIntoLibrary(upload.tempPath, sha256, extension ?? undefined);
    tempConsumed = true;
    storedRelativePath = stored.relativePath;
    createdPhysicalFile = !stored.duplicate;
    await ensureLibraryFullTextSchema();
    const extractedText = await extractTextForIndex(
      stored.absolutePath,
      upload.reportedMimeType || "application/octet-stream",
      extension,
      upload.sizeBytes
    );

    try {
      const created = await withTransaction(async (client) => {
        const itemResult = await client.query<CreatedItemRow>(
          `INSERT INTO library_items (collection_id, title, type, location)
           VALUES ($1, $2, $3, 'inbox')
           RETURNING id, title, type, location, collection_id, created_at`,
          [
            upload.collectionId ?? null,
            titleFromUpload(upload),
            itemTypeForFile(upload.reportedMimeType, extension)
          ]
        );
        const item = itemResult.rows[0];

        const fileResult = await client.query<CreatedFileRow>(
           `INSERT INTO files (
             item_id, role, original_name, storage_name, relative_path,
             mime_type, extension, size_bytes, sha256, extracted_text
           ) VALUES ($1, 'primary', $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, item_id, role, original_name, relative_path,
                     mime_type, extension, size_bytes, sha256, created_at`,
          [
            item.id,
            upload.originalName,
            path.posix.basename(stored.relativePath),
            stored.relativePath,
            upload.reportedMimeType || "application/octet-stream",
            extension,
            upload.sizeBytes,
            sha256,
            extractedText
          ]
        );

        return { item, file: fileResult.rows[0] };
      });

      return {
        duplicate: false,
        item: {
          id: created.item.id,
          title: created.item.title,
          type: created.item.type,
          location: created.item.location,
          collectionId: created.item.collection_id,
          createdAt: created.item.created_at
        },
        file: {
          id: created.file.id,
          itemId: created.file.item_id,
          role: created.file.role,
          originalName: created.file.original_name,
          relativePath: created.file.relative_path,
          mimeType: created.file.mime_type,
          extension: created.file.extension,
          sizeBytes: Number(created.file.size_bytes),
          sha256: created.file.sha256,
          createdAt: created.file.created_at
        }
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const concurrentItemId = await findExistingItem(sha256);
        if (concurrentItemId) {
          return { duplicate: true, existingItemId: concurrentItemId };
        }
      }
      throw error;
    }
  } catch (error) {
    if (!tempConsumed) await deleteTempFile(upload.tempPath);
    if (createdPhysicalFile && storedRelativePath) {
      const existingItemId = uploadSha256 ? await findExistingItem(uploadSha256).catch(() => null) : null;
      if (!existingItemId) await deleteStoredFile(storedRelativePath);
    }
    throw error;
  }
}
