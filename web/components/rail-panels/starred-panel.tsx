"use client";

import { useEffect, useState } from "react";
import { FileText, Folder, Star } from "lucide-react";
import { listStarred, type StarredNode } from "@/lib/api";

export function StarredPanel() {
  const [items, setItems] = useState<StarredNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStarred()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xs text-muted-foreground">Couldn’t load starred items.</p>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Star className="h-6 w-6 text-muted-foreground/60" />
        <div>
          <p className="text-sm font-medium text-foreground">No starred pages</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Star pages from the page menu to keep them one click away.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
      {items.map((item) => {
        const Icon = item.type === "folder" ? Folder : FileText;
        const href =
          item.type === "page"
            ? `/w/${item.workspace_id}/pages/${item.node_id}`
            : `/w/${item.workspace_id}`;
        return (
          <li key={item.node_id}>
            <a
              href={href}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-accent"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.name}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
