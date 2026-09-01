"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  File,
  FileImage,
  FileText,
  FolderOpen,
  FolderInput,
  MoreHorizontal,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X
} from "lucide-react";
import styles from "./library-browser.module.css";

export type BrowserMode = "library" | "favorites" | "archive" | "trash" | "search";

type BrowserItem = {
  id: string;
  title: string;
  type: "document" | "image" | "webpage" | "other";
  description: string | null;
  location: "inbox" | "library" | "archive";
  starred: boolean;
  collectionId: string | null;
  collectionName: string | null;
  createdAt: string;
  lastActivityAt: string;
  primaryFileId: string | null;
  primaryFileName: string | null;
  primaryMimeType: string | null;
  primarySizeBytes: number | null;
  tags: string[];
};

const modeCopy: Record<BrowserMode, { eyebrow: string; title: string; description: string; empty: string }> = {
  library: { eyebrow: "LIBRARY", title: "文件库", description: "已经整理并进入资料库的文件。", empty: "文件库里还没有资料" },
  favorites: { eyebrow: "FAVORITES", title: "收藏", description: "你标记为重要、需要反复阅读的资料。", empty: "还没有收藏资料" },
  archive: { eyebrow: "ARCHIVE", title: "归档", description: "已经完成处理，但仍需保留的资料。", empty: "归档区是空的" },
  trash: { eyebrow: "TRASH", title: "回收站", description: "删除的资料暂时保留在这里，可随时恢复。", empty: "回收站是空的" },
  search: { eyebrow: "SEARCH", title: "搜索文件", description: "按文件名、说明、标签和评论查找资料。", empty: "没有找到匹配的资料" }
};

