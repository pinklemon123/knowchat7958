"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Bot, Download, FileImage, FileQuestion, FolderInput, ImagePlus, MessageSquare, Plus, Send, Tag, Trash2, X } from "lucide-react";
import styles from "./item-detail.module.css";

type Item = { id:string; title:string; description:string|null; location:"inbox"|"library"|"archive"; collectionId:string|null; collectionName:string|null; primaryFileId:string|null; primaryFileName:string|null; primaryMimeType:string|null; primarySizeBytes:number|null; tags:string[]; lastActivityAt:string };
type Collection = { id:string; name:string; itemCount:number };
type CommentAttachment = { id:string; fileId:string; originalName:string; mimeType:string; sizeBytes:number; contentUrl:string };
type Comment = { id:string; content:string; createdAt:string; updatedAt:string; attachments:CommentAttachment[] };

const LINK_PATTERN = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+)/gi;

function safeHttpUrl(value:string) {
  try { const url=new URL(value); return url.protocol==="http:"||url.protocol==="https:"?url.toString():null; }
  catch { return null; }
}

function renderCommentContent(content:string):ReactNode[] {
  return content.split(LINK_PATTERN).filter(Boolean).map((part,index)=>{
    const markdown=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
    const href=safeHttpUrl(markdown?.[2]||part);
    if(!href)return part;
    return <a className={styles.commentLink} href={href} target="_blank" rel="noopener noreferrer nofollow" key={`${href}-${index}`}>{markdown?.[1]||part}</a>;
  });
}

function Preview({ item }: { item: Item }) {
  if (!item.primaryFileId) return <div className={styles.previewEmpty}><FileQuestion size={45}/><span>没有可预览文件</span></div>;
  const source=`/api/files/${item.primaryFileId}/content`;
  const mime=item.primaryMimeType||"";
  if(mime.startsWith("image/")) return <img className={styles.previewImage} src={source} alt={item.title}/>;
  if(mime==="application/pdf"||mime.startsWith("text/")||mime==="application/json"||(item.primaryFileName||"").toLowerCase().endsWith(".md")) return <iframe className={styles.previewFrame} src={source} title={item.title}/>;
  if(mime.startsWith("video/")) return <video className={styles.previewMedia} src={source} controls/>;
  if(mime.startsWith("audio/")) return <audio className={styles.previewAudio} src={source} controls/>;
  return <div className={styles.previewEmpty}><FileQuestion size={45}/><strong>此格式需要本机程序或 Office 阅读服务</strong><a href={source}>下载文件</a></div>;
}

