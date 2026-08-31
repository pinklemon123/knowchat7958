"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/library/auth", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (data.authenticated) window.location.replace("/recent");
      else setConfigured(Boolean(data.configured));
    }).catch(() => setConfigured(true));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (configured === false && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/library/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: configured === false ? "setup" : "login", password })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "登录失败");
      window.location.replace("/recent");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.visual}>
        <div className={styles.brand}><span><BookOpen size={22} /></span><div><strong>Green Library</strong><small>个人文件与知识管理</small></div></div>
        <div className={styles.visualCopy}><span>PRIVATE · LOCAL FIRST</span><h1>你的资料，<br />只在需要时打开。</h1><p>文件存储、知识整理与 AI 阅读入口统一放在一个受保护的空间里。</p></div>
        <div className={styles.securityNote}><ShieldCheck size={18} /><span>密码经加盐哈希后保存在服务器；登录 Cookie 不向浏览器脚本开放。</span></div>
      </section>
      <section className={styles.formPane}>
        <form className={styles.formCard} onSubmit={submit}>
          <span className={styles.formIcon}>{configured === false ? <KeyRound size={22} /> : <LockKeyhole size={22} />}</span>
          <div><span className={styles.eyebrow}>{configured === false ? "FIRST SETUP" : "WELCOME BACK"}</span><h2>{configured === false ? "设置资料库密码" : "进入我的资料库"}</h2><p>{configured === false ? "这是首次访问。设置后，未登录用户无法看到资料库页面或读取文件。" : "输入访问密码以继续。"}</p></div>
          {configured === null ? <div className={styles.loading}>正在检查资料库状态…</div> : <>
            <label><span>访问密码</span><input type="password" autoFocus autoComplete={configured ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} maxLength={128} required /></label>
            {configured === false && <label><span>确认密码</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} maxLength={128} required /></label>}
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" disabled={submitting}>{submitting ? "正在处理…" : configured === false ? "保存密码并进入" : "登录资料库"}</button>
            {configured && <small className={styles.recovery}>忘记密码时，服务器所有者可删除 <code>data/auth/library-auth.json</code>，重新进入首次设置。</small>}
          </>}
        </form>
      </section>
    </main>
  );
}
