import { NextResponse } from "next/server";
import { upsertNewsResults } from "@/lib/db";
import { searchTavily } from "@/lib/tavily";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const queries = (process.env.DEFAULT_NEWS_QUERIES ?? "AI news")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  const report = [];
  for (const query of queries) {
    const { results } = await searchTavily(query, 6);
    await upsertNewsResults(query, results);
    report.push({ query, count: results.length });
  }

  return NextResponse.json({ ok: true, report });
}