function itemIcon(item: BrowserItem) {
  if (item.type === "image") return <FileImage size={21} />;
  if (item.type === "document") return <FileText size={21} />;
  return <File size={21} />;
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

type Collection = { id:string; name:string; itemCount:number };
const PAGE_SIZE = 30;

export default function LibraryBrowser({ mode, initialQuery = "", initialCollectionId }: { mode: BrowserMode; initialQuery?: string; initialCollectionId?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<BrowserItem[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuItem, setMenuItem] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [draggingItem,setDraggingItem]=useState<string|null>(null);
  const [collections,setCollections]=useState<Collection[]>([]);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
  const [bulkBusy,setBulkBusy]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [totalCount,setTotalCount]=useState(0);
  const copy = modeCopy[mode];
  const selectedCollection=initialCollectionId?collections.find(collection=>collection.id===initialCollectionId):null;

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (mode === "library" && !initialCollectionId) params.set("location", "library");
    if (mode === "favorites") params.set("starred", "true");
    if (mode === "archive") params.set("location", "archive");
    if (mode === "trash") params.set("deleted", "true");
    if (mode === "search" && initialQuery.trim()) params.set("q", initialQuery.trim());
    if (mode === "library" && initialCollectionId) params.set("collection", initialCollectionId);
    return `/api/library?${params.toString()}`;
  }, [mode, initialQuery, initialCollectionId]);

  const loadItems = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}&offset=${offset}`, { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "无法读取资料");
      setItems((current) => offset === 0 ? data.items : [...current, ...data.items]);
      setHasMore(Boolean(data.hasMore));
      setTotalCount(Number(data.count ?? data.items.length));
      if (offset === 0) setSelectedIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法读取资料");
    } finally {
      if (offset === 0) setLoading(false); else setLoadingMore(false);
    }
  }, [endpoint]);

  useEffect(() => { void loadItems(0); }, [loadItems]);
  useEffect(()=>{const loadCollections=async()=>{try{const response=await fetch("/api/collections",{cache:"no-store"});const data=await response.json();if(data.ok)setCollections(data.collections)}catch{}};void loadCollections();const refresh=()=>{void loadItems();void loadCollections()};window.addEventListener("library:items-changed",refresh);window.addEventListener("library:collections-changed",refresh);return()=>{window.removeEventListener("library:items-changed",refresh);window.removeEventListener("library:collections-changed",refresh)}},[loadItems]);

  async function runAction(item: BrowserItem, action: "star" | "move" | "move-collection" | "trash" | "restore", payload: Record<string, unknown> = {}) {
    setBusyItem(item.id);
    setMenuItem(null);
    try {
      const response = await fetch(`/api/library/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      if (!response.ok) throw new Error("操作失败");
      await loadItems(0);
      if(action==="move-collection")window.dispatchEvent(new Event("library:collections-changed"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setBusyItem(null);
    }
  }

  function submitSearch() {
    const normalized = query.trim();
    if (normalized) router.push(`/search?q=${encodeURIComponent(normalized)}`);
  }

  function toggleSelected(id:string){setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function toggleAll(){setSelectedIds(items.length>0&&items.every(item=>selectedIds.has(item.id))?new Set():new Set(items.map(item=>item.id)))}
  async function runBulkAction(action:"archive"|"move-collection"|"trash",collectionId:string|null=null){const ids=[...selectedIds];if(!ids.length||bulkBusy)return;if(action==="trash"&&!window.confirm(`确定将选中的 ${ids.length} 份资料移到回收站吗？`))return;setBulkBusy(true);setError("");try{const response=await fetch("/api/library/bulk",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids,action,collectionId})});if(response.status===401){window.location.replace("/login");return}const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"批量操作失败");await loadItems(0);window.dispatchEvent(new Event("library:collections-changed"))}catch(actionError){setError(actionError instanceof Error?actionError.message:"批量操作失败")}finally{setBulkBusy(false)}}

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.searchBox}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} placeholder="搜索文件、分类或标签…" />{query && <button onClick={() => setQuery("")}><X size={15} /></button>}</div>
        <button className={styles.searchButton} onClick={submitSearch}>搜索</button>
      </header>
      <div className={styles.content}>
        <section className={styles.heading}><div><span>{selectedCollection?"COLLECTION":copy.eyebrow}</span><h1>{selectedCollection?.name||(initialCollectionId==="none"?"未分类":copy.title)}</h1><p>{selectedCollection?"拖动资料到左侧其他分类即可快速调整。":initialCollectionId==="none"?"尚未放入任何分类的资料。":mode === "search" && initialQuery ? `“${initialQuery}” 的搜索结果` : copy.description}</p></div><strong>{totalCount}<small>份资料</small></strong></section>

        {mode!=="trash"&&<section className={styles.bulkBar}><label><input type="checkbox" checked={items.length>0&&items.every(item=>selectedIds.has(item.id))} onChange={toggleAll}/><span>{selectedIds.size?`已选择 ${selectedIds.size} 项`:"全选当前已加载资料"}</span></label><div><button onClick={()=>void runBulkAction("archive")} disabled={!selectedIds.size||bulkBusy||mode==="archive"}><Archive size={14}/>批量归档</button><label><FolderInput size={14}/><select value="__choose__" onChange={event=>{const value=event.target.value;if(value!=="__choose__")void runBulkAction("move-collection",value||null)}} disabled={!selectedIds.size||bulkBusy}><option value="__choose__">移动到分类</option><option value="">未分类</option>{collections.map(collection=><option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label><button className={styles.bulkDanger} onClick={()=>void runBulkAction("trash")} disabled={!selectedIds.size||bulkBusy}><Trash2 size={14}/>批量删除</button></div></section>}

        <section className={styles.listSection}>
          <div className={`${styles.tableHeader} ${mode!=="trash"?styles.withSelection:""}`}>{mode!=="trash"&&<span/>}<span>名称</span><span>分类</span><span>位置</span><span>最近活动</span><span /></div>
          {loading && <div className={styles.empty}>正在读取资料库…</div>}
          {!loading && error && <div className={styles.empty}><strong>{error}</strong><button onClick={() => void loadItems()}>重试</button></div>}
          {!loading && !error && items.length === 0 && <div className={styles.empty}><FolderOpen size={39} /><strong>{copy.empty}</strong><span>{mode === "library" ? "待整理资料在 48 小时后会自动进入这里。" : "之后的资料会显示在这里。"}</span></div>}
          {!loading && !error && items.map((item) => (
            <article className={`${styles.row} ${mode!=="trash"?styles.withSelection:""} ${selectedIds.has(item.id)?styles.selectedRow:""} ${busyItem === item.id ? styles.busy : ""} ${draggingItem===item.id?styles.draggingRow:""}`} key={item.id} draggable={mode!=="trash"} onDragStart={event=>{setDraggingItem(item.id);event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-library-item-id",item.id);event.dataTransfer.setData("text/plain",item.id)}} onDragEnd={()=>setDraggingItem(null)}>
              {mode!=="trash"&&<label className={styles.rowCheck}><input type="checkbox" checked={selectedIds.has(item.id)} onChange={()=>toggleSelected(item.id)} aria-label={`选择 ${item.title}`}/><span/></label>}
              <div className={styles.nameCell}><span className={styles.fileIcon}>{itemIcon(item)}</span><div><Link href={`/item/${item.id}`}>{item.primaryFileName || item.title}</Link><small>{formatBytes(item.primarySizeBytes)}{item.tags.length ? ` · ${item.tags.slice(0, 2).join(" · ")}` : ""}</small></div></div>
              <span className={styles.collection}>{item.collectionName || "未分类"}</span>
              <span className={styles.location}>{item.location === "inbox" ? "待整理" : item.location === "archive" ? "归档" : "文件库"}</span>
              <time>{formatDate(item.lastActivityAt)}</time>
              <div className={styles.actions}>
                {mode !== "trash" && <button className={item.starred ? styles.starred : ""} onClick={() => void runAction(item, "star", { value: !item.starred })} title={item.starred ? "取消收藏" : "收藏"}><Star size={17} fill={item.starred ? "currentColor" : "none"} /></button>}
                {mode === "trash" ? <button onClick={() => void runAction(item, "restore")} title="恢复"><RotateCcw size={17} /></button> : <button onClick={() => setMenuItem(menuItem === item.id ? null : item.id)} title="更多操作"><MoreHorizontal size={18} /></button>}
                {menuItem === item.id && <div className={styles.actionMenu}>
                  <label className={styles.collectionMove}><FolderInput size={15}/><select value={item.collectionId||""} onChange={event=>void runAction(item,"move-collection",{collectionId:event.target.value||null})}><option value="">未分类</option>{collections.map(collection=><option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label>
                  {item.location !== "library" && <button onClick={() => void runAction(item, "move", { location: "library" })}><FolderOpen size={15} />移入文件库</button>}
                  {item.location !== "archive" && <button onClick={() => void runAction(item, "move", { location: "archive" })}><Archive size={15} />归档</button>}
                  <button className={styles.danger} onClick={() => void runAction(item, "trash")}><Trash2 size={15} />移到回收站</button>
                </div>}
              </div>
            </article>
          ))}
          {!loading&&!error&&hasMore&&<div className={styles.loadMore}><button onClick={()=>void loadItems(items.length)} disabled={loadingMore}>{loadingMore?"正在加载…":`加载更多（已显示 ${items.length}/${totalCount}）`}</button></div>}
        </section>
      </div>
    </div>
  );
}
