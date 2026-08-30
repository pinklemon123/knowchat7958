"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  ImagePlus,
  MonitorPlay,
  RotateCcw,
  Search,
  X
} from "lucide-react";
import styles from "./recent.module.css";

type RecentItem = {
  id: string;
  title: string;
  type: "document" | "image" | "webpage" | "other";
  description: string | null;
  location: "inbox" | "library" | "archive";
  collectionName: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
  lastActivityAt: string;
  primaryFileId: string | null;
  primaryFileName: string | null;
  primaryMimeType: string | null;
  primarySizeBytes: number | null;
  tags: string[];
};

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "尚未打开";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function fileKind(item: RecentItem) {
  const mime = item.primaryMimeType || "";
  const name = (item.primaryFileName || item.title).toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (mime.startsWith("image/")) return "图片";
  if (mime.startsWith("audio/")) return "音频";
  if (mime.startsWith("video/")) return "视频";
  if (name.endsWith(".md")) return "Markdown";
  if (/\.(docx?|xlsx?|pptx?)$/.test(name)) return "Office";
  if (mime.startsWith("text/") || mime === "application/json") return "文本";
  return "文件";
}

function ItemIcon({ item, size = 21 }: { item: RecentItem; size?: number }) {
  const mime = item.primaryMimeType || "";
  if (mime.startsWith("image/")) return <FileImage size={size} />;
  if (mime.startsWith("audio/")) return <FileAudio size={size} />;
  if (mime.startsWith("video/")) return <FileVideo size={size} />;
  if (item.type === "document") return <FileText size={size} />;
  return <File size={size} />;
}

function Preview({ item }: { item: RecentItem }) {
  if (!item.primaryFileId) return <PreviewFallback label="这个条目没有可读取的文件" />;
  const source = `/api/files/${item.primaryFileId}/content`;
  const mime = item.primaryMimeType || "";
  const name = (item.primaryFileName || "").toLowerCase();

  if (mime.startsWith("image/")) return <img className={styles.previewImage} src={source} alt={item.title} />;
  if (mime === "application/pdf") return <iframe className={styles.previewFrame} src={source} title={item.title} />;
  if (mime.startsWith("video/")) return <video className={styles.previewMedia} src={source} controls />;
  if (mime.startsWith("audio/")) return <div className={styles.audioPreview}><FileAudio size={54} /><audio src={source} controls /></div>;
  if (mime.startsWith("text/") || mime === "application/json" || name.endsWith(".md")) {
    return <iframe className={styles.previewFrame} src={source} title={item.title} />;
  }
  return <PreviewFallback label="该格式需要服务器阅读组件" detail="Office 文件部署后可接入 OnlyOffice 或 Collabora；目前可以下载后用本机程序打开。" />;
}

function PreviewFallback({ label, detail }: { label: string; detail?: string }) {
  return <div className={styles.previewFallback}><MonitorPlay size={48} /><strong>{label}</strong>{detail && <span>{detail}</span>}</div>;
}

