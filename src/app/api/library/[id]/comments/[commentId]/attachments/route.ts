import { NextResponse } from "next/server";
import { attachImageToComment, CommentAttachmentError } from "@/lib/comment-attachments";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { deleteTempFile } from "@/lib/storage";
import { parseMultipartUpload, UploadError } from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMMENT_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id, commentId } = await context.params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(commentId)) {
    return NextResponse.json({ ok: false, code: "INVALID_ID" }, { status: 400 });
  }

  try {
    const upload = await parseMultipartUpload(request, { maxUploadBytes: MAX_COMMENT_IMAGE_BYTES, allowedFields: [] });
    try {
      const attachment = await attachImageToComment(id, commentId, upload);
      return NextResponse.json({ ok: true, attachment }, { status: 201 });
    } catch (error) {
      await deleteTempFile(upload.tempPath).catch(() => false);
      throw error;
    }
  } catch (error) {
    if (error instanceof UploadError) {
      const status = error.code === "FILE_TOO_LARGE" ? 413 : 400;
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status });
    }
    if (error instanceof CommentAttachmentError) {
      const status = error.code === "COMMENT_NOT_FOUND" ? 404 : error.code === "DUPLICATE_COMMENT_IMAGE" ? 409 : 400;
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status });
    }
    console.error("Comment image upload failed", error);
    return NextResponse.json({ ok: false, code: "COMMENT_IMAGE_UPLOAD_FAILED", error: "评论图片上传失败" }, { status: 500 });
  }
}