export default function ItemDetail({ itemId }: { itemId:string }) {
  const [item,setItem]=useState<Item|null>(null); const [comments,setComments]=useState<Comment[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [collections,setCollections]=useState<Collection[]>([]); const [tagInput,setTagInput]=useState(""); const [comment,setComment]=useState(""); const [commentImages,setCommentImages]=useState<globalThis.File[]>([]); const imageInput=useRef<HTMLInputElement>(null); const [question,setQuestion]=useState("请总结这份资料，并给出建议标签。"); const [answer,setAnswer]=useState(""); const [busy,setBusy]=useState("");
  const load=useCallback(async()=>{setError("");try{const response=await fetch(`/api/library/${itemId}`,{cache:"no-store"});if(response.status===401){window.location.replace("/login");return}const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"无法读取资料");setItem(data.item);setComments(data.comments);setTagInput(data.item.tags.join(", "));}catch(loadError){setError(loadError instanceof Error?loadError.message:"无法读取资料");}finally{setLoading(false)}},[itemId]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{fetch("/api/collections",{cache:"no-store"}).then(response=>response.json()).then(data=>{if(data.ok)setCollections(data.collections)}).catch(()=>undefined)},[]);

  async function action(body:Record<string,unknown>){const response=await fetch(`/api/library/${itemId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"操作失败");return data;}
  async function saveTags(){setBusy("tags");setError("");try{await action({action:"set-tags",tags:tagInput.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean)});await load();}catch(e){setError(e instanceof Error?e.message:"标签保存失败");}finally{setBusy("")}}
  async function moveCollection(collectionId:string|null){setBusy("collection");setError("");try{await action({action:"move-collection",collectionId});await load();window.dispatchEvent(new Event("library:collections-changed"));}catch(e){setError(e instanceof Error?e.message:"分类移动失败");}finally{setBusy("")}}
  function chooseCommentImages(files:FileList|null){if(!files)return;const next=Array.from(files).filter(file=>["image/jpeg","image/png","image/webp","image/gif","image/avif"].includes(file.type));setCommentImages(current=>[...current,...next].slice(0,4));if(imageInput.current)imageInput.current.value="";}
  async function addComment(event:FormEvent){event.preventDefault();if(!comment.trim()&&!commentImages.length)return;setBusy("comment");setError("");try{const created=await action({action:"add-comment",content:comment.trim()||"图片"});const commentId=created.comment?.id as string|undefined;if(!commentId)throw new Error("评论创建失败");for(const image of commentImages){const formData=new FormData();formData.append("file",image);const response=await fetch(`/api/library/${itemId}/comments/${commentId}/attachments`,{method:"POST",body:formData});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||`图片 ${image.name} 上传失败`);}setComment("");setCommentImages([]);await load();}catch(e){setError(e instanceof Error?e.message:"评论添加失败");await load();}finally{setBusy("")}}
  async function deleteComment(id:string){setBusy(id);try{await action({action:"delete-comment",commentId:id});await load();}catch(e){setError(e instanceof Error?e.message:"评论删除失败");}finally{setBusy("")}}
  async function askAI(){if(!question.trim())return;setBusy("ai");setAnswer("");setError("");try{const response=await fetch(`/api/library/${itemId}/ai`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"AI 请求失败");setAnswer(data.answer||"模型没有返回文字内容");}catch(e){setError(e instanceof Error?e.message:"AI 请求失败");}finally{setBusy("")}}

  if(loading)return <div className={styles.loading}>正在读取资料…</div>;
  if(!item)return <div className={styles.loading}>{error||"资料不存在"}</div>;
  return <div className={styles.page}>
    <header className={styles.topbar}><Link href="/recent"><ArrowLeft size={17}/>返回资料库</Link><div><span>{item.location==="inbox"?"待整理":item.location==="archive"?"归档":"文件库"}</span>{item.primaryFileId&&<a href={`/api/files/${item.primaryFileId}/content`} download><Download size={16}/>下载</a>}</div></header>
    <main className={styles.layout}>
      <section className={styles.previewPane}><Preview item={item}/></section>
      <aside className={styles.sidePane}>
        <section className={styles.titleBlock}><span>FILE DETAIL</span><h1>{item.primaryFileName||item.title}</h1><p>{item.description||"在这里添加标签、留下人工评论，或按需调用 AI 阅读助手。"}</p></section>
        {error&&<div className={styles.error}>{error}</div>}
        <section className={styles.toolSection}><div className={styles.sectionTitle}><FolderInput size={16}/><strong>分类集合</strong><em>{item.collectionName||"未分类"}</em></div><select className={styles.collectionSelect} value={item.collectionId||""} disabled={busy==="collection"} onChange={event=>void moveCollection(event.target.value||null)}><option value="">未分类</option>{collections.map(collection=><option value={collection.id} key={collection.id}>{collection.name}</option>)}</select><small>也可以在文件列表中把资料直接拖到左侧分类。</small></section>
        <section className={styles.toolSection}><div className={styles.sectionTitle}><Tag size={16}/><strong>标签</strong></div><div className={styles.tagEditor}><input value={tagInput} onChange={e=>setTagInput(e.target.value)} placeholder="用逗号分隔，例如：机器人, 数学"/><button onClick={()=>void saveTags()} disabled={busy==="tags"}>{busy==="tags"?"保存中":"保存"}</button></div><small>最多 20 个标签，每个不超过 40 字。</small></section>
        <section className={styles.toolSection}><div className={styles.sectionTitle}><MessageSquare size={16}/><strong>文件评论</strong><em>{comments.length}</em></div><form className={styles.commentForm} onSubmit={addComment}><textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="记录想法；粘贴 https:// 链接可直接打开…" maxLength={5000}/><input ref={imageInput} className={styles.hiddenImageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={e=>chooseCommentImages(e.target.files)}/>{commentImages.length>0&&<div className={styles.selectedImages}>{commentImages.map((image,index)=><span key={`${image.name}-${index}`}><FileImage size={13}/>{image.name}<button type="button" title="移除图片" onClick={()=>setCommentImages(files=>files.filter((_,fileIndex)=>fileIndex!==index))}><X size={12}/></button></span>)}</div>}<div className={styles.commentActions}><button className={styles.imagePicker} type="button" onClick={()=>imageInput.current?.click()} disabled={busy==="comment"||commentImages.length>=4}><ImagePlus size={15}/>图片 {commentImages.length}/4</button><button type="submit" disabled={busy==="comment"||(!comment.trim()&&!commentImages.length)}><Plus size={15}/>{busy==="comment"?"添加中…":"添加评论"}</button></div></form><div className={styles.comments}>{comments.map(entry=><article key={entry.id}><p>{renderCommentContent(entry.content)}</p>{entry.attachments?.length>0&&<div className={styles.commentAttachments}>{entry.attachments.map(attachment=><a key={attachment.id} href={attachment.contentUrl} target="_blank" rel="noopener noreferrer" title={attachment.originalName}><img src={attachment.contentUrl} alt={attachment.originalName}/></a>)}</div>}<div className={styles.commentMeta}><time>{new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(entry.createdAt))}</time><button onClick={()=>void deleteComment(entry.id)} disabled={busy===entry.id} title="删除评论"><Trash2 size={14}/></button></div></article>)}{comments.length===0&&<span className={styles.noComments}>还没有人工评论。</span>}</div><small>支持 HTTP/HTTPS 链接与最多 4 张图片；单张不超过 10 MB。</small></section>
        <section className={styles.aiSection}><div className={styles.sectionTitle}><Bot size={17}/><strong>AI 阅读助手</strong><em>按需调用</em></div><textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000}/><button onClick={()=>void askAI()} disabled={busy==="ai"}><Send size={15}/>{busy==="ai"?"正在阅读…":"询问 AI"}</button>{answer&&<div className={styles.answer}>{answer}</div>}<small>文本、Markdown 和小型图片可读取正文；其他格式暂以元数据、标签和评论为依据。</small></section>
      </aside>
    </main>
  </div>;
}
