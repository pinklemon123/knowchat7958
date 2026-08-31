import { createHmac, randomBytes } from "node:crypto";
import { readFile, unlink, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

function readEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));
}

async function exists(filePath) {
  try { await stat(filePath); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function request(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers: { cookie: globalThis.testCookie, ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const runtimeDirectory = path.resolve("tests/runtime");
const textPath = path.join(runtimeDirectory, `comment-e2e-${Date.now()}.txt`);
const imagePath = path.resolve("tests/artifacts/inbox-dark-mobile.png");
let itemId = null;
let primaryRelativePath = null;
let attachmentRelativePath = null;
let pool;

try {
  const env = readEnv(await readFile(".env.local", "utf8"));
  pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const dataRoot = path.resolve(env.LIBRARY_DATA_DIR || "./data");
  const auth = JSON.parse(await readFile(path.join(dataRoot, "auth/library-auth.json"), "utf8"));
  const expires = Math.floor(Date.now() / 1000) + 300;
  const payload = `${expires}.${randomBytes(16).toString("hex")}`;
  const token = `${payload}.${createHmac("sha256", auth.sessionSecret).update(payload).digest("hex")}`;
  globalThis.testCookie = `green_library_session=${token}`;

  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(textPath, `comment attachment test ${Date.now()}`);
  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([await readFile(textPath)], { type: "text/plain" }), path.basename(textPath));
  const uploaded = await request("/api/files/upload", { method: "POST", body: uploadForm });
  if (uploaded.response.status !== 201 || !uploaded.body?.ok) throw new Error(`item upload: ${uploaded.response.status}`);
  itemId = uploaded.body.item.id;
  primaryRelativePath = uploaded.body.file.relativePath;

  const comment = await request(`/api/library/${itemId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add-comment", content: "参考链接 https://example.com/knowledge" }) });
  if (!comment.response.ok || !comment.body?.comment?.id) throw new Error(`comment create: ${comment.response.status}`);
  const commentId = comment.body.comment.id;

  const imageForm = new FormData();
  imageForm.append("file", new Blob([await readFile(imagePath)], { type: "image/png" }), "comment-test.png");
  const attached = await request(`/api/library/${itemId}/comments/${commentId}/attachments`, { method: "POST", body: imageForm });
  if (attached.response.status !== 201 || !attached.body?.attachment?.fileId) throw new Error(`image attach: ${attached.response.status} ${attached.body?.code || ""}`);
  const fileId = attached.body.attachment.fileId;
  const dbFile = await pool.query("SELECT relative_path FROM files WHERE id = $1", [fileId]);
  attachmentRelativePath = dbFile.rows[0]?.relative_path;
  const attachmentAbsolutePath = path.join(dataRoot, "library", ...attachmentRelativePath.split("/"));

  const detail = await request(`/api/library/${itemId}`);
  const savedComment = detail.body?.comments?.find((entry) => entry.id === commentId);
  if (!savedComment?.content.includes("https://example.com") || savedComment.attachments?.length !== 1) throw new Error("comment detail does not include link and image");
  const contentResponse = await fetch(`${baseUrl}/api/files/${fileId}/content`, { headers: { cookie: globalThis.testCookie } });
  if (!contentResponse.ok || !contentResponse.headers.get("content-type")?.startsWith("image/png")) throw new Error(`image content: ${contentResponse.status}`);
  if (!(await exists(attachmentAbsolutePath))) throw new Error("comment image was not stored");

  const deleted = await request(`/api/library/${itemId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete-comment", commentId }) });
  if (!deleted.response.ok) throw new Error(`comment delete: ${deleted.response.status}`);
  const afterDelete = await pool.query("SELECT 1 FROM files WHERE id = $1", [fileId]);
  if (afterDelete.rowCount || await exists(attachmentAbsolutePath)) throw new Error("comment image cleanup failed");

  console.log(JSON.stringify({ commentLink: "PASS", commentImageUpload: "PASS", imageContent: "PASS", commentImageCleanup: "PASS" }));
} finally {
  await unlink(textPath).catch(() => {});
  if (pool && itemId) await pool.query("DELETE FROM library_items WHERE id = $1", [itemId]).catch(() => {});
  const dataRoot = path.resolve((await readFile(".env.local", "utf8").then(readEnv).catch(() => ({}))).LIBRARY_DATA_DIR || "./data");
  for (const relativePath of [primaryRelativePath, attachmentRelativePath].filter(Boolean)) {
    const target = path.resolve(dataRoot, "library", ...relativePath.split("/"));
    const root = path.resolve(dataRoot, "library");
    if (target.startsWith(`${root}${path.sep}`)) await unlink(target).catch(() => {});
  }
  if (pool) await pool.end();
}
