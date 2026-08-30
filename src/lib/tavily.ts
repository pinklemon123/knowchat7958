import type { NewsResult } from "./types";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
  source?: string;
};

type TavilyResponse = {
  query?: string;
  answer?: string;
  results?: TavilyResult[];
  response_time?: string;
};

export async function searchTavily(query: string, maxResults = 8): Promise<{
  answer?: string;
  results: NewsResult[];
  responseTime?: string;
}> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not configured");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      topic: "news",
      search_depth: "basic",
      include_answer: "basic",
      include_raw_content: false,
      max_results: maxResults
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Tavily search failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const data = (await response.json()) as TavilyResponse;
  return {
    answer: data.answer,
    responseTime: data.response_time,
    results: (data.results ?? [])
      .filter((item): item is TavilyResult & { title: string; url: string } => Boolean(item.title && item.url))
      .map((item) => ({
        title: item.title,
        url: item.url,
        content: item.content ?? "",
        source: item.source ?? hostnameFromUrl(item.url),
        publishedDate: item.published_date,
        score: item.score
      }))
  };
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
