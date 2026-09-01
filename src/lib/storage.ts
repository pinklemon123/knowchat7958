import { constants } from "node:fs";
import { copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type StorageArea = "library" | "temp" | "trash";

export type StorageDirectories = {
  root: string;
  library: string;
  temp: string;
  trash: string;
};

export type StoredFileResult = {
  absolutePath: string;
  relativePath: string;
  duplicate: boolean;
};

export type StagedStoredFile = {
  originalRelativePath: string;
  trashRelativePath: string;
};

export function getDataRoot() {
  const configured = process.env.LIBRARY_DATA_DIR?.trim() || "./data";
  return path.resolve(process.cwd(), configured);
}

export function getStorageDirectories(): StorageDirectories {
  const root = getDataRoot();
  return {
    root,
    library: path.join(root, "library"),
    temp: path.join(root, "temp"),
    trash: path.join(root, "trash")
  };
}

export async function ensureStorageDirectories() {
  const directories = getStorageDirectories();
  await Promise.all([
    mkdir(directories.library, { recursive: true }),
    mkdir(directories.temp, { recursive: true }),
    mkdir(directories.trash, { recursive: true })
  ]);
  return directories;
}

export async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function normalizeExtension(extension?: string) {
  if (!extension) return "";
  const normalized = extension.trim().toLowerCase().replace(/^\.+/, "");
  if (!/^[a-z0-9]{1,16}$/.test(normalized)) return "";
  return normalized;
}

export function buildStoragePath(sha256: string, extension?: string) {
  const normalizedHash = sha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalizedHash)) {
    throw new Error("sha256 must be a 64-character lowercase hexadecimal value");
  }

  const normalizedExtension = normalizeExtension(extension);
  const fileName = normalizedExtension ? `${normalizedHash}.${normalizedExtension}` : normalizedHash;
  return path.posix.join(normalizedHash.slice(0, 2), fileName);
}

export function safeResolveStoragePath(relativePath: string, area: StorageArea = "library") {
  if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath)) {
    throw new Error("storage path must be a non-empty relative path");
  }

  const segments = relativePath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("storage path contains an unsafe segment");
  }

  const root = getStorageDirectories()[area];
  const resolved = path.resolve(root, ...segments);
  const relativeToRoot = path.relative(root, resolved);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("storage path resolves outside its storage area");
  }
  return resolved;
}

function isPathWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function deleteTempFile(tempFilePath: string) {
  const directories = getStorageDirectories();
  const resolvedTempPath = path.resolve(tempFilePath);
  if (!isPathWithin(directories.temp, resolvedTempPath)) {
    throw new Error("temporary file must be inside the configured temp directory");
  }
  try {
    await unlink(resolvedTempPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function moveIntoLibrary(tempFilePath: string, sha256: string, extension?: string): Promise<StoredFileResult> {
  const directories = await ensureStorageDirectories();
  const resolvedTempPath = path.resolve(tempFilePath);
  if (!isPathWithin(directories.temp, resolvedTempPath)) {
    throw new Error("temporary file must be inside the configured temp directory");
  }

  const relativePath = buildStoragePath(sha256, extension);
  const absolutePath = safeResolveStoragePath(relativePath, "library");
  await mkdir(path.dirname(absolutePath), { recursive: true });

  try {
    await copyFile(resolvedTempPath, absolutePath, constants.COPYFILE_EXCL);
    await unlink(resolvedTempPath);
    return { absolutePath, relativePath, duplicate: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      await unlink(resolvedTempPath);
      return { absolutePath, relativePath, duplicate: true };
    }
    throw error;
  }
}

export async function stageStoredFileForDeletion(relativePath: string): Promise<StagedStoredFile | null> {
  await ensureStorageDirectories();
  const sourcePath = safeResolveStoragePath(relativePath, "library");
  const trashRelativePath = path.posix.join(`purge-${randomUUID()}`, relativePath.replaceAll("\\", "/"));
  const trashPath = safeResolveStoragePath(trashRelativePath, "trash");
  await mkdir(path.dirname(trashPath), { recursive: true });

  try {
    await rename(sourcePath, trashPath);
    return { originalRelativePath: relativePath, trashRelativePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function restoreStagedStoredFile(staged: StagedStoredFile) {
  const trashPath = safeResolveStoragePath(staged.trashRelativePath, "trash");
  const originalPath = safeResolveStoragePath(staged.originalRelativePath, "library");
  await mkdir(path.dirname(originalPath), { recursive: true });
  await rename(trashPath, originalPath);
}

export async function deleteStoredFile(relativePath: string, area: StorageArea = "library") {
  const absolutePath = safeResolveStoragePath(relativePath, area);
  try {
    await unlink(absolutePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
