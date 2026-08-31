import { NextResponse } from "next/server";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { readHealthState, runSystemHealth, setAutoRepairEnabled } from "@/lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isScheduledRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  return NextResponse.json({ ok: true, state: await readHealthState() });
}

export async function POST(request: Request) {
  const scheduled = isScheduledRequest(request);
  if (!scheduled && !(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const result = await runSystemHealth(scheduled ? "scheduled" : "manual");
  return NextResponse.json({ ok: true, ...result });
}

export async function PUT(request: Request) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const body = await request.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ ok: false, error: "enabled 必须是布尔值" }, { status: 400 });
  return NextResponse.json({ ok: true, state: await setAutoRepairEnabled(body.enabled) });
}
