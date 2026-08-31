import path from "node:path";
import { requirePool, withTransaction } from "./db";
import { deleteStoredFile, deleteTempFile, hashFile, moveIntoLibrary } from "./storage";
import type { TempUpload } from "./upload";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

type CreatedAttachmentRow = {
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: string | number;
};

export class CommentAttachmentError extends Error {
  constructor(public readonly code: "INVALID_IMAGE" | "COMMENT_NOT_FOUND" | "DUPLICATE_COMMENT_IMAGE", message: string) {
    super(message);
    this.name = "CommentAttachmentError";
  }
}

function extensionFromName(originalName: string) {
  const extension = path.extname(originalName).slice(1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(extension) ? extension : null;
}

export function validateCommentImage(upload: TempUpload) {
  if (!ALLOWED_IMAGE_TYPES.has(upload.reportedMimeType.toLowerCase())) {
    throw new CommentAttachmentError("INVALID_IMAGE", "仅支持 JPEG、PNG、WebP、GIF 或 AVIF 图片");
  }
}

export async function attachImageToComment(itemId: string, commentId: string, upload: TempUpload) {
  let tempConsumed = false;
  let storedRelativePath: string | null = null;
  let createdPhysicalFile = false;

  try {
    validateCommentImage(upload);
    const pool = await requirePool();
    const comment = await pool.query(
      `SELECT ic.id
       FROM item_comments ic
       JOIN library_items li ON li.id = ic.item_id
       WHERE ic.id = $1 AND ic.item_id = $2 AND li.deleted_at IS NULL`,
      [commentId, itemId]
    );
    if (!comment.rowCount) throw new CommentAttachmentError("COMMENT_NOT_FOUND", "评论不存在");

    const sha256 = await hashFile(upload.tempPath);
    const duplicate = await pool.query("SELECT 1 FROM files WHERE sha256 = $1 LIMIT 1", [sha256]);
    if (duplicate.rowCount) throw new CommentAttachmentError("DUPLICATE_COMMENT_IMAGE", "这张图片已经保存在资料库中");

    const extension = extensionFromName(upload.originalName);
    const stored = await moveIntoLibrary(upload.tempPath, sha256, extension ?? undefined);
    tempConsumed = true;
    storedRelativePath = stored.relativePath;
    createdPhysicalFile = !stored.duplicate;

    const row = await withTransaction(async (client) => {
      const lockedComment = await client.query(
        `SELECT ic.id
         FROM item_comments ic
         JOIN library_items li ON li.id = ic.item_id
         WHERE ic.id = $1 AND ic.item_id = $2 AND li.deleted_at IS NULL
         FOR UPDATE OF ic`,
        [commentId, itemId]
      );
      if (!lockedComment.rowCount) throw new CommentAttachmentError("COMMENT_NOT_FOUND", "评论不存在");

      const created = await client.query<CreatedAttachmentRow>(
        `WITH inserted_file AS (
           INSERT INTO files (
             item_id, role, original_name, storage_name, relative_path,
             mime_type, extension, size_bytes, sha256
           ) VALUES ($1, 'comment_image', $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, original_name, mime_type, size_bytes
         ), inserted_attachment AS (
           INSERT INTO comment_attachments (comment_id, file_id, sort_order)
           SELECT $2, id, coalesce((SELECT max(sort_order) + 1 FROM comment_attachments WHERE comment_id = $2), 0)
           FROM inserted_file
           RETURNING file_id
         )
         SELECT ia.file_id, f.original_name, f.mime_type, f.size_bytes
         FROM inserted_attachment ia
         JOIN inserted_file f ON f.id = ia.file_id`,
        [
          itemId,
          commentId,
          upload.originalName,
          path.posix.basename(stored.relativePath),
          stored.relativePath,
          upload.reportedMimeType,
          extension,
          upload.sizeBytes,
          sha256
        ]
      );
      return created.rows[0];
    });

    return {
      id: row.file_id,
      fileId: row.file_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      contentUrl: `/api/files/${row.file_id}/content`
    };
  } catch (error) {
    if (!tempConsumed) await deleteTempFile(upload.tempPath).catch(() => false);
    if (createdPhysicalFile && storedRelativePath) await deleteStoredFile(storedRelativePath).catch(() => false);
    if ((error as { code?: string }).code === "23505") {
      throw new CommentAttachmentError("DUPLICATE_COMMENT_IMAGE", "这张图片已经保存在资料库中");
    }
    throw error;
  }
}
