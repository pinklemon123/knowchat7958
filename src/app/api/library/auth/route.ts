import { NextResponse } from "next/server";
import {
  LIBRARY_SESSION_COOKIE,
  changeLibraryPassword,
  createLibrarySessionToken,
  isLibraryAuthConfigured,
  isLibraryRequestAuthenticated,
  sessionCookieOptions,
  setupLibraryPassword,
  verifyLibraryPassword
} from "@/lib/library-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failures = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isRateLimited(request: Request) {
  const entry = failures.get(clientKey(request));
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failures.delete(clientKey(request));
    return false;
  }
  return entry.count >= 5;
}

function recordFailure(request: Request) {
  const key = clientKey(request);
  const current = failures.get(key);
  failures.set(key, current && current.resetAt > Date.now()
    ? { ...current, count: current.count + 1 }
    : { count: 1, resetAt: Date.now() + 15 * 60_000 });
}

function sessionResponse(payload: Record<string, unknown>) {
  return createLibrarySessionToken().then((token) => {
    const response = NextResponse.json(payload);
    response.cookies.set(LIBRARY_SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  });
}

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    configured: await isLibraryAuthConfigured(),
    authenticated: await isLibraryRequestAuthenticated(request)
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { action?: string; password?: string; currentPassword?: string; newPassword?: string };

  if (body.action === "logout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(LIBRARY_SESSION_COOKIE, "", sessionCookieOptions(0));
    return response;
  }

  if (body.action === "setup") {
    try {
      await setupLibraryPassword(body.password || "");
      return sessionResponse({ ok: true, configured: true, authenticated: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "SETUP_FAILED";
      return NextResponse.json({ ok: false, code, error: code === "INVALID_PASSWORD_LENGTH" ? "密码长度需为 6–128 位" : "访问密码已经设置" }, { status: 400 });
    }
  }

  if (body.action === "login") {
    if (isRateLimited(request)) return NextResponse.json({ ok: false, code: "TOO_MANY_ATTEMPTS", error: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
    if (!(await verifyLibraryPassword(body.password || ""))) {
      recordFailure(request);
      return NextResponse.json({ ok: false, code: "INVALID_PASSWORD", error: "密码不正确" }, { status: 401 });
    }
    failures.delete(clientKey(request));
    return sessionResponse({ ok: true, authenticated: true });
  }

  if (body.action === "change-password") {
    if (!(await isLibraryRequestAuthenticated(request))) return NextResponse.json({ ok: false, code: "LIBRARY_AUTH_REQUIRED" }, { status: 401 });
    try {
      const changed = await changeLibraryPassword(body.currentPassword || "", body.newPassword || "");
      if (!changed) return NextResponse.json({ ok: false, code: "INVALID_PASSWORD", error: "当前密码不正确" }, { status: 401 });
      return sessionResponse({ ok: true, authenticated: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "PASSWORD_CHANGE_FAILED";
      return NextResponse.json({ ok: false, code, error: code === "INVALID_PASSWORD_LENGTH" ? "新密码长度需为 6–128 位" : "密码修改失败" }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: false, code: "INVALID_AUTH_ACTION" }, { status: 400 });
}
