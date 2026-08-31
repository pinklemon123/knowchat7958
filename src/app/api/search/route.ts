import { NextResponse } from "next/server";
import { upsertNewsResults, searchCachedNews } from "@/lib/db";
import { summarizeSources } from "@/lib/llm";
import { searchTavily } from "@/lib/tavily";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = String(body.query ?? "").trim();
    const online = body.online !== false;
    const summarize = body.summarize !== false;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    if (online && !process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        { error: "联网搜索尚未配置，请在服务器环境中设置 TAVILY_API_KEY", code: "SEARCH_NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    let answer: string | undefined;
    let results = [];
    let responseTime: string | undefined;
    let cached = false;

    if (online) {
      const tavily = await searchTavily(query);
      answer = tavily.answer;
      results = tavily.results;
      responseTime = tavily.responseTime;
      void upsertNewsResults(query, results).catch(() => undefined);
    } else {
      results = await searchCachedNews(query);
      cached = true;
    }

    const summary = summarize ? await summarizeSources(query, results, answer) : undefined;
    return NextResponse.json({ query, answer, summary, results, responseTime, cached });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
