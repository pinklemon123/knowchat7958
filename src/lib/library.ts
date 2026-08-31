import { getPool, withTransaction } from "./db";
import type { LibraryItemFilters, LibraryItemSummary } from "./library-types";
import { deleteStoredFile } from "./storage";

type LibraryItemRow = {
  id: string;
  collection_id: string | null;
  collection_name: string | null;
  title: string;
  type: LibraryItemSummary["type"];
  description: string | null;
  location: LibraryItemSummary["location"];
  starred: boolean;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
  last_opened_at: Date | null;
  last_activity_at: Date;
  archived_at: Date | null;
  deleted_at: Date | null;
  primary_file_id: string | null;
  primary_file_name: string | null;
  primary_mime_type: string | null;
  primary_size_bytes: string | number | null;
  tags: string[] | null;
  comment_count: string | number;
};

async function requirePool() {
  const pool = await getPool();
  if (!pool) {
    throw new Error("DATABASE_URL is required for library operations");
  }
  return pool;
}

function mapLibraryItem(row: LibraryItemRow): LibraryItemSummary {
  return {
    id: row.id,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    title: row.title,
    type: row.type,
    description: row.description,
    location: row.location,
    starred: row.starred,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    lastActivityAt: row.last_activity_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    primaryFileId: row.primary_file_id,
    primaryFileName: row.primary_file_name,
    primaryMimeType: row.primary_mime_type,
    primarySizeBytes: row.primary_size_bytes === null ? null : Number(row.primary_size_bytes),
    tags: row.tags ?? [],
    commentCount: Number(row.comment_count)
  };
}

const libraryItemSelect = `
  SELECT
    li.*,
    c.name AS collection_name,
    primary_file.id AS primary_file_id,
    primary_file.original_name AS primary_file_name,
    primary_file.mime_type AS primary_mime_type,
    primary_file.size_bytes AS primary_size_bytes,
    coalesce(tag_list.tags, '{}') AS tags,
    coalesce(comment_list.comment_count, 0) AS comment_count
  FROM library_items li
  LEFT JOIN collections c ON c.id = li.collection_id
  LEFT JOIN LATERAL (
    SELECT f.id, f.original_name, f.mime_type, f.size_bytes
    FROM files f
    WHERE f.item_id = li.id AND f.role = 'primary'
    ORDER BY f.created_at, f.id
    LIMIT 1
  ) primary_file ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(t.name ORDER BY t.name) AS tags
    FROM item_tags it
    JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = li.id
  ) tag_list ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS comment_count
    FROM item_comments ic
    WHERE ic.item_id = li.id
  ) comment_list ON true
`;

export async function listLibraryItems(filters: LibraryItemFilters = {}) {
  const pool = await requirePool();
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (filters.onlyDeleted) {
    conditions.push("li.deleted_at IS NOT NULL");
  } else if (!filters.includeDeleted) {
    conditions.push("li.deleted_at IS NULL");
  }

  if (filters.location) {
    values.push(filters.location);
    conditions.push(`li.location = $${values.length}`);
  }

  if (filters.collectionId === null) {
    conditions.push("li.collection_id IS NULL");
  } else if (filters.collectionId) {
    values.push(filters.collectionId);
    conditions.push(`li.collection_id = $${values.length}`);
  }

  if (filters.starred !== undefined) {
    values.push(filters.starred);
    conditions.push(`li.starred = $${values.length}`);
  }

  const query = filters.query?.trim();
  if (query) {
    values.push(`%${query.toLowerCase()}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(
      lower(li.title || ' ' || coalesce(li.description, '')) LIKE ${parameter}
      OR EXISTS (
        SELECT 1 FROM files search_file
        WHERE search_file.item_id = li.id AND lower(search_file.original_name) LIKE ${parameter}
      )
      OR EXISTS (
        SELECT 1 FROM item_tags search_item_tag
        JOIN tags search_tag ON search_tag.id = search_item_tag.tag_id
        WHERE search_item_tag.item_id = li.id AND lower(search_tag.name) LIKE ${parameter}
      )
      OR EXISTS (
        SELECT 1 FROM item_comments search_comment
        WHERE search_comment.item_id = li.id AND lower(search_comment.content) LIKE ${parameter}
      )
    )`);
  }

  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  values.push(limit, offset);

  const result = await pool.query<LibraryItemRow>(
    `${libraryItemSelect}
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY li.last_activity_at DESC, li.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return result.rows.map(mapLibraryItem);
}

export async function getLibraryItem(itemId: string) {
  const pool = await requirePool();
  const result = await pool.query<LibraryItemRow>(
    `${libraryItemSelect} WHERE li.id = $1 LIMIT 1`,
    [itemId]
  );
  return result.rows[0] ? mapLibraryItem(result.rows[0]) : null;
}

export async function markLibraryItemOpened(itemId: string) {
  const pool = await requirePool();
  const result = await pool.query(
    `UPDATE library_items
     SET last_opened_at = now(), last_activity_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [itemId]
  );
  return result.rowCount === 1;
}

