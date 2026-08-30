import { NextResponse } from "next/server";
import { createLibraryItemFromUpload, LibraryUploadValidationError } from "@/lib/library-write";
import { parseMultipartUpload, UploadError } from "@/lib/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uploadErrorStatus(error: UploadError) {
  if (error.code === "FILE_TOO_LARGE") return 413;
  return 400;
}

export async function POST(request: Request) {
  try {
    const upload = await parseMultipartUpload(request);
    const result = await createLibraryItemFromUpload(upload);

    if (result.duplicate) {
      return NextResponse.json(
        {
          ok: false,
          code: "DUPLICATE_FILE",
          existingItemId: result.existingItemId
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item: result.item,
        file: result.file
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: uploadErrorStatus(error) }
      );
    }
    if (error instanceof LibraryUploadValidationError) {
      return NextResponse.json(
        { ok: false, code: "INVALID_UPLOAD_METADATA", error: error.message },
        { status: 400 }
      );
    }

    console.error("File upload failed", error);
    const databaseUnavailable = error instanceof Error && error.message.includes("DATABASE_URL");
    return NextResponse.json(
      {
        ok: false,
        code: databaseUnavailable ? "DATABASE_UNAVAILABLE" : "UPLOAD_FAILED",
        error: databaseUnavailable ? "Database is not configured" : "File upload failed"
      },
      { status: databaseUnavailable ? 503 : 500 }
    );
  }
}
