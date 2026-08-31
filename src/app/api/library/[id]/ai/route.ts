import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { getLibraryItem, listLibraryItemComments } from "@/lib/library";
import { getStoredFileRecord } from "@/lib/library-files";
import { safeResolveStoragePath } from "@/lib/storage";
import { completeChat } from "@/lib/llm";
import type { ChatMessage } from "@/lib/types";
import { selectedAIModel } from "@/lib/ai-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isLibraryRequestAuthenticated(request))) return libraryUnauthorizedResponse();
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ ok: false, code: "INVALID_ITEM_ID" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { question?: string; model?: string };
  const question = body.question?.trim() || "请总结这份资料，并给出 3–5 个建议标签。";
  if (question.length > 2000) return NextResponse.json({ ok: false, code: "QUESTION_TOO_LONG" }, { status: 400 });

  const item = await getLibraryItem(id);
  if (!item) return NextResponse.json({ ok: false, code: "ITEM_NOT_FOUND" }, { status: 404 });
  const comments = await listLibraryItemComments(id);
  const contextLines = [
    `标题：${item.title}`,
    `文件名：${item.primaryFileName || "无"}`,
    `类型：${item.primaryMimeType || item.type}`,
    `说明：${item.description || "无"}`,
    `标签：${item.tags.join("、") || "无"}`,
    `人工评论：${comments.map((comment) => comment.content).join("\n- ") || "无"}`
  ];

  const messages: ChatMessage[] = [{ role: "system", content: "你是个人知识库阅读助手。只根据提供的文件资料、元数据和人工评论回答；信息不足时明确说明，不要编造。回答使用简洁中文。" }];
  if (item.primaryFileId) {
    const file = await getStoredFileRecord(item.primaryFileId);
    if (file) {
      const absolutePath = safeResolveStoragePath(file.relativePath);
      if ((file.mimeType.startsWith("text/") || file.mimeType === "application/json" || file.originalName.toLowerCase().endsWith(".md")) && file.sizeBytes <= 2 * 1024 * 1024) {
        const text = (await readFile(absolutePath, "utf8")).slice(0, 60_000);
        contextLines.push(`文件正文：\n${text}`);
      } else if (file.mimeType.startsWith("image/") && file.sizeBytes <= 6 * 1024 * 1024) {
        const encoded = (await readFile(absolutePath)).toString("base64");
        messages.push({ role: "user", content: [{ type: "text", text: `${contextLines.join("\n")}\n\n问题：${question}` }, { type: "image_url", image_url: { url: `data:${file.mimeType};base64,${encoded}` } }] });
      } else {
        contextLines.push("文件正文：当前格式尚未在服务器端提取，回答只能依据元数据、标签和评论。");
      }
    }
  }
  if (messages.length === 1) messages.push({ role: "user", content: `${contextLines.join("\n")}\n\n问题：${question}` });

  try {
    const model = body.model?.trim() || await selectedAIModel();
    const answer = await completeChat(messages, 0.2, model, 1800);
    return NextResponse.json({ ok: true, answer, model });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "LIBRARY_AI_FAILED", error: error instanceof Error ? error.message : "AI request failed" }, { status: 502 });
  }
}
