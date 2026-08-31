"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, CheckCircle2, Database, HardDrive, KeyRound, LogOut, RefreshCcw, Save, Send, ShieldCheck, Wifi } from "lucide-react";
import styles from "./settings.module.css";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [models,setModels]=useState<string[]>([]);
  const [webModels,setWebModels]=useState<string[]>([]);
  const [selectedModel,setSelectedModel]=useState("");
  const [modelFilter,setModelFilter]=useState("");
  const [modelsLoading,setModelsLoading]=useState(true);
  const [aiBusy,setAiBusy]=useState<"save"|"chat"|"web"|"">("");
  const [aiMessage,setAiMessage]=useState("");
  const [aiError,setAiError]=useState("");
  const [testPrompt,setTestPrompt]=useState("请用一句中文介绍你自己，并说明当前模型名称。");
  const [testResult,setTestResult]=useState<{answer?:string;message?:string;verified?:boolean;latencyMs?:number;urls?:string[]} | null>(null);

  const filteredModels=useMemo(()=>{const query=modelFilter.trim().toLowerCase();return query?models.filter(model=>model.toLowerCase().includes(query)):models},[models,modelFilter]);
  const nativeWebCandidate=webModels.includes(selectedModel);

  useEffect(()=>{let cancelled=false;(async()=>{try{const [modelsResponse,settingsResponse]=await Promise.all([fetch("/api/models",{cache:"no-store"}),fetch("/api/library/ai-settings",{cache:"no-store"})]);const modelData=await modelsResponse.json();const settingsData=await settingsResponse.json();if(cancelled)return;const available=Array.isArray(modelData.models)?modelData.models:[];setModels(available);setWebModels(Array.isArray(modelData.webModels)?modelData.webModels:[]);setSelectedModel(settingsData.settings?.defaultModel||modelData.current||available[0]||"");}catch(loadError){if(!cancelled)setAiError(loadError instanceof Error?loadError.message:"模型列表读取失败")}finally{if(!cancelled)setModelsLoading(false)}})();return()=>{cancelled=true}},[]);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage(""); setError("");
    if (newPassword !== confirmPassword) { setError("两次输入的新密码不一致"); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/library/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "change-password", currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "密码修改失败");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("密码已更新，其他旧登录会话已失效。");
    } catch (changeError) { setError(changeError instanceof Error ? changeError.message : "密码修改失败"); }
    finally { setSubmitting(false); }
  }

  async function logout() {
    await fetch("/api/library/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.replace("/login");
  }

  async function saveModel(){if(!selectedModel)return;setAiBusy("save");setAiError("");setAiMessage("");try{const response=await fetch("/api/library/ai-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:selectedModel})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"模型保存失败");setAiMessage(`已将 ${selectedModel} 设为默认模型，首页和知识库问答会共同使用。`)}catch(saveError){setAiError(saveError instanceof Error?saveError.message:"模型保存失败")}finally{setAiBusy("")}}
  async function testModel(mode:"chat"|"web"){if(!selectedModel)return;setAiBusy(mode);setAiError("");setAiMessage("");setTestResult(null);try{const response=await fetch("/api/library/ai-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:selectedModel,mode,prompt:mode==="chat"?testPrompt:undefined})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"模型测试失败");setTestResult(data)}catch(testError){setAiError(testError instanceof Error?testError.message:"模型测试失败")}finally{setAiBusy("")}}

  return <div className={styles.page}>
    <header className={styles.topbar}><span>资料库设置</span><button onClick={() => void logout()}><LogOut size={16} />退出登录</button></header>
    <div className={styles.content}>
      <section className={styles.heading}><span>SETTINGS</span><h1>设置</h1><p>管理个人资料库的访问安全与本地存储方式。</p></section>
      <section className={`${styles.card} ${styles.aiCard}`}><div className={styles.cardTitle}><span><Bot size={19}/></span><div><h2>AI 模型与连通测试</h2><p>默认模型同时用于知识库文件问答和 3000 首页对话；可在这里验证普通对话及原生联网能力。</p></div></div>
        <div className={styles.aiControls}><label>筛选模型<input value={modelFilter} onChange={event=>setModelFilter(event.target.value)} placeholder="例如 gpt、gemini、claude、search…"/></label><label>默认模型<select value={selectedModel} onChange={event=>{setSelectedModel(event.target.value);setTestResult(null)}} disabled={modelsLoading}><option value="">{modelsLoading?"正在读取模型…":"请选择模型"}</option>{filteredModels.map(model=><option value={model} key={model}>{model}{webModels.includes(model)?" · 原生联网候选":""}</option>)}</select></label><div className={styles.modelStatus}><span>{models.length} 个对话模型</span><span className={nativeWebCandidate?styles.webReady:""}><Wifi size={13}/>{nativeWebCandidate?"原生联网候选":"普通对话模型"}</span></div></div>
        <div className={styles.testComposer}><textarea value={testPrompt} onChange={event=>setTestPrompt(event.target.value)} maxLength={1000}/><div><button onClick={()=>void saveModel()} disabled={Boolean(aiBusy)||!selectedModel}><Save size={15}/>{aiBusy==="save"?"保存中…":"保存默认模型"}</button><button onClick={()=>void testModel("chat")} disabled={Boolean(aiBusy)||!selectedModel}><Send size={15}/>{aiBusy==="chat"?"对话中…":"测试对话"}</button><button className={styles.webTest} onClick={()=>void testModel("web")} disabled={Boolean(aiBusy)||!selectedModel}><Wifi size={15}/>{aiBusy==="web"?"联网测试中…":"测试联网"}</button></div></div>
        {aiError&&<div className={styles.error}>{aiError}</div>}{aiMessage&&<div className={styles.success}>{aiMessage}</div>}{testResult&&<div className={styles.testResult}><div><CheckCircle2 size={16}/><strong>{testResult.verified?"测试通过":"测试完成，但未验证到联网来源"}</strong>{testResult.latencyMs!==undefined&&<span>{testResult.latencyMs} ms</span>}</div><p>{testResult.answer||testResult.message||"模型没有返回文字内容"}</p>{testResult.urls?.length?<div className={styles.testLinks}>{testResult.urls.map(url=><a href={url} target="_blank" rel="noopener noreferrer" key={url}>{url}</a>)}</div>:null}</div>}
        <details className={styles.webModels}><summary>查看识别到的原生联网候选（{webModels.length}）</summary><div>{webModels.map(model=><button className={model===selectedModel?styles.selectedCandidate:""} onClick={()=>{setSelectedModel(model);setTestResult(null)}} key={model}>{model}</button>)}</div></details>
      </section>
      <div className={styles.grid}>
        <section className={styles.card}><div className={styles.cardTitle}><span><KeyRound size={19} /></span><div><h2>修改访问密码</h2><p>密码更新后会生成新的会话密钥，其他设备需要重新登录。</p></div></div>
          <form onSubmit={changePassword}><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>新密码<input type="password" autoComplete="new-password" minLength={6} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label>确认新密码<input type="password" autoComplete="new-password" minLength={6} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>{error && <div className={styles.error}>{error}</div>}{message && <div className={styles.success}>{message}</div>}<button disabled={submitting}>{submitting ? "正在更新…" : "更新密码"}</button></form>
        </section>
        <aside className={styles.sideCards}>
          <section className={styles.infoCard}><ShieldCheck size={20} /><div><strong>登录保护已开启</strong><span>页面与文件 API 均验证 HttpOnly 会话 Cookie；连续错误登录会触发临时限制。</span></div></section>
          <section className={styles.infoCard}><HardDrive size={20} /><div><strong>本地文件存储</strong><span>上传文件默认写入 data/library，自定义界面资源写入 data/ui。</span></div></section>
          <section className={styles.infoCard}><Database size={20} /><div><strong>PostgreSQL 元数据</strong><span>分类、收藏、位置、标签和评论保存在数据库中，文件路径不直接暴露给客户端。</span></div></section>
        </aside>
      </div>
    </div>
  </div>;
}
