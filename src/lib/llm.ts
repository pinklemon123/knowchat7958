import type { ChatMessage, NewsResult } from "./types";
import { configuredModel, openAIEndpoint } from "./openai";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function completeChat(messages: ChatMessage[], temperature = 0.3, requestedModel?: string, maxTokens = 1800) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = requestedModel?.trim() || configuredModel();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(openAIEndpoint("chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Model request failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export function sourceContext(sources: NewsResult[]) {
  if (!sources.length) return "暂无联网来源。";
  return sources
    .map((source, index) => {
      return [
        `[${index + 1}] ${source.title}`,
        `URL: ${source.url}`,
        `来源: ${source.source ?? "unknown"}`,
        `时间: ${source.publishedDate ?? "unknown"}`,
        `摘要: ${source.content}`
      ].join("\n");
    })
    .join("\n\n");
}

export async function summarizeSources(query: string, sources: NewsResult[], tavilyAnswer?: string) {
  return completeChat(
    [
      {
        role: "system",
        content: "你是新闻研究助手。请基于来源材料生成中文摘要，避免编造信息。必要时使用 [1] 这样的编号引用来源。"
      },
      {
        role: "user",
        content: `用户问题：${query}\n\nTavily 初步回答：${tavilyAnswer ?? "无"}\n\n来源：\n${sourceContext(sources)}`
      }
    ],
    0.2,
    undefined,
    2200
  );
}
