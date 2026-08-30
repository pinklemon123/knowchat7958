import type { NewsResult } from "./types";

export type LocalChatMessage = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
  documentName?: string;
  documentContent?: string;
  sources?: NewsResult[];
  createdAt: number;
};

export type LocalChatSession = {
  id: string;
  title: string;
  model: string;
  mode: "normal" | "web" | "document";
  messages: LocalChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type LocalSearchRecord = {
  id: string;
  query: string;
  createdAt: number;
};

export type LocalReadRecord = {
  id: string;
  source: NewsResult;
  createdAt: number;
};

export type LocalFavorite = {
  id: string;
  kind: "source" | "chat";
  title: string;
  content: string;
  url?: string;
  createdAt: number;
};

export type LocalDataSnapshot = {
  version: 1;
  exportedAt: string;
  chats: LocalChatSession[];
  searches: LocalSearchRecord[];
  reads: LocalReadRecord[];
  favorites: LocalFavorite[];
};

const dbName = "chatgreen-local";
const dbVersion = 1;
const stores = ["chats", "searches", "reads", "favorites"] as const;
type StoreName = (typeof stores)[number];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openLocalDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function listStore<T extends { createdAt?: number; updatedAt?: number }>(storeName: StoreName) {
  const rows = await withStore<T[]>(storeName, "readonly", (store) => store.getAll() as IDBRequest<T[]>);
  return rows.sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
}

async function putStore<T>(storeName: StoreName, value: T) {
  await withStore<IDBValidKey>(storeName, "readwrite", (store) => store.put(value));
}

async function deleteStore(storeName: StoreName, id: string) {
  await withStore<undefined>(storeName, "readwrite", (store) => store.delete(id));
}

export function newChatSession(model: string, mode: "normal" | "web" | "document"): LocalChatSession {
  const now = Date.now();
  return {
    id: createId("chat"),
    title: "新的对话",
    model,
    mode,
    messages: [
      {
        role: "assistant",
        content: "你好，我可以帮你检索新闻、整理资料，也可以识别你上传的图片。对话会保存在本机浏览器里。",
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

export function titleFromMessage(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 36) || "新的对话";
}

export const localData = {
  async listChats() {
    return listStore<LocalChatSession>("chats");
  },

  async saveChat(session: LocalChatSession) {
    await putStore("chats", session);
  },

  async deleteChat(id: string) {
    await deleteStore("chats", id);
  },

  async listSearches() {
    return listStore<LocalSearchRecord>("searches");
  },

  async addSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    await putStore("searches", {
      id: `search-${encodeURIComponent(trimmed.toLowerCase())}`,
      query: trimmed,
      createdAt: Date.now()
    });
  },

  async listReads() {
    return listStore<LocalReadRecord>("reads");
  },

  async addRead(source: NewsResult) {
    await putStore("reads", {
      id: `read-${source.url}`,
      source,
      createdAt: Date.now()
    });
  },

  async listFavorites() {
    return listStore<LocalFavorite>("favorites");
  },

  async addFavorite(favorite: Omit<LocalFavorite, "id" | "createdAt">) {
    await putStore("favorites", {
      ...favorite,
      id: `favorite-${favorite.url ?? favorite.title}`,
      createdAt: Date.now()
    });
  },

  async deleteFavorite(id: string) {
    await deleteStore("favorites", id);
  },

  async exportAll(): Promise<LocalDataSnapshot> {
    const [chats, searches, reads, favorites] = await Promise.all([
      this.listChats(),
      this.listSearches(),
      this.listReads(),
      this.listFavorites()
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      chats,
      searches,
      reads,
      favorites
    };
  },

  async clearAll() {
    const db = await openLocalDb();
    await Promise.all(
      stores.map(
        (storeName) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const request = tx.objectStore(storeName).clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          })
      )
    );
    db.close();
  }
};
