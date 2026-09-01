"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Database, HardDrive, KeyRound, LogOut, RefreshCcw, Save, Send, Server, ShieldCheck, Trash2, Wifi, Wrench } from "lucide-react";
import styles from "./settings.module.css";

type HealthLevel = "ok" | "warning" | "error";
type HealthReport = {
  id: string;
  checkedAt: string;
  source: "manual" | "scheduled";
  overall: HealthLevel;
  uptimeSeconds: number;
  version: string;
  checks: Array<{ id: string; label: string; level: HealthLevel; message: string; detail?: string }>;
  repairs: string[];
};
type HealthState = { autoRepairEnabled: boolean; updatedAt: string; reports: HealthReport[] };
type TrashSummary = { itemCount: number; fileCount: number; sizeBytes: number };

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小时`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

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
  const [healthState,setHealthState]=useState<HealthState|null>(null);
  const [healthBusy,setHealthBusy]=useState<"run"|"toggle"|"">("");
  const [healthError,setHealthError]=useState("");
  const [trashSummary,setTrashSummary]=useState<TrashSummary|null>(null);
  const [trashBusy,setTrashBusy]=useState(false);
  const [trashMessage,setTrashMessage]=useState("");
  const [trashError,setTrashError]=useState("");

  const filteredModels=useMemo(()=>{const query=modelFilter.trim().toLowerCase();return query?models.filter(model=>model.toLowerCase().includes(query)):models},[models,modelFilter]);
  const nativeWebCandidate=webModels.includes(selectedModel);

  useEffect(()=>{let cancelled=false;(async()=>{try{const [modelsResponse,settingsResponse]=await Promise.all([fetch("/api/models",{cache:"no-store"}),fetch("/api/library/ai-settings",{cache:"no-store"})]);const modelData=await modelsResponse.json();const settingsData=await settingsResponse.json();if(cancelled)return;const available=Array.isArray(modelData.models)?modelData.models:[];setModels(available);setWebModels(Array.isArray(modelData.webModels)?modelData.webModels:[]);setSelectedModel(settingsData.settings?.defaultModel||modelData.current||available[0]||"");}catch(loadError){if(!cancelled)setAiError(loadError instanceof Error?loadError.message:"模型列表读取失败")}finally{if(!cancelled)setModelsLoading(false)}})();return()=>{cancelled=true}},[]);
  useEffect(()=>{let cancelled=false;(async()=>{try{const response=await fetch("/api/library/system-health",{cache:"no-store"});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"状态简报读取失败");if(!cancelled)setHealthState(data.state)}catch(loadError){if(!cancelled)setHealthError(loadError instanceof Error?loadError.message:"状态简报读取失败")}})();return()=>{cancelled=true}},[]);
  useEffect(()=>{let cancelled=false;(async()=>{try{const response=await fetch("/api/library/trash",{cache:"no-store"});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"回收站状态读取失败");if(!cancelled)setTrashSummary(data.summary)}catch(loadError){if(!cancelled)setTrashError(loadError instanceof Error?loadError.message:"回收站状态读取失败")}})();return()=>{cancelled=true}},[]);

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
  async function runHealthCheck(){setHealthBusy("run");setHealthError("");try{const response=await fetch("/api/library/system-health",{method:"POST"});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"自检失败");setHealthState(data.state)}catch(runError){setHealthError(runError instanceof Error?runError.message:"自检失败")}finally{setHealthBusy("")}}
  async function toggleAutoRepair(){if(!healthState)return;setHealthBusy("toggle");setHealthError("");try{const response=await fetch("/api/library/system-health",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!healthState.autoRepairEnabled})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"设置保存失败");setHealthState(data.state)}catch(toggleError){setHealthError(toggleError instanceof Error?toggleError.message:"设置保存失败")}finally{setHealthBusy("")}}
  async function emptyTrash(){if(!trashSummary?.itemCount||trashBusy)return;const confirmed=window.confirm(`确定永久删除回收站中的 ${trashSummary.itemCount} 份资料吗？\n\n将删除 ${trashSummary.fileCount} 个实体文件（${formatBytes(trashSummary.sizeBytes)}），此操作无法撤销。`);if(!confirmed)return;setTrashBusy(true);setTrashError("");setTrashMessage("");try{const response=await fetch("/api/library/trash",{method:"DELETE"});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"清空回收站失败");const result=data.result as {itemCount:number;deletedFileCount:number;missingFileCount:number;failedFileCount:number;freedBytes:number};setTrashSummary({itemCount:0,fileCount:0,sizeBytes:0});if(result.failedFileCount>0)setTrashError(`资料记录已删除，但有 ${result.failedFileCount} 个暂存文件未能从磁盘移除，请检查服务器日志和 data/trash。`);else setTrashMessage(`已永久删除 ${result.itemCount} 份资料和 ${result.deletedFileCount} 个文件，释放 ${formatBytes(result.freedBytes)}。${result.missingFileCount?`另有 ${result.missingFileCount} 个文件原本已不在磁盘。`:""}`)}catch(deleteError){setTrashError(deleteError instanceof Error?deleteError.message:"清空回收站失败")}finally{setTrashBusy(false)}}

  const latestReport=healthState?.reports[0];

  return <div className={styles.page}>
    <header className={styles.topbar}><span>资料库设置</span><button onClick={() => void logout()}><LogOut size={16} />退出登录</button></header>
    <div className={styles.content}>
      <section className={styles.heading}><span>SETTINGS</span><h1>设置</h1><p>管理个人资料库的访问安全与本地存储方式。</p></section>
      <section className={`${styles.card} ${styles.healthCard}`}>
        <div className={styles.cardTitle}><span><Activity size={19}/></span><div><h2>部署状态与每日简报</h2><p>检查网页进程、PostgreSQL、文件存储和关键配置。生产环境由 Docker 每天触发一次，最近保留 30 份报告。</p></div></div>
        <div className={styles.healthToolbar}>
          <div className={`${styles.overallStatus} ${latestReport?styles[latestReport.overall]:styles.unknown}`}>
            {latestReport?.overall==="ok"?<CheckCircle2 size={18}/>:latestReport?<AlertTriangle size={18}/>:<Server size={18}/>}<div><strong>{latestReport?.overall==="ok"?"运行正常":latestReport?.overall==="warning"?"有配置提醒":latestReport?.overall==="error"?"发现运行问题":"尚未执行自检"}</strong><span>{latestReport?`${new Date(latestReport.checkedAt).toLocaleString("zh-CN")} · ${latestReport.source==="scheduled"?"每日自动":"手动"}`:"点击右侧按钮生成第一份状态简报"}</span></div>
          </div>
          <div className={styles.healthActions}><button onClick={()=>void runHealthCheck()} disabled={Boolean(healthBusy)}><RefreshCcw size={15} className={healthBusy==="run"?styles.spinning:""}/>{healthBusy==="run"?"检查中…":"立即自检"}</button><button className={healthState?.autoRepairEnabled?styles.repairEnabled:""} onClick={()=>void toggleAutoRepair()} disabled={!healthState||Boolean(healthBusy)}><Wrench size={15}/>{healthState?.autoRepairEnabled?"自动处理：开":"自动处理：关"}</button></div>
        </div>
        {healthError&&<div className={styles.error}>{healthError}</div>}
        {latestReport&&<><div className={styles.healthMeta}><span>服务版本 <strong>{latestReport.version}</strong></span><span>本次进程已运行 <strong>{formatUptime(latestReport.uptimeSeconds)}</strong></span><span>安全自动处理 <strong>{healthState?.autoRepairEnabled?"已开启":"已关闭"}</strong></span></div><div className={styles.healthChecks}>{latestReport.checks.map(check=><div className={`${styles.healthCheck} ${styles[check.level]}`} key={check.id}><i/ ><div><strong>{check.label}</strong><span>{check.message}</span>{check.detail&&<small title={check.detail}>{check.detail}</small>}</div></div>)}</div>{latestReport.repairs.length>0&&<div className={styles.repairs}><Wrench size={15}/><div><strong>本次已安全处理</strong>{latestReport.repairs.map(item=><span key={item}>{item}</span>)}</div></div>}</>}
        <details className={styles.healthHistory}><summary>查看历史简报（{healthState?.reports.length||0}）</summary><div>{healthState?.reports.slice(1).map(report=><div key={report.id}><span className={styles[report.overall]}/><strong>{new Date(report.checkedAt).toLocaleString("zh-CN")}</strong><small>{report.source==="scheduled"?"自动":"手动"} · {report.checks.filter(check=>check.level!=="ok").length} 项提醒/问题</small></div>)}</div></details>
        <p className={styles.repairNotice}>自动处理仅创建缺失的数据目录并清理超过 24 小时的上传临时文件；数据库迁移、密钥修改和服务器命令仍需手动确认。</p>
      </section>
      <section className={`${styles.card} ${styles.aiCard}`}><div className={styles.cardTitle}><span><Bot size={19}/></span><div><h2>AI 模型与连通测试</h2><p>默认模型同时用于知识库文件问答和 3000 首页对话；可在这里验证普通对话及原生联网能力。</p></div></div>
        <div className={styles.aiControls}><label>筛选模型<input value={modelFilter} onChange={event=>setModelFilter(event.target.value)} placeholder="例如 gpt、gemini、claude、search…"/></label><label>默认模型<select value={selectedModel} onChange={event=>{setSelectedModel(event.target.value);setTestResult(null)}} disabled={modelsLoading}><option value="">{modelsLoading?"正在读取模型…":"请选择模型"}</option>{filteredModels.map(model=><option value={model} key={model}>{model}{webModels.includes(model)?" · 原生联网候选":""}</option>)}</select></label><div className={styles.modelStatus}><span>{models.length} 个对话模型</span><span className={nativeWebCandidate?styles.webReady:""}><Wifi size={13}/>{nativeWebCandidate?"原生联网候选":"普通对话模型"}</span></div></div>
        <div className={styles.testComposer}><textarea value={testPrompt} onChange={event=>setTestPrompt(event.target.value)} maxLength={1000}/><div><button onClick={()=>void saveModel()} disabled={Boolean(aiBusy)||!selectedModel}><Save size={15}/>{aiBusy==="save"?"保存中…":"保存默认模型"}</button><button onClick={()=>void testModel("chat")} disabled={Boolean(aiBusy)||!selectedModel}><Send size={15}/>{aiBusy==="chat"?"对话中…":"测试对话"}</button><button className={styles.webTest} onClick={()=>void testModel("web")} disabled={Boolean(aiBusy)||!selectedModel}><Wifi size={15}/>{aiBusy==="web"?"联网测试中…":"测试联网"}</button></div></div>
        {aiError&&<div className={styles.error}>{aiError}</div>}{aiMessage&&<div className={styles.success}>{aiMessage}</div>}{testResult&&<div className={styles.testResult}><div><CheckCircle2 size={16}/><strong>{testResult.verified?"测试通过":"测试完成，但未验证到联网来源"}</strong>{testResult.latencyMs!==undefined&&<span>{testResult.latencyMs} ms</span>}</div><p>{testResult.answer||testResult.message||"模型没有返回文字内容"}</p>{testResult.urls?.length?<div className={styles.testLinks}>{testResult.urls.map(url=><a href={url} target="_blank" rel="noopener noreferrer" key={url}>{url}</a>)}</div>:null}</div>}
        <details className={styles.webModels}><summary>查看识别到的原生联网候选（{webModels.length}）</summary><div>{webModels.map(model=><button className={model===selectedModel?styles.selectedCandidate:""} onClick={()=>{setSelectedModel(model);setTestResult(null)}} key={model}>{model}</button>)}</div></details>
      </section>
      <section className={`${styles.card} ${styles.trashCard}`}>
        <div className={styles.cardTitle}><span><Trash2 size={19}/></span><div><h2>回收站清理</h2><p>永久删除已移入回收站的资料、评论附件和磁盘实体文件。执行后无法恢复。</p></div></div>
        <div className={styles.trashControls}><div><strong>{trashSummary?`${trashSummary.itemCount} 份资料`:"正在读取…"}</strong><span>{trashSummary?`${trashSummary.fileCount} 个文件 · ${formatBytes(trashSummary.sizeBytes)}`:"正在统计回收站占用空间"}</span></div><button onClick={()=>void emptyTrash()} disabled={trashBusy||!trashSummary?.itemCount}><Trash2 size={15}/>{trashBusy?"正在永久删除…":trashSummary?.itemCount?"清空回收站":"回收站为空"}</button></div>
        {trashError&&<div className={styles.error}>{trashError}</div>}{trashMessage&&<div className={styles.success}>{trashMessage}</div>}
        <p className={styles.dangerNotice}>为避免数据库与文件状态不一致，系统会先将实体文件暂存，再提交数据库删除；事务失败时会自动恢复文件。</p>
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
