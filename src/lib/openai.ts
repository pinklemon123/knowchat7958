export function openAIEndpoint(path: string) {
  const rawBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.gpt.ge";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${baseUrl}/v1/${cleanPath}`;
}

export function configuredModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.5";
}
