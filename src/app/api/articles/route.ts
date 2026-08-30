import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { completeChat, sourceContext } from "@/lib/llm";
import { saveGeneratedArticle } from "@/lib/db";
import type { NewsResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = String(body.prompt ?? "").trim();
    const sources = (body.sources ?? []) as NewsResult[];
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const article = await completeChat(
      [
        {
          role: "system",
          content:
            "你是中文新闻编辑。请基于来源写一篇结构完整的文章，包含标题、导语、小标题、正文和引用来源。不要编造来源外事实。"
        },
        {
          role: "user",
          content: `写作要求：${prompt}\n\n来源：\n${sourceContext(sources)}`
        }
      ],
      0.45
    );

    const title = article.split("\n").find(Boolean)?.replace(/^#+\s*/, "").slice(0, 120) ?? "生成文章";
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("cg_anon")?.value;
    void saveGeneratedArticle(sessionId, title, article, sources.map((source) => source.url)).catch(() => undefined);

    return NextResponse.json({ title, article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Article generation failed" },
      { status: 500 }
    );
  }
}
