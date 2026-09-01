"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useEffect, type DragEvent } from "react";
import {
  Archive,
  Check,
  File,
  FileImage,
  FileText,
  FolderInput,
  MoreHorizontal,
  Search,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import styles from "./inbox.module.css";

type InboxItem = {
  id: string;
  title: string;
  type: "document" | "image" | "webpage" | "other";
  collectionId: string | null;
  collectionName: string | null;
  createdAt: string;
  primaryFileId: string | null;
  primaryFileName: string | null;
  primaryMimeType: string | null;
  primarySizeBytes: number | null;
  tags: string[];
  starred: boolean;
};

type UploadTask = {
  id: string;
  fileName: string;
  progress: number;
  status: "queued" | "uploading" | "success" | "duplicate" | "error";
  message: string;
  existingItemId?: string;
};

type UploadResponse = {
  ok: boolean;
  code?: string;
  error?: string;
  existingItemId?: string;
};
type Collection = { id:string; name:string; itemCount:number };

function createClientId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(value >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
}

function formatRelativeTime(value: string) {
  const time = new Date(value).getTime();
  const difference = Date.now() - time;
  if (difference < 60_000) return "刚刚";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} 分钟前`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} 小时前`;
  if (difference < 172_800_000) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(time);
}

function fileLabel(item: InboxItem) {
  if (item.primaryMimeType === "application/pdf") return "PDF";
  if (item.type === "image") return "图片";
  if (item.primaryFileName?.toLowerCase().endsWith(".docx")) return "Word";
  if (item.primaryFileName?.toLowerCase().endsWith(".md")) return "Markdown";
  return item.type === "document" ? "文档" : "文件";
}

function sendUpload(file: globalThis.File, onProgress: (progress: number) => void) {
  return new Promise<{ status: number; data: UploadResponse }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    request.open("POST", "/api/files/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("网络连接失败"));
    request.onload = () => {
      try {
        resolve({ status: request.status, data: JSON.parse(request.responseText) as UploadResponse });
      } catch {
        reject(new Error("服务器返回了无法识别的结果"));
      }
    };
    request.send(form);
  });
}

