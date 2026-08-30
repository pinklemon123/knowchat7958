CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT '匿名访客',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  source text,
  published_at timestamptz,
  content text,
  score numeric,
  query text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_sources_query_idx ON news_sources (query);
CREATE INDEX IF NOT EXISTS news_sources_published_at_idx ON news_sources (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS news_sources_search_idx ON news_sources USING gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(source, ''))
);

CREATE TABLE IF NOT EXISTS generated_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  source_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
