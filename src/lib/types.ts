export type NewsResult = {
  title: string;
  url: string;
  content: string;
  source?: string;
  publishedDate?: string;
  score?: number;
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};
