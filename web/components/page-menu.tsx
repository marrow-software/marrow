"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Copy,
  Eye,
  EyeOff,
  History,
  Link as LinkIcon,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBacklinks, getWatchStatus, unwatchNode, watchNode } from "@/lib/api";

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

const ITEMS: Item[] = [
  { kind: "drawer", id: "backlinks", icon: LinkIcon, label: "Backlinks" },
  { kind: "drawer", id: "history", icon: History, label: "Version history" },
  { kind: "divider" },
  { kind: "action", id: "star", icon: Star, label: "Star", meta: "⌥S" },
  { kind: "action", id: "watch", icon: Eye, label: "Watch" },
  { kind: "divider" },
  { kind: "action", id: "duplicate", icon: Copy, label: "Duplicate" },
  { kind: "action", id: "move", icon: ArrowRight, label: "Move…" },
  { kind: "action", id: "export", icon: BookOpen, label: "Export as Markdown" },
  { kind: "divider" },
  { kind: "action", id: "archive", icon: Trash2, label: "Archive", destructive: true },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDrawer: (which: PageMenuDrawer) => void;
  trigger: React.ReactNode;
  /** Current star state for this node — toggles the Star/Unstar item. */
  starred?: boolean;
  /** Invoked when the user clicks Star/Unstar. */
  onToggleStar?: () => void;
  /** Node (page or folder) this menu acts on; enables the Watch toggle. */
  nodeId?: string;
  /** Display name for archive confirmation. */
  pageName?: string;
  /** Nested pages/folders archived with this page; omit when unknown. */
  archiveNestedCount?: number;
  /** Soft-delete handler — caller owns navigation and save cancellation. */
  onArchive?: () => Promise<void>;
}

export function PageMenu({
  open,
  onOpenChange,
  onOpenDrawer,
  trigger,
  starred = false,
  onToggleStar,
  nodeId,
  pageName = "this page",
  archiveNestedCount,
  onArchive,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [watching, setWatching] = useState<boolean | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);
  const [backlinkCount, setBacklinkCount] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  // Load the current watch state each time the menu opens so the toggle
  // reflects reality (it may have changed in another tab/session).
  useEffect(() => {
    if (!open || !nodeId) return;
    let cancelled = false;
    getWatchStatus(nodeId)
      .then((s) => !cancelled && setWatching(s.watching))
      .catch(() => !cancelled && setWatching(null));
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  useEffect(() => {
    if (!open || !nodeId) return;
    let cancelled = false;
    getBacklinks(nodeId)
      .then((links) => !cancelled && setBacklinkCount(links.length))
      .catch(() => !cancelled && setBacklinkCount(null));
    return () => {
      cancelled = true;
    };
  }, [open, nodeId]);

  async function toggleWatch() {
    if (!nodeId || watchBusy) return;
    setWatchBusy(true);
    try {
      if (watching) {
        await unwatchNode(nodeId);
        setWatching(false);
        toast.success("Stopped watching");
      } else {
        await watchNode(nodeId);
        setWatching(true);
        toast.success("Watching — you'll be notified of changes");
      }
    } catch {
      toast.error("Couldn't update watch status");
    } finally {
      setWatchBusy(false);
    }
  }

  async function confirmArchive() {
    if (!nodeId || archiveBusy || !onArchive) return;
    setArchiveBusy(true);
    try {
      await onArchive();
      setArchiveOpen(false);
      onOpenChange(false);
    } catch {
      // onArchive shows the error toast
    } finally {
      setArchiveBusy(false);
    }
  }

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

  return (
    <div ref={wrapperRef} className="relative">
      {trigger}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-60 rounded-lg border border-border bg-popover p-1.5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]"
        >
          {ITEMS.map((item, i) => {
            if (item.kind === "divider") {
              return <div key={`div-${i}`} className="my-1 h-px bg-border" />;
            }

            if (item.kind === "action" && item.id === "watch") {
              const WatchIcon = watching ? EyeOff : Eye;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={!nodeId || watchBusy}
                  onClick={toggleWatch}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <WatchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    {watching ? "Unwatch" : "Watch"}
                  </span>
                </button>
              );
            }

            const isStar = item.kind === "action" && item.id === "star";
            const isArchive = item.kind === "action" && item.id === "archive";
            const Icon = item.icon;
            const destructive = item.kind === "action" && item.destructive;
            const label = isStar ? (starred ? "Unstar" : "Star") : item.label;
            const meta =
              item.kind === "drawer" && item.id === "backlinks" && backlinkCount !== null
                ? String(backlinkCount)
                : item.meta;

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (item.kind === "drawer") {
                    onOpenDrawer(item.id);
                  } else if (isStar && onToggleStar) {
                    onToggleStar();
                    onOpenChange(false);
                  } else if (isArchive) {
                    onOpenChange(false);
                    setArchiveOpen(true);
                  } else {
                    toast.info(`${label} — coming soon`);
                    onOpenChange(false);
                  }
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent ${
                  destructive ? "text-destructive" : "text-foreground"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isStar && starred
                      ? "fill-current text-primary"
                      : destructive
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                />
                <span className="flex-1">{label}</span>
                {meta && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {meta}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={archiveOpen} onOpenChange={(next) => !archiveBusy && setArchiveOpen(next)}>
        <DialogContent showCloseButton={!archiveBusy} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive this page?</DialogTitle>
            <DialogDescription>
              {archiveNestedCount != null && archiveNestedCount > 0 ? (
                <>
                  Archiving moves &ldquo;{pageName}&rdquo; and {archiveNestedCount} nested{" "}
                  {archiveNestedCount === 1 ? "item" : "items"} to trash.
                </>
              ) : archiveNestedCount === 0 ? (
                <>Archiving moves &ldquo;{pageName}&rdquo; to trash.</>
              ) : (
                <>
                  Archiving moves &ldquo;{pageName}&rdquo; and everything nested under it to
                  trash.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={archiveBusy}
              onClick={() => setArchiveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archiveBusy}
              onClick={confirmArchive}
            >
              {archiveBusy ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
