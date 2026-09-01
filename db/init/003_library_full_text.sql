BEGIN;

ALTER TABLE files ADD COLUMN IF NOT EXISTS extracted_text text;

CREATE INDEX IF NOT EXISTS files_extracted_text_search_idx
  ON files USING gin (to_tsvector('simple', coalesce(extracted_text, '')));

COMMIT;
