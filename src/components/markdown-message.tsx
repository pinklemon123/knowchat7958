"use client";

import { Check, Copy } from "lucide-react";
import { Children, isValidElement, type ReactElement, type ReactNode, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MarkdownMessageProps = { content: string };
type CodeElementProps = { className?: string; children?: ReactNode };

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeElement = Children.only(children) as ReactElement<CodeElementProps>;
  const language = /language-([^\s]+)/.exec(codeElement.props.className ?? "")?.[1] ?? "code";
  const code = plainText(codeElement.props.children).replace(/\n$/, "");

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-head">
        <span>{language}</span>
        <button type="button" onClick={() => void copyCode()} aria-label="复制代码">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function normalizeMathDelimiters(content: string) {
  const fence = String.fromCharCode(96).repeat(3);

  return content
    .split(fence)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, equation: string) => "\n$$\n" + equation.trim() + "\n$$\n")
        .replace(/\\\((.+?)\\\)/g, (_match, equation: string) => "$" + equation.trim() + "$");
    })
    .join(fence);
}

const markdownComponents: Components = {
  pre: CodeBlock,
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  )
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <div className="message-text markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false }]]}
        components={markdownComponents}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
