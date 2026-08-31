import path from "node:path";
import { access, mkdir, readdir, readFile, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { getPool } from "./db";
import { getDataRoot, getStorageDirectories } from "./storage";

export type HealthLevel = "ok" | "warning" | "error";

export type HealthCheck = {
  id: string;
  label: string;
  level: HealthLevel;
  message: string;
  detail?: string;
};

export type HealthReport = {
  id: string;
  checkedAt: string;
  source: "manual" | "scheduled";
  overall: HealthLevel;
  uptimeSeconds: number;
  version: string;
  checks: HealthCheck[];
  repairs: string[];
};

type HealthState = {
  version: 1;
  autoRepairEnabled: boolean;
  updatedAt: string;
  reports: HealthReport[];
};

const DEFAULT_STATE: HealthState = {
  version: 1,
  autoRepairEnabled: false,
  updatedAt: new Date(0).toISOString(),
  reports: []
};

function statePaths() {
  const directory = path.join(getDataRoot(), "system");
  return {
    directory,
    file: path.join(directory, "health-state.json"),
    temporary: path.join(directory, "health-state.tmp")
  };
}

export async function readHealthState(): Promise<HealthState> {
  try {
    const parsed = JSON.parse(await readFile(statePaths().file, "utf8")) as Partial<HealthState>;
    return {
      version: 1,
      autoRepairEnabled: parsed.autoRepairEnabled === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : DEFAULT_STATE.updatedAt,
      reports: Array.isArray(parsed.reports) ? parsed.reports.slice(0, 30) : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_STATE, reports: [] };
    throw error;
  }
}

async function saveHealthState(state: HealthState) {
  const paths = statePaths();
  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(paths.temporary, paths.file);
}

export async function setAutoRepairEnabled(enabled: boolean) {
  const state = await readHealthState();
  const next = { ...state, autoRepairEnabled: enabled, updatedAt: new Date().toISOString() };
  await saveHealthState(next);
  return next;
}

function overallLevel(checks: HealthCheck[]): HealthLevel {
  if (checks.some((check) => check.level === "error")) return "error";
  if (checks.some((check) => check.level === "warning")) return "warning";
  return "ok";
}

async function storageCheck(autoRepair: boolean, repairs: string[]): Promise<HealthCheck> {
  const directories = getStorageDirectories();
  const required = [directories.root, directories.library, directories.temp, directories.trash, path.join(directories.root, "ui")];
  try {
    for (const directory of required) {
      try {
        await access(directory, constants.R_OK | constants.W_OK);
      } catch {
        if (!autoRepair) {
          return { id: "storage", label: "文件存储", level: "error", message: "存在缺失或不可写的数据目录", detail: directory };
        }
        await mkdir(directory, { recursive: true });
        await access(directory, constants.R_OK | constants.W_OK);
        repairs.push(`已创建或修复数据目录：${path.basename(directory)}`);
      }
    }
    const probe = path.join(directories.temp, `.health-${process.pid}-${Date.now()}`);
    await writeFile(probe, "ok", "utf8");
    await unlink(probe);
    const space = await statfs(directories.root);
    const freeBytes = Number(space.bavail) * Number(space.bsize);
    const freeGiB = freeBytes / 1024 ** 3;
    return {
      id: "storage",
      label: "文件存储",
      level: freeGiB < 1 ? "warning" : "ok",
      message: `数据目录可读写，可用空间 ${freeGiB.toFixed(1)} GB`,
      detail: directories.root
    };
  } catch (error) {
    return { id: "storage", label: "文件存储", level: "error", message: "数据目录检查失败", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function cleanupStaleTempFiles(repairs: string[]) {
  const temp = getStorageDirectories().temp;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  try {
    for (const entry of await readdir(temp, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = path.join(temp, entry.name);
      if ((await stat(filePath)).mtimeMs < cutoff) {
        await unlink(filePath);
        removed += 1;
      }
    }
    if (removed) repairs.push(`已清理 ${removed} 个超过 24 小时的上传临时文件`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function databaseCheck(): Promise<HealthCheck> {
  try {
    const pool = await getPool();
    if (!pool) return { id: "database", label: "PostgreSQL", level: "warning", message: "未配置数据库连接" };
    const started = performance.now();
    await pool.query("SELECT 1");
    return { id: "database", label: "PostgreSQL", level: "ok", message: `连接正常，响应 ${Math.round(performance.now() - started)} ms` };
  } catch (error) {
    return { id: "database", label: "PostgreSQL", level: "error", message: "数据库连接失败", detail: error instanceof Error ? error.message : String(error) };
  }
}

function configurationChecks(): HealthCheck[] {
  const production = process.env.NODE_ENV === "production";
  const hasAiKey = Boolean(process.env.KNOWLEDGE_AI_API_KEY || process.env.OPENAI_API_KEY);
  return [
    {
      id: "runtime",
      label: "网页服务",
      level: "ok",
      message: `${production ? "生产" : "开发"}模式，Node ${process.version}`
    },
    {
      id: "security",
      label: "部署安全",
      level: production && (process.env.LIBRARY_SECURE_COOKIE !== "true" || !process.env.CRON_SECRET) ? "warning" : "ok",
      message: production
        ? (process.env.LIBRARY_SECURE_COOKIE === "true" && process.env.CRON_SECRET ? "HTTPS Cookie 与定时任务密钥已配置" : "请配置 HTTPS Cookie 和 CRON_SECRET")
        : "本地开发模式不强制 HTTPS Cookie"
    },
    {
      id: "ai",
      label: "AI 配置",
      level: hasAiKey ? "ok" : "warning",
      message: hasAiKey ? "至少一个 AI 服务密钥已配置" : "未配置 AI 密钥，文件与资料库功能不受影响"
    },
    {
      id: "web-search",
      label: "联网搜索",
      level: process.env.TAVILY_API_KEY ? "ok" : "warning",
      message: process.env.TAVILY_API_KEY ? "Tavily 搜索服务已配置" : "未配置 TAVILY_API_KEY，联网新闻搜索暂不可用"
    }
  ];
}

export async function runSystemHealth(source: HealthReport["source"]): Promise<{ state: HealthState; report: HealthReport }> {
  const state = await readHealthState();
  const repairs: string[] = [];
  const checks = [...configurationChecks(), await databaseCheck(), await storageCheck(state.autoRepairEnabled, repairs)];
  if (state.autoRepairEnabled) {
    try {
      await cleanupStaleTempFiles(repairs);
    } catch (error) {
      checks.push({ id: "temp-cleanup", label: "临时文件清理", level: "warning", message: "自动清理未完成", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  const report: HealthReport = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    checkedAt: new Date().toISOString(),
    source,
    overall: overallLevel(checks),
    uptimeSeconds: Math.round(process.uptime()),
    version: process.env.npm_package_version || "0.1.0",
    checks,
    repairs
  };
  const next = { ...state, updatedAt: report.checkedAt, reports: [report, ...state.reports].slice(0, 30) };
  await saveHealthState(next);
  return { state: next, report };
}
