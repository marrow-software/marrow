"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Copy,
  Eye,
  History,
  Link as LinkIcon,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { listStarred, starNode, unstarNode } from "@/lib/api";

export type PageMenuDrawer = "backlinks" | "history";

type Item =
  | { kind: "divider" }
  | {
      kind: "drawer";
      id: PageMenuDrawer;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      meta?: string;
    }
  | {
      kind: "action";
      id: string;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      meta?: string;
      destructive?: boolean;
    };

function buildItems(starred: boolean): Item[] {
  return [
    { kind: "drawer", id: "backlinks", icon: LinkIcon, label: "Backlinks", meta: "0" },
    { kind: "drawer", id: "history", icon: History, label: "Version history" },
    { kind: "divider" },
    {
      kind: "action",
      id: "star",
      icon: Star,
      label: starred ? "Unstar" : "Star",
      meta: "⌥S",
    },
    { kind: "action", id: "watch", icon: Eye, label: "Watch" },
    { kind: "divider" },
    { kind: "action", id: "duplicate", icon: Copy, label: "Duplicate" },
    { kind: "action", id: "move", icon: ArrowRight, label: "Move…" },
    { kind: "action", id: "export", icon: BookOpen, label: "Export as Markdown" },
    { kind: "divider" },
    { kind: "action", id: "archive", icon: Trash2, label: "Archive", destructive: true },
  ];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDrawer: (which: PageMenuDrawer) => void;
  trigger: React.ReactNode;
  nodeId?: string;
}

export function PageMenu({ open, onOpenChange, onOpenDrawer, trigger, nodeId }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (!open || !nodeId) return;
    let cancelled = false;
    listStarred()
      .then((items) => {
        if (!cancelled) setStarred(items.some((i) => i.node_id === nodeId));
      })
      .catch(() => {
        /* leave default */
      });
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  async function handleStarToggle() {
    if (!nodeId) {
      toast.info("Star — coming soon");
      return;
    }
    const wasStarred = starred;
    setStarred(!wasStarred);
    try {
      if (wasStarred) {
        await unstarNode(nodeId);
        toast.success("Removed from starred");
      } else {
        await starNode(nodeId);
        toast.success("Added to starred");
      }
    } catch (e) {
      setStarred(wasStarred);
      toast.error(e instanceof Error ? e.message : "Could not update star");
    }
  }

  const items = buildItems(starred);

  return (
    <div ref={wrapperRef} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-60 rounded-lg border border-border bg-popover p-1.5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]"
        >
          {items.map((item, i) => {
            if (item.kind === "divider") {
              return <div key={`div-${i}`} className="my-1 h-px bg-border" />;
            }

            const Icon = item.icon;
            const destructive = item.kind === "action" && item.destructive;
            const isStarItem = item.kind === "action" && item.id === "star";

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (item.kind === "drawer") {
                    onOpenDrawer(item.id);
                  } else if (isStarItem) {
                    void handleStarToggle();
                    onOpenChange(false);
                  } else {
                    toast.info(`${item.label} — coming soon`);
                    onOpenChange(false);
                  }
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent ${
                  destructive ? "text-destructive" : "text-foreground"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    destructive
                      ? "text-destructive"
                      : isStarItem && starred
                        ? "fill-current text-amber-500"
                        : "text-muted-foreground"
                  }`}
                />
                <span className="flex-1">{item.label}</span>
                {item.meta && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