export default function InboxPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [menuItem, setMenuItem] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [draggingItem,setDraggingItem]=useState<string|null>(null);
  const [collections,setCollections]=useState<Collection[]>([]);

  const loadItems = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/library?location=inbox&limit=100", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "无法读取待整理资料");
      setItems(data.items);
      window.dispatchEvent(new CustomEvent("library:inbox-count", { detail: Number(data.count ?? 0) }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取待整理资料");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);
  useEffect(()=>{const loadCollections=async()=>{try{const response=await fetch("/api/collections",{cache:"no-store"});const data=await response.json();if(data.ok)setCollections(data.collections)}catch{}};void loadCollections();const refresh=()=>{void loadItems();void loadCollections()};window.addEventListener("library:items-changed",refresh);window.addEventListener("library:collections-changed",refresh);return()=>{window.removeEventListener("library:items-changed",refresh);window.removeEventListener("library:collections-changed",refresh)}},[loadItems]);

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }, []);

  const uploadFiles = useCallback(async (fileList: FileList | globalThis.File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setNotice("");

    const newTasks = files.map((file) => ({
      id: createClientId(),
      fileName: file.name,
      progress: 0,
      status: "queued" as const,
      message: "等待上传"
    }));
    setTasks((current) => [...newTasks, ...current].slice(0, 8));

    let added = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const task = newTasks[index];
      updateTask(task.id, { status: "uploading", message: "正在写入临时目录…" });
      try {
        const result = await sendUpload(file, (progress) => updateTask(task.id, { progress }));
        if (result.status === 201 && result.data.ok) {
          added += 1;
          updateTask(task.id, { status: "success", progress: 100, message: "已添加到待整理" });
        } else if (result.status === 409 && result.data.code === "DUPLICATE_FILE") {
          updateTask(task.id, {
            status: "duplicate",
            progress: 100,
            message: "此文件已经存在于资料库",
            existingItemId: result.data.existingItemId
          });
        } else {
          updateTask(task.id, {
            status: "error",
            message: result.data.error || `上传失败（${result.status}）`
          });
        }
      } catch (error) {
        updateTask(task.id, { status: "error", message: error instanceof Error ? error.message : "上传失败" });
      }
    }

    if (added > 0) {
      setNotice(`已将 ${added} 份资料添加到待整理`);
      await loadItems();
    }
    if (fileInput.current) fileInput.current.value = "";
  }, [loadItems, updateTask]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.title, item.primaryFileName, item.collectionName, ...item.tags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [items, query]);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(event.dataTransfer.files);
  }

  function locateExisting(itemId?: string) {
    if (!itemId) return;
    const row = document.getElementById(`inbox-item-${itemId}`);
    if (row) {
      setFocusedItem(itemId);
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => setFocusedItem(null), 2200);
    } else {
      setNotice("已有资料不在当前待整理列表中，可在文件库开放后直接定位。");
    }
  }

  async function runItemAction(item: InboxItem, action: "star" | "move" | "move-collection" | "trash", payload: Record<string, unknown> = {}) {
    setBusyItem(item.id);
    setMenuItem(null);
    try {
      const response = await fetch(`/api/library/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      if (!response.ok) throw new Error("操作失败");
      await loadItems();
      if(action==="move-collection")window.dispatchEvent(new Event("library:collections-changed"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.searchBox}>
          <Search size={17} />
          <input
            aria-label="搜索待整理资料"
            placeholder="搜索名称、分类或标签…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X size={15} /></button>}
        </div>
        <div className={styles.account}>
          <span className={styles.statusDot} />
          <span>本地资料库</span>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.pageHeading}>
          <div>
            <span className={styles.eyebrow}>INBOX</span>
            <h1>待整理</h1>
            <p>最近上传但尚未归类的资料，48 小时后会自动进入普通资料库。</p>
          </div>
          <div className={styles.countCard}>
            <strong>{items.length}</strong>
            <span>份待整理资料</span>
          </div>
        </section>

        <section
          className={`${styles.uploadCard} ${dragging ? styles.uploadDragging : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={handleDrop}
        >
          <div className={styles.uploadIcon}><UploadCloud size={23} /></div>
          <div className={styles.uploadCopy}>
            <strong>{dragging ? "松开即可上传" : "上传资料"}</strong>
            <span className={styles.desktopUploadHelp}>拖放文件，或从电脑中选择 · PDF、图片、Word、Markdown</span>
            <span className={styles.mobileUploadHelp}>拖放文件，或从电脑中选择</span>
          </div>
          <div className={styles.uploadLimit}>单文件最大 100 MB</div>
          <button className={styles.chooseButton} type="button" onClick={() => fileInput.current?.click()}>
            选择文件
          </button>
          <input
            ref={fileInput}
            className={styles.hiddenInput}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.md,.txt,image/*"
            onChange={(event) => event.target.files && void uploadFiles(event.target.files)}
          />
        </section>

        {(tasks.length > 0 || notice) && (
          <section className={styles.uploadActivity} aria-live="polite">
            {notice && <div className={styles.notice}><Check size={16} />{notice}</div>}
            {tasks.map((task) => (
              <div className={`${styles.taskRow} ${styles[`task_${task.status}`]}`} key={task.id}>
                <div className={styles.taskIcon}>
                  {task.status === "success" ? <Check size={16} /> : task.status === "error" ? <X size={16} /> : <FileText size={16} />}
                </div>
                <div className={styles.taskBody}>
                  <div><strong>{task.fileName}</strong><span>{task.message}</span></div>
                  <div className={styles.progressTrack}><span style={{ width: `${task.progress}%` }} /></div>
                </div>
                {task.status === "duplicate" && (
                  <button type="button" onClick={() => locateExisting(task.existingItemId)}>定位已有资料</button>
                )}
              </div>
            ))}
          </section>
        )}

        <section className={styles.listSection}>
          <div className={styles.listHeading}>
            <div>
              <h2>待整理资料</h2>
              <span>{query ? `找到 ${filteredItems.length} 项` : "按最近活动排序"}</span>
            </div>
            <div className={styles.listHint}><Sparkles size={14} />文件优先，AI 工具稍后按需调用</div>
          </div>

          <div className={styles.tableHeader}>
            <span className={styles.checkCell} />
            <span>名称</span>
            <span>分类</span>
            <span>标签</span>
            <span>添加时间</span>
            <span />
          </div>

          {loading && <div className={styles.emptyState}>正在读取资料库…</div>}
          {!loading && loadError && <div className={styles.errorState}>{loadError}<button onClick={() => void loadItems()}>重试</button></div>}
          {!loading && !loadError && filteredItems.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><InboxGraphic /></div>
              <strong>{query ? "没有匹配的资料" : "待整理区现在很干净"}</strong>
              <span>{query ? "换一个关键词试试。" : "上传一份 PDF、图片或笔记，它会先出现在这里。"}</span>
            </div>
          )}

          {!loading && !loadError && filteredItems.map((item) => {
            const isImage = item.type === "image" && item.primaryFileId;
            return (
              <article
                className={`${styles.fileRow} ${focusedItem === item.id ? styles.focusedRow : ""} ${busyItem === item.id ? styles.busyRow : ""} ${draggingItem===item.id?styles.draggingFileRow:""}`}
                id={`inbox-item-${item.id}`}
                key={item.id}
                draggable
                onDragStart={event=>{setDraggingItem(item.id);event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-library-item-id",item.id);event.dataTransfer.setData("text/plain",item.id)}}
                onDragEnd={()=>setDraggingItem(null)}
              >
                <label className={styles.checkbox}><input type="checkbox" aria-label={`选择 ${item.title}`} /><span /></label>
                <div className={styles.nameCell}>
                  {isImage ? (
                    <img className={styles.thumbnail} src={`/api/files/${item.primaryFileId}/content`} alt="" />
                  ) : (
                    <span className={styles.fileIcon}>
                      {item.type === "image" ? <FileImage size={19} /> : item.type === "document" ? <FileText size={19} /> : <File size={19} />}
                    </span>
                  )}
                  <div>
                    <Link href={`/item/${item.id}`}>{item.primaryFileName || item.title}</Link>
                    <small>{fileLabel(item)} · {formatBytes(item.primarySizeBytes)}</small>
                  </div>
                </div>
                <div className={styles.collectionCell}>{item.collectionName || <span>未分类</span>}</div>
                <div className={styles.tagsCell}>
                  {item.tags.length ? item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>) : <em>—</em>}
                </div>
                <time className={styles.timeCell} dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
                <div className={styles.rowActions}>
                  <button className={item.starred ? styles.starred : ""} type="button" title={item.starred ? "取消收藏" : "收藏"} aria-label="收藏" onClick={() => void runItemAction(item, "star", { value: !item.starred })}><Star size={17} fill={item.starred ? "currentColor" : "none"} /></button>
                  <button type="button" title="更多操作" aria-label="更多操作" onClick={() => setMenuItem(menuItem === item.id ? null : item.id)}><MoreHorizontal size={18} /></button>
                  {menuItem === item.id && <div className={styles.actionMenu}>
                    <label className={styles.collectionMove}><FolderInput size={15}/><select value={item.collectionId||""} onChange={event=>void runItemAction(item,"move-collection",{collectionId:event.target.value||null})}><option value="">未分类</option>{collections.map(collection=><option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label>
                    <button onClick={() => void runItemAction(item, "move", { location: "library" })}><FileText size={15} />移入文件库</button>
                    <button onClick={() => void runItemAction(item, "move", { location: "archive" })}><Archive size={15} />归档</button>
                    <button className={styles.dangerAction} onClick={() => void runItemAction(item, "trash")}><Trash2 size={15} />移到回收站</button>
                  </div>}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function InboxGraphic() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M9 14.5h30l4 14v7.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7.5l4-14Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 29h10l3 5h12l3-5h10M15 9h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
