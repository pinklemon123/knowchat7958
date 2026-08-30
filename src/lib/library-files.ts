import { requirePool } from "./db";

export type StoredFileRecord = {
  id: string;
  itemId: string;
  originalName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

type StoredFileRow = {
  id: string;
  item_id: string;
  original_name: string;
  relative_path: string;
  mime_type: string;
  size_bytes: string | number;
  sha256: string;
};

export async function getStoredFileRecord(fileId: string): Promise<StoredFileRecord | null> {
  const db = await requirePool();
  const result = await db.query<StoredFileRow>(
    `SELECT f.id, f.item_id, f.original_name, f.relative_path,
            f.mime_type, f.size_bytes, f.sha256
     FROM files f
     JOIN library_items li ON li.id = f.item_id
     WHERE f.id = $1 AND li.deleted_at IS NULL
     LIMIT 1`,
    [fileId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.item_id,
    originalName: row.original_name,
    relativePath: row.relative_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256
  };
}
