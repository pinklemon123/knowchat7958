import { NextResponse } from "next/server";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { bulkUpdateLibraryItems } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const body = await request.json().catch(() => ({})) as { ids?: string[]; action?: string; collectionId?: string | null };
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])];
  if (!ids.length || ids.length > 500 || ids.some((id) => !UUID_PATTERN.test(id))) {
    return NextResponse.json({ ok: false, code: "INVALID_ITEM_IDS", error: "请选择 1–500 份有效资料" }, { status: 400 });
  }
  if (!(["archive", "move-collection", "trash"] as const).includes(body.action as "archive" | "move-collection" | "trash")) {
    return NextResponse.json({ ok: false, code: "INVALID_BULK_ACTION", error: "不支持的批量操作" }, { status: 400 });
  }
  if (body.action === "move-collection" && body.collectionId !== null && (typeof body.collectionId !== "string" || !UUID_PATTERN.test(body.collectionId))) {
    return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_ID", error: "分类无效" }, { status: 400 });
  }

  try {
    const updatedCount = await bulkUpdateLibraryItems(ids, body.action as "archive" | "move-collection" | "trash", body.collectionId ?? null);
    return NextResponse.json({ ok: true, updatedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "COLLECTION_NOT_FOUND") {
      return NextResponse.json({ ok: false, code: "COLLECTION_NOT_FOUND", error: "目标分类不存在" }, { status: 404 });
    }
    console.error("Bulk library update failed", error);
    return NextResponse.json({ ok: false, code: "BULK_UPDATE_FAILED", error: "批量操作失败" }, { status: 500 });
  }
}
