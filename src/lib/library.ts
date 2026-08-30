import { getPool } from "./db";
import type { LibraryItemFilters, LibraryItemSummary } from "./library-types";

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

export async function promoteStaleInboxItems() {
  const pool = await requirePool();
  const result = await pool.query<{ promoted_count: number }>(
    "SELECT promote_stale_inbox_items() AS promoted_count"
  );
  return Number(result.rows[0]?.promoted_count ?? 0);
}
