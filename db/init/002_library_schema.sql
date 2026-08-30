BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  parent_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS collections_parent_name_idx
  ON collections (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS collections_parent_sort_idx ON collections (parent_id, sort_order, name);

CREATE TABLE IF NOT EXISTS library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (btrim(title) <> ''),
  type text NOT NULL DEFAULT 'other'
    CHECK (type IN ('document', 'image', 'webpage', 'other')),
  description text,
  location text NOT NULL DEFAULT 'inbox'
    CHECK (location IN ('inbox', 'library', 'archive')),
  starred boolean NOT NULL DEFAULT false,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT library_items_archive_time_consistency CHECK (
    (location = 'archive' AND archived_at IS NOT NULL)
    OR (location <> 'archive' AND archived_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS library_items_location_created_idx
  ON library_items (location, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_items_activity_idx
  ON library_items (last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_items_opened_idx
  ON library_items (last_opened_at DESC) WHERE deleted_at IS NULL AND last_opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS library_items_collection_idx
  ON library_items (collection_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_items_starred_idx
  ON library_items (created_at DESC) WHERE starred = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS library_items_deleted_idx
  ON library_items (deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS library_items_title_search_idx
  ON library_items USING gin (lower(coalesce(title, '') || ' ' || coalesce(description, '')) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'primary'
    CHECK (role IN ('primary', 'attachment', 'comment_image')),
  original_name text NOT NULL CHECK (btrim(original_name) <> ''),
  storage_name text NOT NULL CHECK (btrim(storage_name) <> ''),
  relative_path text NOT NULL CHECK (
    btrim(relative_path) <> ''
    AND relative_path !~ '(^|[\\/])\.\.([\\/]|$)'
    AND relative_path !~ '^[\\/]'
  ),
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  extension text,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT files_sha256_unique UNIQUE (sha256),
  CONSTRAINT files_relative_path_unique UNIQUE (relative_path),
  CONSTRAINT files_storage_name_unique UNIQUE (storage_name)
);

CREATE INDEX IF NOT EXISTS files_item_role_idx ON files (item_id, role, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS files_one_primary_per_item_idx
  ON files (item_id) WHERE role = 'primary';
CREATE INDEX IF NOT EXISTS files_original_name_search_idx
  ON files USING gin (lower(original_name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique_idx ON tags (lower(name));
CREATE INDEX IF NOT EXISTS tags_name_search_idx ON tags USING gin (lower(name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id uuid NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS item_tags_tag_idx ON item_tags (tag_id, item_id);

CREATE TABLE IF NOT EXISTS item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (btrim(content) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_comments_item_created_idx ON item_comments (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_comments_content_search_idx
  ON item_comments USING gin (lower(content) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS comment_attachments (
  comment_id uuid NOT NULL REFERENCES item_comments(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, file_id)
);

CREATE INDEX IF NOT EXISTS comment_attachments_order_idx
  ON comment_attachments (comment_id, sort_order, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collections_set_updated_at ON collections;
CREATE TRIGGER collections_set_updated_at
BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS library_items_set_updated_at ON library_items;
CREATE TRIGGER library_items_set_updated_at
BEFORE UPDATE ON library_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS item_comments_set_updated_at ON item_comments;
CREATE TRIGGER item_comments_set_updated_at
BEFORE UPDATE ON item_comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION touch_library_item_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_item_id uuid;
BEGIN
  target_item_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;
  UPDATE library_items
  SET last_activity_at = now()
  WHERE id = target_item_id;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS files_touch_library_item ON files;
CREATE TRIGGER files_touch_library_item
AFTER INSERT OR UPDATE OR DELETE ON files
FOR EACH ROW EXECUTE FUNCTION touch_library_item_activity();

DROP TRIGGER IF EXISTS item_tags_touch_library_item ON item_tags;
CREATE TRIGGER item_tags_touch_library_item
AFTER INSERT OR DELETE ON item_tags
FOR EACH ROW EXECUTE FUNCTION touch_library_item_activity();

DROP TRIGGER IF EXISTS item_comments_touch_library_item ON item_comments;
CREATE TRIGGER item_comments_touch_library_item
AFTER INSERT OR UPDATE OR DELETE ON item_comments
FOR EACH ROW EXECUTE FUNCTION touch_library_item_activity();

CREATE OR REPLACE FUNCTION validate_comment_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  comment_item_id uuid;
  file_item_id uuid;
  file_role text;
BEGIN
  SELECT item_id INTO comment_item_id FROM item_comments WHERE id = NEW.comment_id;
  SELECT item_id, role INTO file_item_id, file_role FROM files WHERE id = NEW.file_id;

  IF comment_item_id IS DISTINCT FROM file_item_id THEN
    RAISE EXCEPTION 'comment attachment file must belong to the same library item';
  END IF;

  IF file_role <> 'comment_image' THEN
    RAISE EXCEPTION 'comment attachment file role must be comment_image';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_attachments_validate ON comment_attachments;
CREATE TRIGGER comment_attachments_validate
BEFORE INSERT OR UPDATE ON comment_attachments
FOR EACH ROW EXECUTE FUNCTION validate_comment_attachment();

-- This operation is safe to run from a daily task or opportunistically when the home page loads.
CREATE OR REPLACE FUNCTION promote_stale_inbox_items()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  promoted_count integer;
BEGIN
  UPDATE library_items
  SET location = 'library', last_activity_at = now()
  WHERE location = 'inbox'
    AND created_at < now() - interval '48 hours'
    AND deleted_at IS NULL;

  GET DIAGNOSTICS promoted_count = ROW_COUNT;
  RETURN promoted_count;
END;
$$;

COMMIT;
