import { readFile } from "node:fs/promises";

export const MAX_INDEXED_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_INDEXED_CHARACTERS = 200_000;
export const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "tsv", "xml", "html", "htm", "log", "yaml", "yml"]);

export function canExtractText(mimeType: string, extension: string | null, sizeBytes: number) {
  return sizeBytes <= MAX_INDEXED_TEXT_BYTES && (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    TEXT_EXTENSIONS.has((extension || "").toLowerCase())
  );
}

export async function extractTextForIndex(filePath: string, mimeType: string, extension: string | null, sizeBytes: number) {
  if (!canExtractText(mimeType, extension, sizeBytes)) return null;
  return (await readFile(filePath, "utf8")).replaceAll("\0", "").slice(0, MAX_INDEXED_CHARACTERS);
}
