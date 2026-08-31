"use client";

import Link from "next/link";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Check, Folder, Pencil, Plus, Trash2, X } from "lucide-react";
import styles from "./library-shell.module.css";

type Collection = { id:string; name:string; itemCount:number };

export default function CollectionManager() {
  const [collections,setCollections]=useState<Collection[]>([]);
  const [adding,setAdding]=useState(false);
  const [newName,setNewName]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingName,setEditingName]=useState("");
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [dropTarget,setDropTarget]=useState<string|null>(null);
  const [error,setError]=useState("");

  async function loadCollections() {
    try {
      const response=await fetch("/api/collections",{cache:"no-store"});
      const data=await response.json();
      if(data.ok)setCollections(data.collections);
    } catch { /* The rest of the library remains usable while collections reload. */ }
  }

  useEffect(()=>{void loadCollections();const refresh=()=>void loadCollections();window.addEventListener("library:collections-changed",refresh);return()=>window.removeEventListener("library:collections-changed",refresh)},[]);

  function notifyChanged(){window.dispatchEvent(new Event("library:collections-changed"));}

  async function createCollection(event:FormEvent){event.preventDefault();if(!newName.trim())return;setError("");const response=await fetch("/api/collections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newName})});const data=await response.json();if(!response.ok){setError(data.error||"无法新建分类");return}setNewName("");setAdding(false);notifyChanged();}
  async function renameCollection(id:string){if(!editingName.trim())return;setError("");const response=await fetch(`/api/collections/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editingName})});const data=await response.json();if(!response.ok){setError(data.error||"无法重命名分类");return}setEditingId(null);notifyChanged();}
  async function deleteCollection(id:string){setError("");const response=await fetch(`/api/collections/${id}`,{method:"DELETE"});const data=await response.json();if(!response.ok){setError(data.error||"无法删除分类");return}setConfirmDelete(null);notifyChanged();}
  async function moveDroppedItem(event:DragEvent,id:string|null){event.preventDefault();setDropTarget(null);const itemId=event.dataTransfer.getData("application/x-library-item-id");if(!itemId)return;const response=await fetch(`/api/library/${itemId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"move-collection",collectionId:id})});if(!response.ok){setError("文件移动失败");return}notifyChanged();window.dispatchEvent(new Event("library:items-changed"));}

  return <>
    <div className={styles.collectionHeading}><span>分类</span><button type="button" title="新建分类" onClick={()=>{setAdding(true);setError("")}}><Plus size={15}/></button></div>
    {adding&&<form className={styles.collectionEditor} onSubmit={createCollection}><input autoFocus value={newName} onChange={event=>setNewName(event.target.value)} maxLength={60} placeholder="分类名称"/><button title="保存"><Check size={14}/></button><button type="button" title="取消" onClick={()=>{setAdding(false);setNewName("")}}><X size={14}/></button></form>}
    <div className={styles.categories}>
      <Link className={`${styles.uncategorized} ${dropTarget==="none"?styles.categoryDropTarget:""}`} href="/library?collection=none" title="拖到这里可移出分类" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="move";setDropTarget("none")}} onDragLeave={()=>setDropTarget(null)} onDrop={event=>void moveDroppedItem(event,null)}><Folder size={15}/><span>未分类</span></Link>
      {collections.map(collection=><div className={`${styles.categoryRow} ${dropTarget===collection.id?styles.categoryDropTarget:""}`} key={collection.id} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="move";setDropTarget(collection.id)}} onDragLeave={()=>setDropTarget(null)} onDrop={event=>void moveDroppedItem(event,collection.id)}>
        {editingId===collection.id?<div className={styles.collectionEditor}><input autoFocus value={editingName} onChange={event=>setEditingName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void renameCollection(collection.id);if(event.key==="Escape")setEditingId(null)}} maxLength={60}/><button title="保存" onClick={()=>void renameCollection(collection.id)}><Check size={14}/></button><button title="取消" onClick={()=>setEditingId(null)}><X size={14}/></button></div>:<><Link href={`/library?collection=${collection.id}`} title="可将文件拖到这里"><Folder size={15}/><span>{collection.name}</span><em>{collection.itemCount}</em></Link><div className={styles.categoryActions}>{confirmDelete===collection.id?<><button title="确认删除" onClick={()=>void deleteCollection(collection.id)}><Check size={13}/></button><button title="取消" onClick={()=>setConfirmDelete(null)}><X size={13}/></button></>:<><button title="重命名" onClick={()=>{setEditingId(collection.id);setEditingName(collection.name)}}><Pencil size={12}/></button><button title="删除分类（文件将变为未分类）" onClick={()=>setConfirmDelete(collection.id)}><Trash2 size={12}/></button></>}</div></>}
      </div>)}
    </div>
    {error&&<div className={styles.collectionError}>{error}</div>}
    {!collections.length&&!adding&&<div className={styles.collectionEmpty}>点击＋新建分类</div>}
  </>;
}
