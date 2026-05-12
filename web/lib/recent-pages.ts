"use client";

import { useEffect, useState } from "react";

const KEY_PREFIX = "marrow:recent-pages:";
const MAX_ITEMS = 12;

export interface RecentPage {
  workspaceId: string;
  pageId: string;
  title: string;
  collectionId: string;
  visitedAt: number;
}

function storageKey(workspaceId: string) {
  return `${KEY_PREFIX}${workspaceId}`;
}

function read(workspaceId: string): RecentPage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentPage[];
  } catch {
    return [];
  }
}

function write(workspaceId: string, items: RecentPage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(items));
  } catch {
    // quota / privacy mode — silently ignore
  }
}

export function recordPageVisit(entry: Omit<RecentPage, "visitedAt">) {
  const current = read(entry.workspaceId);
  const filtered = current.filter((p) => p.pageId !== entry.pageId);
  const next: RecentPage[] = [
    { ...entry, visitedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  write(entry.workspaceId, next);
}

export function useRecentPages(workspaceId: string): RecentPage[] {
  const [items, setItems] = useState<RecentPage[]>([]);
  useEffect(() => {
    setItems(read(workspaceId));
    function onStorage(e: StorageEvent) {
      if (e.key === storageKey(workspaceId)) setItems(read(workspaceId));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [workspaceId]);
  return items;
}
