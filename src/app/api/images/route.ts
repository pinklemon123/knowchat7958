import { NextResponse } from "next/server";
export const runtime = "nodejs";

type ImageRequest = {
  prompt?: string;
  imageDataUrl?: string;
  model?: string;
  size?: string;
  quality?: string;
};

type ImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }

  const [, mimeType, base64] = match;
  return new Blob([Buffer.from(base64, "base64")], { type: mimeType });
}

function imageResult(data: ImageResponse) {
  const first = data.data?.[0];
  if (!first) {
    throw new Error("Image response did not include data");
  }

  if (first.b64_json) {
    return { imageDataUrl: `data:image/png;base64,${first.b64_json}` };
  }

  if (first.url) {
    return { imageUrl: first.url };
  }

  throw new Error("Image response did not include an image");
}

function imageEndpoint(path: string) {
  const rawBaseUrl = process.env.IMAGE_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.gpt.ge";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${baseUrl}/v1/${cleanPath}`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.IMAGE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("IMAGE_OPENAI_API_KEY or OPENAI_API_KEY is not configured");
    }

    const body = (await request.json()) as ImageRequest;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const model = body.model?.trim() || (body.imageDataUrl ? "gpt-image-1" : "gpt-image-1.5");
    const size = body.size?.trim() || "1024x1024";
    const quality = body.quality?.trim() || "medium";

    let response: Response;

    if (body.imageDataUrl) {
      const form = new FormData();
      form.set("image", dataUrlToBlob(body.imageDataUrl), "source.png");
      form.set("prompt", prompt);
      form.set("model", model);
      form.set("n", "1");
      form.set("size", size);
      if (quality) form.set("quality", quality);

      response = await fetch(imageEndpoint("images/edits"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
        cache: "no-store",
      });
    } else {
      response = await fetch(imageEndpoint("images/generations"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          quality,
          size,
        }),
        cache: "no-store",
      });
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Image request failed: ${response.status} ${detail.slice(0, 240)}`);
    }

    const data = (await response.json()) as ImageResponse;
    return NextResponse.json({
      ...imageResult(data),
      model,
      size,
      quality,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 },
    );
  }
}
