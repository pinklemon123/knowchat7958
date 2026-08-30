import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "ChatGreen News",
  description: "联网新闻知识搜索、AI 聊天和文章生成"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
