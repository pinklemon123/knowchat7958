import { NextResponse } from "next/server";
import { completeChat, sourceContext } from "@/lib/llm";
import { isWebSearchModel } from "@/lib/model-capabilities";
import { searchTavily } from "@/lib/tavily";
import type { ChatMessage, NewsResult } from "@/lib/types";
import { selectedAIModel } from "@/lib/ai-settings";

export const runtime = "nodejs";

type IncomingChatMessage = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
  documentName?: string;
  documentContent?: string;
  documentDataUrl?: string;
  documentType?: string;
};

function toChatMessage(message: IncomingChatMessage, model: string): ChatMessage {
  if (message.role === "user" && message.documentDataUrl) {
    if (!model.toLowerCase().startsWith("gemini-")) {
      throw new Error("本地 PDF 文件请使用 Gemini 文档模型；gpt-4o-all、gpt-4-all 和 Claude 的当前文档协议需要公网文件 URL。");
    }
    if (!/^data:(application\/pdf|text\/plain);base64,/.test(message.documentDataUrl)) {
      throw new Error("当前仅支持上传 PDF 或 TXT 文档。");
    }
    if (message.documentDataUrl.length > 15_000_000) {
      throw new Error("文档编码后超过 15 MB，请压缩或拆分后重试。");
    }

    return {
      role: "user",
      content: [
        { type: "text", text: message.content || "请阅读并总结这份文档。" },
        {
          type: "file",
          file: {
            filename: message.documentName ?? "document.pdf",
            file_data: message.documentDataUrl
          }
        }
      ]
    };
  }

  if (message.role === "user" && message.documentContent) {
    const documentHeader = [
      `用户上传文档：${message.documentName ?? "未命名文档"}`,
      "请把下面文档内容作为本轮和后续问题的资料来源。",
      "```text",
      message.documentContent,
      "```"
    ].join("\n");

    return {
      role: "user",
      content: `${message.content || "请阅读并总结这份文档。"}\n\n${documentHeader}`
    };
  }

  if (message.role === "user" && message.imageDataUrl) {
    return {
      role: "user",
      content: [
        {
          type: "text",
          text: message.content || "请分析这张图片。"
        },
        {
          type: "image_url",
          image_url: {
            url: message.imageDataUrl
          }
        }
      ]
    };
  }

  return {
    role: message.role,
    content: message.content
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incomingMessages = (body.messages ?? []) as IncomingChatMessage[];
    const webSearch = body.webSearch !== false;
    const model = typeof body.model === "string" ? body.model : await selectedAIModel();
    const messages = incomingMessages.map((message) => toChatMessage(message, model));
    const nativeWebSearch = webSearch && Boolean(model && isWebSearchModel(model));
    const hasImages = incomingMessages.some((message) => Boolean(message.imageDataUrl));
    const hasDocuments = body.documentMode === true || incomingMessages.some((message) => Boolean(message.documentContent || message.documentDataUrl));
    const lastUser = [...incomingMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    let sources: NewsResult[] = [];

    if (webSearch && lastUser && !nativeWebSearch && !hasImages && !hasDocuments) {
      sources = (await searchTavily(lastUser, 10)).results;
    }

    const formatInstruction =
      "请使用清晰的 Markdown 组织回答：较长回答使用层级标题，代码必须使用带语言标识的围栏代码块；数学公式使用 LaTeX，行内公式用 \\( ... \\)，独立公式用 $$ ... $$。不要为了格式滥用标题。";
    const withFormatting = (instruction: string) => instruction + "\n\n" + formatInstruction;

    const system: ChatMessage = {
      role: "system",
      content: withFormatting(hasImages
        ? "你是 ChatGreen 的图片理解助手。请根据用户上传的图片回答问题；如果不确定，明确说明不确定。"
        : hasDocuments
        ? "你是 ChatGreen 的文档阅读助手。请完整读取用户上传的本地文件或给出的文件 URL，优先基于文档内容回答并引用页码、章节或原文依据；如果文档中没有依据，要明确说明。"
        : nativeWebSearch
        ? "你是 ChatGreen 的联网研究助手。当前模型具备内置联网能力，回答时优先检索最新信息，并尽量给出来源名称和 URL。"
        : "你是 ChatGreen 的新闻与知识助手。回答要完整、准确；如果提供了来源材料，优先基于来源材料回答，并在必要时引用来源编号。")
    };

    const context: ChatMessage = {
      role: "user",
      content: withFormatting(hasImages
        ? "用户可能上传了图片。请优先分析图片内容，再结合用户文字回答。"
        : hasDocuments
        ? "用户可能上传了文档。请把文档作为主要上下文，直接回答用户问题。"
        : nativeWebSearch
        ? "请直接使用模型内置联网能力回答用户问题。"
        : `联网搜索来源：\n${sourceContext(sources)}\n\n回答末尾请保留“来源链接”小节，列出实际使用的来源编号、标题和 URL。`)
    };

    const message = await completeChat([system, context, ...messages.slice(-8)], 0.35, model, 4200);

    return NextResponse.json({
      message,
      sources,
      model,
      nativeWebSearch
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
