import { requirePool } from "./db";
import { safeResolveStoragePath } from "./storage";
import { extractTextForIndex, MAX_INDEXED_TEXT_BYTES, TEXT_EXTENSIONS } from "./text-extraction";

export { extractTextForIndex } from "./text-extraction";

let schemaPromise: Promise<void> | null = null;
let backfillPromise: Promise<void> | null = null;

export async function ensureLibraryFullTextSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = await requirePool();
      await db.query("ALTER TABLE files ADD COLUMN IF NOT EXISTS extracted_text text");
      await db.query(`CREATE INDEX IF NOT EXISTS files_extracted_text_search_idx
        ON files USING gin (to_tsvector('simple', coalesce(extracted_text, '')))`);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function prepareLibraryFullTextSearch() {
  await ensureLibraryFullTextSchema();
  if (!backfillPromise) {
    backfillPromise = (async () => {
      const db = await requirePool();
      while (true) {
        const result = await db.query<{
          id: string;
          relative_path: string;
          mime_type: string;
          extension: string | null;
          size_bytes: string | number;
        }>(
          `SELECT id, relative_path, mime_type, extension, size_bytes
           FROM files
           WHERE extracted_text IS NULL
             AND role = 'primary'
             AND size_bytes <= $1
             AND (mime_type LIKE 'text/%' OR mime_type IN ('application/json', 'application/xml') OR lower(coalesce(extension, '')) = ANY($2::text[]))
           ORDER BY created_at
           LIMIT 100`,
          [MAX_INDEXED_TEXT_BYTES, [...TEXT_EXTENSIONS]]
        );
        if (!result.rows.length) break;
        for (const file of result.rows) {
          try {
            const text = await extractTextForIndex(
              safeResolveStoragePath(file.relative_path),
              file.mime_type,
              file.extension,
              Number(file.size_bytes)
            );
            await db.query("UPDATE files SET extracted_text = $2 WHERE id = $1", [file.id, text ?? ""]);
          } catch (error) {
            console.error("Failed to index existing library text file", file.id, error);
            await db.query("UPDATE files SET extracted_text = '' WHERE id = $1", [file.id]);
          }
        }
      }
    })().catch((error) => {
      backfillPromise = null;
      throw error;
    });
  }
  return backfillPromise;
}
