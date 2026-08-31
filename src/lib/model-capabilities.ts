export const fallbackModels = [
  "gpt-5.5",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-4o-all",
  "gpt-4-all",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5.1",
  "gpt-5.1-chat-latest",
  "gpt-5.2",
  "gpt-5.2-chat-latest",
  "gpt-5.4",
  "gpt-5.4-mini",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-search",
  "deepseek-chat",
  "deepseek-v3-search",
  "deepseek-reasoner",
  "deepseek-v3.2",
  "qwen-max-latest",
  "qwen-plus-latest",
  "qwen3.5-plus-search",
  "grok-4",
  "grok-4.1",
  "grok-3-deepsearch",
  "glm-4.6",
  "moonshot-v1-32k",
  "kimi-k2.6",
  "sonar",
  "sonar-pro"
];

const unavailableModels = new Set(["gpt-5-search-api"]);

const chatPrefixes = [
  "o1",
  "o3",
  "o4",
  "gpt-",
  "chatgpt-",
  "claude-",
  "cld-",
  "gemini-",
  "ge-",
  "deepseek-",
  "qwen",
  "qwq",
  "glm-",
  "grok-",
  "kimi-",
  "moonshot-",
  "llama-",
  "doubao-",
  "ernie-",
  "yi-",
  "sonar"
];

const nonChatMarkers = [
  "embedding",
  "rerank",
  "moderation",
  "image",
  "dall-e",
  "imagen",
  "flux",
  "kolors",
  "stable-diffusion",
  "seedream",
  "jimeng",
  "banana",
  "tts",
  "transcribe",
  "whisper",
  "voice",
  "audio",
  "realtime",
  "cosyvoice",
  "chattts",
  "fish-speech",
  "sensevoice",
  "video",
  "sora",
  "t2v",
  "i2v",
  "r2v",
  "s2v",
  "wan",
  "suno",
  "3d",
  "ppt",
  "ocr",
  "vl-ocr",
  "swap_face"
];

const webSearchMarkers = ["search", "deepsearch", "deepersearch", "sonar"];
const visionMarkers = ["vision", "vl", "internvl", "gpt-4o", "gpt-4.1", "gemini", "claude"];
const documentModelIds = ["gpt-4o-all", "gpt-4-all"];
const documentMarkers = ["pdf", "file", "document"];

export function isChatModel(model: string) {
  const id = model.toLowerCase();
  return (
    chatPrefixes.some((prefix) => id.startsWith(prefix)) &&
    !nonChatMarkers.some((marker) => id.includes(marker)) &&
    !unavailableModels.has(id)
  );
}

export function isWebSearchModel(model: string) {
  const id = model.toLowerCase();
  return isChatModel(model) && webSearchMarkers.some((marker) => id.includes(marker));
}

export function isVisionModel(model: string) {
  const id = model.toLowerCase();
  return isChatModel(model) && visionMarkers.some((marker) => id.includes(marker));
}

export function isDocumentModel(model: string) {
  const id = model.toLowerCase();
  return (
    isChatModel(model) &&
    (documentModelIds.includes(id) || documentMarkers.some((marker) => id.includes(marker)) || id.startsWith("claude-") || id.startsWith("gemini-"))
  );
}

export function splitModels(models: string[]) {
  const uniqueModels = Array.from(new Set(models.filter(isChatModel))).sort((a, b) => {
    if (a === "gpt-5.5") return -1;
    if (b === "gpt-5.5") return 1;
    return a.localeCompare(b);
  });
  const webModels = uniqueModels.filter(isWebSearchModel);
  return {
    models: uniqueModels,
    normalModels: uniqueModels.filter((model) => !isWebSearchModel(model)),
    webModels,
    visionModels: uniqueModels.filter(isVisionModel),
    documentModels: uniqueModels.filter(isDocumentModel)
  };
}
