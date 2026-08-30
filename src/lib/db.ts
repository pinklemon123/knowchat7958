import type { NewsResult } from "./types";
import type { PoolClient } from "pg";

type PoolModule = typeof import("pg");
type DbPool = InstanceType<PoolModule["Pool"]>;

let pool: DbPool | null = null;

export async function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (pool) return pool;
  const pg = await import("pg");
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
  return pool;
}

export async function requirePool() {
  const db = await getPool();
  if (!db) throw new Error("DATABASE_URL is required for database operations");
  return db;
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const db = await requirePool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Database rollback failed", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function createAnonymousSession(id: string) {
  const db = await getPool();
  if (!db) return;
  await db.query(
    `INSERT INTO anonymous_sessions (id, display_name)
     VALUES ($1, '匿名访客')
     ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
    [id]
  );
}

export async function upsertNewsResults(query: string, results: NewsResult[]) {
  const db = await getPool();
  if (!db || !results.length) return;
  for (const item of results) {
    await db.query(
      `INSERT INTO news_sources (title, url, source, published_at, content, score, query)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         source = EXCLUDED.source,
         published_at = EXCLUDED.published_at,
         content = EXCLUDED.content,
         score = EXCLUDED.score,
         query = EXCLUDED.query,
         fetched_at = now()`,
      [
        item.title,
        item.url,
        item.source ?? null,
        item.publishedDate ? new Date(item.publishedDate) : null,
        item.content,
        item.score ?? null,
        query
      ]
    );
  }
}

export async function searchCachedNews(query: string) {
  const db = await getPool();
  if (!db) return [];
  const result = await db.query(
    `SELECT title, url, source, published_at, content, score
     FROM news_sources
     WHERE to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(source, ''))
       @@ plainto_tsquery('simple', $1)
     ORDER BY published_at DESC NULLS LAST, fetched_at DESC
     LIMIT 10`,
    [query]
  );
  return result.rows.map((row) => ({
    title: row.title,
    url: row.url,
    source: row.source,
    publishedDate: row.published_at?.toISOString?.(),
    content: row.content,
    score: Number(row.score ?? 0)
  })) as NewsResult[];
}

export async function saveGeneratedArticle(sessionId: string | undefined, title: string, body: string, sourceUrls: string[]) {
  const db = await getPool();
  if (!db) return;
  await db.query(
    `INSERT INTO generated_articles (session_id, title, body, source_urls)
     VALUES ($1, $2, $3, $4)`,
    [sessionId ?? null, title, body, sourceUrls]
  );
}
