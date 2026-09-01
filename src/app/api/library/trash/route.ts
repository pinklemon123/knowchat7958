import { NextResponse } from "next/server";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { emptyLibraryTrash, getLibraryTrashSummary } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  try {
    return NextResponse.json({ ok: true, summary: await getLibraryTrashSummary() });
  } catch (error) {
    console.error("Trash summary failed", error);
    return NextResponse.json({ ok: false, code: "TRASH_SUMMARY_FAILED", error: "无法读取回收站状态" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  try {
    const result = await emptyLibraryTrash();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Empty trash failed", error);
    return NextResponse.json({ ok: false, code: "EMPTY_TRASH_FAILED", error: "清空回收站失败，文件未被删除" }, { status: 500 });
  }
}
