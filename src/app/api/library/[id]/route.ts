import { NextResponse } from "next/server";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { addLibraryItemComment, deleteLibraryItemComment, getLibraryItem, listLibraryItemComments, replaceLibraryItemTags, setLibraryItemCollection, setLibraryItemDeleted, setLibraryItemLocation, setLibraryItemStarred } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, code: "INVALID_ITEM_ID" }, { status: 400 });
  const item = await getLibraryItem(id);
  if (!item) return NextResponse.json({ ok: false, code: "ITEM_NOT_FOUND" }, { status: 404 });
  const comments = await listLibraryItemComments(id);
  return NextResponse.json({ ok: true, item, comments });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, code: "INVALID_ITEM_ID" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: string; value?: boolean; location?: string; collectionId?: string | null; tags?: string[]; content?: string; commentId?: string };

  let updated = false;
  if (body.action === "star" && typeof body.value === "boolean") {
    updated = await setLibraryItemStarred(id, body.value);
  } else if (body.action === "move" && ["inbox", "library", "archive"].includes(body.location || "")) {
    updated = await setLibraryItemLocation(id, body.location as "inbox" | "library" | "archive");
  } else if (body.action === "move-collection" && (body.collectionId === null || (typeof body.collectionId === "string" && UUID_PATTERN.test(body.collectionId)))) {
    updated = await setLibraryItemCollection(id, body.collectionId);
  } else if (body.action === "trash") {
    updated = await setLibraryItemDeleted(id, true);
  } else if (body.action === "restore") {
    updated = await setLibraryItemDeleted(id, false);
  } else if (body.action === "set-tags" && Array.isArray(body.tags)) {
    try { updated = await replaceLibraryItemTags(id, body.tags); }
    catch { return NextResponse.json({ ok: false, code: "INVALID_TAGS", error: "最多 20 个标签，每个不超过 40 字" }, { status: 400 }); }
  } else if (body.action === "add-comment" && typeof body.content === "string") {
    try {
      const comment = await addLibraryItemComment(id, body.content);
      return comment ? NextResponse.json({ ok: true, comment }) : NextResponse.json({ ok: false, code: "ITEM_NOT_FOUND" }, { status: 404 });
    } catch { return NextResponse.json({ ok: false, code: "INVALID_COMMENT", error: "评论需为 1–5000 字" }, { status: 400 }); }
  } else if (body.action === "delete-comment" && typeof body.commentId === "string" && UUID_PATTERN.test(body.commentId)) {
    updated = await deleteLibraryItemComment(id, body.commentId);
  } else {
    return NextResponse.json({ ok: false, code: "INVALID_ITEM_ACTION" }, { status: 400 });
  }

  return updated
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, code: "ITEM_NOT_FOUND" }, { status: 404 });
}
