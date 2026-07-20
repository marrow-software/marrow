"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderClosed, Star } from "lucide-react";
import { listStarred } from "@/lib/api";
import type { StarredNode } from "@/lib/types";

export function StarredPanel({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<StarredNode[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listStarred()
      .then((nodes) => active && setItems(nodes))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  if (items === null && !error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || (items && items.length === 0)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Star className="h-6 w-6 text-muted-foreground/60" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {error ? "Couldn’t load starred pages" : "No starred pages"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Star pages from the page menu to keep them one click away.
          </p>
        </div>
      </div>
    );
  }

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {items!.map((node) => {
        const Icon = node.type === "folder" ? FolderClosed : FileText;
        return (
          <Link
            key={node.id}
            href={`/w/${workspaceId}/n/${node.id}/${node.slug}`}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
