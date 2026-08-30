"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import "./styles.css";

type ImageMode = "text" | "edit";

type ImageResponse = {
  imageDataUrl?: string;
  imageUrl?: string;
  error?: string;
};

type AttachedImage = {
  dataUrl: string;
  name: string;
};

const promptSamples = [
  "一张未来城市里的绿色能源新闻封面，真实摄影风格，清晰细节",
  "一个透明玻璃温室中的 AI 助手，柔和自然光，产品海报风格",
  "把画面改成夜晚赛博朋克风格，保留主体构图，增加霓虹灯"
];

function resizeImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法读取图片"));
      image.onload = () => {
        const maxSize = 1280;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("当前浏览器无法处理图片"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function ImagesPage() {
  const [mode, setMode] = useState<ImageMode>("text");
  const [prompt, setPrompt] = useState(promptSamples[0]);
  const [model, setModel] = useState("gpt-image-1.5");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("medium");
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [resultImage, setResultImage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    if (!prompt.trim() || loading) return false;
    return mode === "text" || Boolean(attachedImage);
  }, [attachedImage, loading, mode, prompt]);

  async function attachImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError("图片不能超过 12MB。");
      return;
    }

    try {
      const dataUrl = await resizeImage(file);
      setAttachedImage({ dataUrl, name: file.name });
      setMode("edit");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片读取失败。");
    }
  }

  async function generateImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    setResultImage("");

    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageDataUrl: mode === "edit" ? attachedImage?.dataUrl : undefined,
          model,
          size,
          quality
        })
      });
      const data = (await response.json()) as ImageResponse;
      const image = data.imageDataUrl || data.imageUrl;
      if (!response.ok || !image) {
        throw new Error(data.error || `生成失败：${response.status}`);
      }
      setResultImage(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片生成失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="image-studio">
      <header className="image-header">
        <div>
          <span>ChatGreen Images</span>
          <h1>图片生成</h1>
          <p>单独的文生图和图生图工作台，不影响原聊天页。</p>
        </div>
        <Link href="/" className="image-link">
          返回 ChatGreen
        </Link>
      </header>

      <section className="image-layout">
        <form className="image-panel image-form" onSubmit={generateImage}>
          <div className="mode-tabs">
            <button type="button" className={mode === "text" ? "selected" : ""} onClick={() => setMode("text")}>
              <Sparkles size={18} /> 文生图
            </button>
            <button type="button" className={mode === "edit" ? "selected" : ""} onClick={() => setMode("edit")}>
              <Wand2 size={18} /> 图生图
            </button>
          </div>

          <label className="field">
            <span>提示词</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="sample-row">
            {promptSamples.map((sample) => (
              <button type="button" key={sample} onClick={() => setPrompt(sample)}>
                {sample}
              </button>
            ))}
          </div>

          <div className="settings-grid">
            <label className="field">
              <span>模型</span>
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                <option value="gpt-image-1.5">gpt-image-1.5</option>
                <option value="gpt-image-1">gpt-image-1</option>
              </select>
            </label>
            <label className="field">
              <span>尺寸</span>
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="1024x1024">1024 x 1024</option>
                <option value="1024x1536">1024 x 1536</option>
                <option value="1536x1024">1536 x 1024</option>
              </select>
            </label>
            <label className="field">
              <span>质量</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                <option value="medium">medium</option>
                <option value="low">low</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>

          <div className="upload-box">
            {attachedImage ? (
              <>
                <img src={attachedImage.dataUrl} alt={attachedImage.name} />
                <div>
                  <strong>{attachedImage.name}</strong>
                  <span>图生图会使用这张图片作为输入。</span>
                </div>
                <button type="button" aria-label="移除图片" onClick={() => setAttachedImage(null)}>
                  <Trash2 size={16} />
                </button>
              </>
            ) : (
              <label>
                <ImagePlus size={22} />
                <strong>上传图片做图生图</strong>
                <span>支持 PNG、JPG、WebP，最大 12MB。</span>
                <input type="file" accept="image/*" onChange={(event) => void attachImage(event)} />
              </label>
            )}
          </div>

          {error ? <p className="image-error">{error}</p> : null}

          <button className="generate-button" type="submit" disabled={!canSubmit}>
            {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            {mode === "edit" ? "生成编辑图" : "生成图片"}
          </button>
        </form>

        <section className="image-panel preview-panel">
          {resultImage ? (
            <>
              <img className="result-image" src={resultImage} alt="生成结果" />
              <a className="download-button" href={resultImage} download="chatgreen-image.png">
                <Download size={18} /> 下载图片
              </a>
            </>
          ) : (
            <div className="preview-empty">
              <ImagePlus size={42} />
              <strong>{loading ? "正在生成图片" : "生成结果会显示在这里"}</strong>
              <span>{mode === "edit" ? "上传图片并输入修改要求。" : "输入提示词即可开始文生图。"}</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
