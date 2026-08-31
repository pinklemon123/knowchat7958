import { NextResponse } from "next/server";
import { deleteLibraryCollection, renameLibraryCollection } from "@/lib/library-collections";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown) {
  if ((error as { code?: string }).code === "23505") return NextResponse.json({ ok: false, code: "COLLECTION_EXISTS", error: "已经存在同名分类" }, { status: 409 });
  if ((error as Error).message === "INVALID_COLLECTION_NAME") return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_NAME", error: "分类名称需为 1–60 字" }, { status: 400 });
  console.error("Collection operation failed", error);
  return NextResponse.json({ ok: false, code: "COLLECTION_OPERATION_FAILED", error: "分类操作失败" }, { status: 500 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_ID" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { name?: string };
  try {
    if (typeof body.name !== "string") throw new Error("INVALID_COLLECTION_NAME");
    const collection = await renameLibraryCollection(id, body.name);
    return collection ? NextResponse.json({ ok: true, collection }) : NextResponse.json({ ok: false, code: "COLLECTION_NOT_FOUND" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_ID" }, { status: 400 });
  try {
    const deleted = await deleteLibraryCollection(id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, code: "COLLECTION_NOT_FOUND" }, { status: 404 });
  } catch (error) { return errorResponse(error); }
}