export default function RecentPage() {
  const coverInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<RecentItem[]>([]);
  const [selected, setSelected] = useState<RecentItem | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [coverVersion, setCoverVersion] = useState(() => Date.now());
  const [coverVisible, setCoverVisible] = useState(true);
  const [coverMessage, setCoverMessage] = useState("");

  const loadItems = useCallback(async () => {
    try {
      const response = await fetch("/api/library?limit=60", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [item.title, item.primaryFileName, item.collectionName, ...item.tags]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [items, query]);

  async function uploadCover(file?: globalThis.File) {
    if (!file) return;
    setCoverMessage("正在保存封面…");
    const form = new FormData();
    form.append("cover", file);
    const response = await fetch("/api/library/cover", { method: "POST", body: form });
    const data = await response.json();
    if (response.ok && data.ok) {
      setCoverVisible(true);
      setCoverVersion(Date.now());
      setCoverMessage("封面已保存到服务器");
    } else {
      setCoverMessage(data.error || "封面保存失败");
    }
    if (coverInput.current) coverInput.current.value = "";
  }

  async function resetCover() {
    await fetch("/api/library/cover", { method: "DELETE" });
    setCoverVisible(false);
    setCoverMessage("已恢复默认封面");
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.searchBox}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索最近资料…" />{query && <button onClick={() => setQuery("")}><X size={15} /></button>}</div>
        <span className={styles.localStatus}><i />本地资料库</span>
      </header>

      <div className={styles.content}>
        <section className={styles.cover}>
          <img
            className={`${styles.coverImage} ${coverVisible ? "" : styles.coverImageHidden}`}
            src={`/api/library/cover?v=${coverVersion}`}
            alt="最近页面自定义封面"
            onLoad={() => setCoverVisible(true)}
            onError={() => setCoverVisible(false)}
          />
          <div className={styles.coverShade} />
          <div className={styles.coverCopy}><span>RECENT LIBRARY</span><strong>回到最近读过的地方</strong><small>封面保存在服务器的数据目录中，换设备访问也能看到。</small></div>
          <div className={styles.coverActions}>
            <button onClick={() => coverInput.current?.click()}><ImagePlus size={16} />更换图片</button>
            <button onClick={() => void resetCover()}><RotateCcw size={15} />恢复默认</button>
          </div>
          <input ref={coverInput} className={styles.hiddenInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadCover(event.target.files?.[0])} />
        </section>
        {coverMessage && <div className={styles.coverMessage}>{coverMessage}</div>}

        <section className={styles.heading}>
          <div><span className={styles.eyebrow}>最近</span><h1>最近使用</h1><p>这里不直接铺开文件正文；选择一项后，再进入专用阅读层。</p></div>
          <div className={styles.readerPills}><span>PDF</span><span>图片</span><span>文本</span><span>音视频</span></div>
        </section>

        <section className={styles.recentSection}>
          <div className={styles.sectionTitle}><div><h2>最近活动</h2><span>{query ? `${filteredItems.length} 项匹配` : `${items.length} 份资料`}</span></div><small><Clock3 size={14} />按最后活动时间排序</small></div>
          {loading ? <div className={styles.emptyState}>正在读取最近资料…</div> : filteredItems.length === 0 ? (
            <div className={styles.emptyState}><Clock3 size={34} /><strong>{query ? "没有匹配的资料" : "还没有最近资料"}</strong><span>上传或打开文件后，它们会出现在这里。</span></div>
          ) : (
            <div className={styles.cardGrid}>{filteredItems.map((item) => (
              <button className={styles.fileCard} key={item.id} onClick={() => setSelected(item)}>
                <span className={styles.cardIcon}><ItemIcon item={item} /></span>
                <span className={styles.cardBody}><strong>{item.primaryFileName || item.title}</strong><small>{fileKind(item)} · {formatBytes(item.primarySizeBytes)}</small></span>
                <span className={styles.cardMeta}>{item.collectionName || "未分类"}<small>{formatDate(item.lastOpenedAt || item.lastActivityAt)}</small></span>
                <ArrowUpRight size={17} />
              </button>
            ))}</div>
          )}
        </section>

        <section className={styles.readerNote}>
          <MonitorPlay size={21} />
          <div><strong>服务器阅读能力</strong><span>当前原生支持 PDF、图片、文本、Markdown、音频和视频；Office 文档预留 OnlyOffice / Collabora 接口位置。</span></div>
        </section>
      </div>

      {selected && (
        <div className={styles.viewerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className={styles.viewer} role="dialog" aria-modal="true" aria-label={`查看 ${selected.title}`}>
            <header className={styles.viewerHeader}>
              <button onClick={() => setSelected(null)}><ArrowLeft size={18} />返回最近</button>
              <div>
                {selected.primaryFileId && <a href={`/api/files/${selected.primaryFileId}/content`} download><Download size={17} />下载</a>}
                <button className={styles.closeViewer} onClick={() => setSelected(null)} aria-label="关闭"><X size={19} /></button>
              </div>
            </header>
            <div className={styles.viewerLayout}>
              <div className={styles.previewPane}><Preview item={selected} /></div>
              <aside className={styles.detailPane}>
                <span className={styles.detailKind}>{fileKind(selected)}</span>
                <h2>{selected.primaryFileName || selected.title}</h2>
                <p>{selected.description || "这份资料还没有说明。阅读内容与资料信息分开，之后可在这里补充摘要、标签和 AI 阅读结果。"}</p>
                <dl>
                  <div><dt>分类</dt><dd>{selected.collectionName || "未分类"}</dd></div>
                  <div><dt>位置</dt><dd>{selected.location === "inbox" ? "待整理" : selected.location === "archive" ? "归档" : "文件库"}</dd></div>
                  <div><dt>大小</dt><dd>{formatBytes(selected.primarySizeBytes)}</dd></div>
                  <div><dt>最近活动</dt><dd>{formatDate(selected.lastActivityAt)}</dd></div>
                </dl>
                <div className={styles.detailTags}>{selected.tags.length ? selected.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>暂无标签</span>}</div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
