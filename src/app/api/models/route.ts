import { NextResponse } from "next/server";
import { fallbackModels, isChatModel, splitModels } from "@/lib/model-capabilities";
import { openAIEndpoint } from "@/lib/openai";
import { selectedAIModel } from "@/lib/ai-settings";

export const runtime = "nodejs";

type ModelListResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export async function GET() {
  const apiKey = process.env.KNOWLEDGE_AI_API_KEY || process.env.OPENAI_API_KEY;
  const current = await selectedAIModel();

  if (!apiKey) {
    return NextResponse.json({ ...splitModels(fallbackModels), current, source: "fallback" });
  }

  try {
    const response = await fetch(openAIEndpoint("models"), {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Model list request failed: ${response.status}`);
    }

    const data = (await response.json()) as ModelListResponse;
    const apiModels = (data.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id && isChatModel(id)));
    const grouped = splitModels(apiModels.length ? apiModels : fallbackModels);

    return NextResponse.json({
      ...grouped,
      current,
      source: apiModels.length ? "api" : "fallback"
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    return NextResponse.json({
      ...splitModels(fallbackModels),
      current,
      source: "fallback",
      error: cause?.message || (error instanceof Error ? error.message : "Unable to load models")
    });
  }
}
