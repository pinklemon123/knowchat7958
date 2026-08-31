import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { getDataRoot } from "./storage";

export const LIBRARY_SESSION_COOKIE = "green_library_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type AuthConfig = {
  salt: string;
  passwordHash: string;
  sessionSecret: string;
  updatedAt: string;
};

function authPaths() {
  const directory = path.join(getDataRoot(), "auth");
  return {
    directory,
    config: path.join(directory, "library-auth.json"),
    temporary: path.join(directory, "library-auth.tmp")
  };
}

async function readConfig(): Promise<AuthConfig | null> {
  try {
    return JSON.parse(await readFile(authPaths().config, "utf8")) as AuthConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function saveConfig(config: AuthConfig) {
  const paths = authPaths();
  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.temporary, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(paths.temporary, paths.config);
}

function hashPassword(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32).toString("hex");
}

function safeEqualHex(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export async function isLibraryAuthConfigured() {
  return Boolean(await readConfig());
}

export async function setupLibraryPassword(password: string) {
  if ((await readConfig()) !== null) throw new Error("LIBRARY_AUTH_ALREADY_CONFIGURED");
  await writePasswordConfig(password);
}

async function writePasswordConfig(password: string) {
  if (password.length < 6 || password.length > 128) throw new Error("INVALID_PASSWORD_LENGTH");
  const salt = randomBytes(16);
  await saveConfig({
    salt: salt.toString("hex"),
    passwordHash: hashPassword(password, salt),
    sessionSecret: randomBytes(32).toString("hex"),
    updatedAt: new Date().toISOString()
  });
}

export async function verifyLibraryPassword(password: string) {
  const config = await readConfig();
  if (!config) return false;
  return safeEqualHex(hashPassword(password, Buffer.from(config.salt, "hex")), config.passwordHash);
}

export async function changeLibraryPassword(currentPassword: string, newPassword: string) {
  if (!(await verifyLibraryPassword(currentPassword))) return false;
  await writePasswordConfig(newPassword);
  return true;
}

export async function createLibrarySessionToken() {
  const config = await readConfig();
  if (!config) throw new Error("LIBRARY_AUTH_NOT_CONFIGURED");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export async function verifyLibrarySessionToken(token?: string | null) {
  if (!token) return false;
  const config = await readConfig();
  if (!config) return false;
  const [expiresText, nonce, signature, extra] = token.split(".");
  if (!expiresText || !nonce || !signature || extra) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", config.sessionSecret).update(`${expiresText}.${nonce}`).digest("hex");
  return safeEqualHex(signature, expected);
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.LIBRARY_SECURE_COOKIE === "true",
    path: "/",
    maxAge
  };
}

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const segment of cookieHeader.split(";")) {
    const [key, ...valueParts] = segment.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

export async function isLibraryRequestAuthenticated(request: Request) {
  return verifyLibrarySessionToken(cookieValue(request, LIBRARY_SESSION_COOKIE));
}

export function libraryUnauthorizedResponse() {
  return Response.json({ ok: false, code: "LIBRARY_AUTH_REQUIRED" }, { status: 401 });
}