export async function setLibraryItemStarred(itemId: string, starred: boolean) {
  const pool = await requirePool();
  const result = await pool.query(
    `UPDATE library_items SET starred = $2, last_activity_at = now()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [itemId, starred]
  );
  return result.rowCount === 1;
}

export async function setLibraryItemLocation(itemId: string, location: "inbox" | "library" | "archive") {
  const pool = await requirePool();
  const result = await pool.query(
    `UPDATE library_items
     SET location = $2,
         archived_at = CASE WHEN $2 = 'archive' THEN now() ELSE NULL END,
         last_activity_at = now()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [itemId, location]
  );
  return result.rowCount === 1;
}

export async function setLibraryItemCollection(itemId: string, collectionId: string | null) {
  const pool = await requirePool();
  const result = await pool.query(
    `UPDATE library_items
     SET collection_id = $2, last_activity_at = now()
     WHERE id = $1
       AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = $2))
     RETURNING id`,
    [itemId, collectionId]
  );
  return result.rowCount === 1;
}

export async function setLibraryItemDeleted(itemId: string, deleted: boolean) {
  const pool = await requirePool();
  const result = await pool.query(
    `UPDATE library_items
     SET deleted_at = CASE WHEN $2 THEN now() ELSE NULL END,
         last_activity_at = now()
     WHERE id = $1 AND deleted_at IS ${deleted ? "NULL" : "NOT NULL"}
     RETURNING id`,
    [itemId, deleted]
  );
  return result.rowCount === 1;
}

export type LibraryItemComment = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  attachments: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    contentUrl: string;
  }>;
};

export async function listLibraryItemComments(itemId: string) {
  const pool = await requirePool();
  const result = await pool.query<{
    id: string;
    content: string;
    created_at: Date;
    updated_at: Date;
    attachments: Array<{ fileId: string; originalName: string; mimeType: string; sizeBytes: string | number }>;
  }>(
    `SELECT ic.id, ic.content, ic.created_at, ic.updated_at,
       coalesce(
         jsonb_agg(jsonb_build_object(
           'fileId', f.id,
           'originalName', f.original_name,
           'mimeType', f.mime_type,
           'sizeBytes', f.size_bytes
         ) ORDER BY ca.sort_order, ca.created_at) FILTER (WHERE f.id IS NOT NULL),
         '[]'::jsonb
       ) AS attachments
     FROM item_comments ic
     LEFT JOIN comment_attachments ca ON ca.comment_id = ic.id
     LEFT JOIN files f ON f.id = ca.file_id
     WHERE ic.item_id = $1
     GROUP BY ic.id
     ORDER BY ic.created_at DESC`,
    [itemId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.fileId,
      fileId: attachment.fileId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
      contentUrl: `/api/files/${attachment.fileId}/content`
    }))
  }));
}

export async function addLibraryItemComment(itemId: string, content: string) {
  const normalized = content.trim();
  if (!normalized || normalized.length > 5000) throw new Error("INVALID_COMMENT");
  const pool = await requirePool();
  const result = await pool.query<{ id: string; content: string; created_at: Date; updated_at: Date }>(
    `INSERT INTO item_comments (item_id, content)
     SELECT id, $2 FROM library_items WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, content, created_at, updated_at`,
    [itemId, normalized]
  );
  const row = result.rows[0];
  return row ? { id: row.id, content: row.content, createdAt: row.created_at, updatedAt: row.updated_at, attachments: [] } : null;
}

export async function deleteLibraryItemComment(itemId: string, commentId: string) {
  const deleted = await withTransaction(async (client) => {
    const files = await client.query<{ id: string; relative_path: string }>(
      `SELECT f.id, f.relative_path
       FROM comment_attachments ca
       JOIN files f ON f.id = ca.file_id AND f.role = 'comment_image'
       JOIN item_comments ic ON ic.id = ca.comment_id
       WHERE ic.id = $1 AND ic.item_id = $2
       FOR UPDATE OF f`,
      [commentId, itemId]
    );
    const result = await client.query("DELETE FROM item_comments WHERE id = $1 AND item_id = $2", [commentId, itemId]);
    if (result.rowCount !== 1) return null;
    if (files.rows.length) {
      await client.query("DELETE FROM files WHERE id = ANY($1::uuid[])", [files.rows.map((file) => file.id)]);
    }
    return files.rows.map((file) => file.relative_path);
  });
  if (!deleted) return false;
  await Promise.all(deleted.map((relativePath) => deleteStoredFile(relativePath).catch((error) => {
    console.error("Failed to delete comment image from storage", error);
    return false;
  })));
  return true;
}

export async function replaceLibraryItemTags(itemId: string, names: string[]) {
  const normalized = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (normalized.length > 20 || normalized.some((name) => name.length > 40)) throw new Error("INVALID_TAGS");
  return withTransaction(async (client) => {
    const item = await client.query("SELECT id FROM library_items WHERE id = $1 AND deleted_at IS NULL", [itemId]);
    if (!item.rowCount) return false;
    await client.query("DELETE FROM item_tags WHERE item_id = $1", [itemId]);
    for (const name of normalized) {
      const tag = await client.query<{ id: string }>(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (lower(name)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name]
      );
      await client.query("INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [itemId, tag.rows[0].id]);
    }
    return true;
  });
}

export async function promoteStaleInboxItems() {
  const pool = await requirePool();
  const result = await pool.query<{ promoted_count: number }>(
    "SELECT promote_stale_inbox_items() AS promoted_count"
  );
  return Number(result.rows[0]?.promoted_count ?? 0);
}
