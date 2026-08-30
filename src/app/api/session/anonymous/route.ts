import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAnonymousSession } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const current = cookieStore.get("cg_anon")?.value;
  const sessionId = current ?? crypto.randomUUID();

  if (!current) {
    cookieStore.set("cg_anon", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/"
    });
  }

  void createAnonymousSession(sessionId).catch(() => undefined);
  return NextResponse.json({ id: sessionId, displayName: "匿名访客" });
}
