import { NextResponse } from "next/server";
import { listLibraryItems, promoteStaleInboxItems } from "@/lib/library";
import { libraryLocations, type LibraryItemFilters } from "@/lib/library-types";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function booleanParam(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function GET(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const url = new URL(request.url);
  const locationValue = url.searchParams.get("location");
  if (locationValue && !libraryLocations.includes(locationValue as (typeof libraryLocations)[number])) {
    return NextResponse.json({ ok: false, code: "INVALID_LOCATION" }, { status: 400 });
  }

  const starred = booleanParam(url.searchParams.get("starred"));
  if (starred === null) {
    return NextResponse.json({ ok: false, code: "INVALID_STARRED_FILTER" }, { status: 400 });
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
  const requestedCollection = url.searchParams.get("collection");
  if (requestedCollection && requestedCollection !== "none" && !UUID_PATTERN.test(requestedCollection)) {
    return NextResponse.json({ ok: false, code: "INVALID_COLLECTION_FILTER" }, { status: 400 });
  }
  const filters: LibraryItemFilters = {
    location: locationValue as LibraryItemFilters["location"],
    query: url.searchParams.get("q")?.trim() || undefined,
    starred,
    onlyDeleted: url.searchParams.get("deleted") === "true",
    collectionId: requestedCollection === "none" ? null : requestedCollection || undefined,
    limit: Number.isFinite(requestedLimit) ? requestedLimit : 50
  };

  try {
    if (locationValue === "inbox") await promoteStaleInboxItems();
    const items = await listLibraryItems(filters);
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (error) {
    console.error("Library list failed", error);
    return NextResponse.json(
      { ok: false, code: "LIBRARY_LIST_FAILED", error: "Unable to load the library" },
      { status: 500 }
    );
  }
}
