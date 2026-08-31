import { requirePool } from "./db";

export type LibraryCollection = {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type CollectionRow = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
  item_count: string | number;
  created_at: Date;
  updated_at: Date;
};

function mapCollection(row: CollectionRow): LibraryCollection {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    description: row.description,
    sortOrder: row.sort_order,
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const collectionSelect = `
  SELECT c.*,
    count(li.id) FILTER (WHERE li.deleted_at IS NULL) AS item_count
  FROM collections c
  LEFT JOIN library_items li ON li.collection_id = c.id
`;

export async function listLibraryCollections() {
  const pool = await requirePool();
  const result = await pool.query<CollectionRow>(
    `${collectionSelect}
     GROUP BY c.id
     ORDER BY c.sort_order, lower(c.name), c.created_at`
  );
  return result.rows.map(mapCollection);
}

export async function createLibraryCollection(name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 60) throw new Error("INVALID_COLLECTION_NAME");
  const pool = await requirePool();
  const result = await pool.query<CollectionRow>(
    `INSERT INTO collections (name, sort_order)
     VALUES ($1, coalesce((SELECT max(sort_order) + 1 FROM collections), 0))
     RETURNING *, 0::bigint AS item_count`,
    [normalized]
  );
  return mapCollection(result.rows[0]);
}

export async function renameLibraryCollection(collectionId: string, name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 60) throw new Error("INVALID_COLLECTION_NAME");
  const pool = await requirePool();
  const result = await pool.query<CollectionRow>(
    `UPDATE collections SET name = $2 WHERE id = $1
     RETURNING *, (SELECT count(*) FROM library_items WHERE collection_id = $1 AND deleted_at IS NULL)::bigint AS item_count`,
    [collectionId, normalized]
  );
  return result.rows[0] ? mapCollection(result.rows[0]) : null;
}

export async function deleteLibraryCollection(collectionId: string) {
  const pool = await requirePool();
  const result = await pool.query("DELETE FROM collections WHERE id = $1 RETURNING id", [collectionId]);
  return result.rowCount === 1;
}
