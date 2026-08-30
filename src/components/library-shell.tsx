"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  BookOpen,
  Clock3,
  Files,
  Folder,
  Inbox,
  LayoutDashboard,
  Menu,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Star,
  Sun,
  X
} from "lucide-react";
import styles from "./library-shell.module.css";

type LibraryShellProps = {
  children: ReactNode;
};

const mainNavigation = [
  { label: "工作台", icon: LayoutDashboard, href: "/" },
  { label: "文件库", icon: Files, disabled: true },
  { label: "最近", icon: Clock3, href: "/recent" },
  { label: "收藏", icon: Star, disabled: true },
  { label: "待整理", icon: Inbox, href: "/inbox", badge: true }
];

const categoryNames = ["机器人", "数学", "Blender", "Lean"];

export default function LibraryShell({ children }: LibraryShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("green-library-theme");
    setTheme(savedTheme === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.libraryTheme = theme;
    window.localStorage.setItem("green-library-theme", theme);
    return () => {
      delete document.documentElement.dataset.libraryTheme;
    };
  }, [theme]);

  useEffect(() => {
    fetch("/api/library?location=inbox&limit=100", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setInboxCount(Number(data.count ?? 0));
      })
      .catch(() => undefined);

    const updateCount = (event: Event) => {
      const value = (event as CustomEvent<number>).detail;
      if (Number.isFinite(value)) setInboxCount(value);
    };
    window.addEventListener("library:inbox-count", updateCount);
    return () => window.removeEventListener("library:inbox-count", updateCount);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className={`${styles.shell} ${theme === "dark" ? styles.darkShell : ""}`}>
      <button
        className={styles.mobileMenu}
        type="button"
        aria-label="打开资料库导航"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>

      {mobileOpen && <button className={styles.backdrop} aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandRow}>
          <Link className={styles.brand} href="/inbox">
            <span className={styles.brandMark}><BookOpen size={20} /></span>
            <span>
              <strong>Green Library</strong>
              <small>抹茶资料室</small>
            </span>
          </Link>
          <button className={styles.closeMenu} type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="资料库导航">
          {mainNavigation.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <span className={styles.disabledNav} key={item.label} title="即将开放">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </span>
              );
            }
            return (
              <Link
                className={pathname === item.href ? styles.activeNav : styles.navLink}
                href={item.href!}
                key={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && <em>{inboxCount}</em>}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sectionLabel}>分类</div>
        <div className={styles.categories}>
          {categoryNames.map((name) => (
            <span key={name} title="分类管理将在下一阶段开放">
              <Folder size={15} />
              {name}
            </span>
          ))}
        </div>

        <div className={styles.sideSpacer} />
        <div className={styles.utilityNav}>
          <span><Archive size={17} />归档</span>
          <span><RotateCcw size={17} />回收站</span>
          <span><Settings size={17} />设置</span>
          <button
            className={styles.themeToggle}
            type="button"
            aria-label={theme === "dark" ? "切换到浅色主题" : "切换到暗色主题"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            {theme === "dark" ? "浅色模式" : "暗色模式"}
          </button>
        </div>

        <div className={styles.sideSearchHint}>
          <Search size={16} />
          <span>搜索将在文件库开放</span>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
