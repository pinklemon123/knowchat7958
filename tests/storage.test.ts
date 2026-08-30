import assert from "node:assert/strict";
import path from "node:path";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import {
  buildStoragePath,
  ensureStorageDirectories,
  fileExists,
  getStorageDirectories,
  hashFile,
  moveIntoLibrary,
  safeResolveStoragePath
} from "../src/lib/storage.ts";

const projectRoot = process.cwd();
const fixturePath = path.join(projectRoot, "tests", "fixtures", "test.txt");
const runtimeRoot = path.join(projectRoot, "tests", "runtime", "storage-data");
const artifactsRoot = path.join(projectRoot, "tests", "artifacts");

if (!runtimeRoot.startsWith(path.join(projectRoot, "tests", "runtime") + path.sep)) {
  throw new Error("refusing to clean a runtime directory outside tests/runtime");
}

await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(artifactsRoot, { recursive: true });

process.env.LIBRARY_DATA_DIR = path.join(projectRoot, "data");
const projectDirectories = await ensureStorageDirectories();

process.env.LIBRARY_DATA_DIR = runtimeRoot;
const testDirectories = await ensureStorageDirectories();
const digest = await hashFile(fixturePath);
const relativePath = buildStoragePath(digest, ".txt");
const expectedAbsolutePath = safeResolveStoragePath(relativePath);

const firstTemp = path.join(testDirectories.temp, "first.upload");
await copyFile(fixturePath, firstTemp);
const firstStore = await moveIntoLibrary(firstTemp, digest, "txt");
assert.equal(firstStore.duplicate, false);
assert.equal(firstStore.relativePath, relativePath);
assert.equal(await fileExists(expectedAbsolutePath), true);
assert.equal((await stat(expectedAbsolutePath)).size, (await stat(fixturePath)).size);

const secondTemp = path.join(testDirectories.temp, "second.upload");
await copyFile(fixturePath, secondTemp);
const secondStore = await moveIntoLibrary(secondTemp, digest, "txt");
assert.equal(secondStore.duplicate, true);
assert.equal(await fileExists(secondTemp), false);

const tempBeforeError = await readdir(testDirectories.temp);
let missingFileError = "";
try {
  await hashFile(path.join(testDirectories.temp, "does-not-exist.upload"));
} catch (error) {
  missingFileError = (error as Error).message;
}
assert.ok(missingFileError);
const tempAfterError = await readdir(testDirectories.temp);
assert.deepEqual(tempAfterError, tempBeforeError);

assert.throws(() => safeResolveStoragePath("../outside.txt"), /unsafe|outside/);

const result = {
  projectDirectories,
  testDirectories,
  fixturePath,
  programSha256: digest,
  relativePath,
  absolutePath: expectedAbsolutePath,
  actualFileExists: await fileExists(expectedAbsolutePath),
  firstStoreDuplicate: firstStore.duplicate,
  secondStoreDuplicate: secondStore.duplicate,
  duplicateTempRemoved: !(await fileExists(secondTemp)),
  missingFileError,
  tempFilesAfterError: tempAfterError,
  pathTraversalRejected: true
};

const logPath = path.join(artifactsRoot, "storage-test.log");
await writeFile(logPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
