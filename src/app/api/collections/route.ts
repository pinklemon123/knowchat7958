import { NextResponse } from "next/server";
import { createLibraryCollection, listLibraryCollections } from "@/lib/library-collections";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function collectionError(error: unknown) {
  if ((error as { code?: string }).code === "23505") {
    return NextResponse.json({ ok: false, code: "COLLECTION_EXISTS", error: "已经存在同名分类" }, { status: 409 });
  }
  if ((error as Error).message === "INVALID_COLLECTION_NAME") {
    return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_NAME", error: "分类名称需为 1–60 字" }, { status: 400 });
  }
  console.error("Collection operation failed", error);
  return NextResponse.json({ ok: false, code: "COLLECTION_OPERATION_FAILED", error: "分类操作失败" }, { status: 500 });
}

export async function GET(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  try {
    const collections = await listLibraryCollections();
    return NextResponse.json({ ok: true, collections });
  } catch (error) { return collectionError(error); }
}

export async function POST(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const body = await request.json().catch(() => ({})) as { name?: string };
  try {
    if (typeof body.name !== "string") throw new Error("INVALID_COLLECTION_NAME");
    const collection = await createLibraryCollection(body.name);
    return NextResponse.json({ ok: true, collection }, { status: 201 });
  } catch (error) { return collectionError(error); }
}
