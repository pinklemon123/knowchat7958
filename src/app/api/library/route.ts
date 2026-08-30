import { NextResponse } from "next/server";
import { listLibraryItems, promoteStaleInboxItems } from "@/lib/library";
import { libraryLocations, type LibraryItemFilters } from "@/lib/library-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function booleanParam(value: string | null) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export async function GET(request: Request) {
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
  const filters: LibraryItemFilters = {
    location: locationValue as LibraryItemFilters["location"],
    query: url.searchParams.get("q")?.trim() || undefined,
    starred,
    onlyDeleted: url.searchParams.get("deleted") === "true",
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
