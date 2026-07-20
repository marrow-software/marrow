"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Inbox, MessageSquareReply, Share2, Eye } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import type { Notification, NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NotificationKind, typeof AtSign> = {
  mention: AtSign,
  comment_reply: MessageSquareReply,
  share_request: Share2,
  watch_event: Eye,
};

function summarize(n: Notification): string {
  const name = (n.payload.node_name as string) || "a page";
  switch (n.kind) {
    case "mention":
      return `You were mentioned in ${name}`;
    case "comment_reply":
      return `New reply to your comment on ${name}`;
    case "share_request":
      return `Share request for ${name}`;
    case "watch_event":
      return `Activity on ${name}`;
    default:
      return name;
  }
}

interface Props {
  onUnreadChange?: (count: number) => void;
}

export function InboxPanel({ onUnreadChange }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function load() {
    try {
      const res = await listNotifications();
      setItems(res.notifications);
      onUnreadChange?.(res.unread_count);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function unreadCount(list: Notification[]) {
    return list.filter((n) => !n.read_at).length;
  }

  async function onItemClick(n: Notification) {
    if (!n.read_at) {
      setItems((prev) => {
        const next = prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        );
        onUnreadChange?.(unreadCount(next));
        return next;
      });
      try {
        await markNotificationRead(n.id);
      } catch {
        /* optimistic — a reload will reconcile */
      }
    }
    const nodeId = n.payload.node_id as string | undefined;
    const workspaceId = n.payload.workspace_id as string | undefined;
    if (nodeId && workspaceId) {
      router.push(`/w/${workspaceId}/n/${nodeId}`);
    }
  }

  async function onMarkAll() {
    setItems((prev) => {
      const next = prev.map((x) => ({
        ...x,
        read_at: x.read_at ?? new Date().toISOString(),
      }));
      onUnreadChange?.(0);
      return next;
    });
    try {
      await markAllNotificationsRead();
    } catch {
      /* optimistic */
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground/60" />
        <div>
          <p className="text-sm font-medium text-foreground">Inbox is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mentions, review requests, and comment replies will show up here.
          </p>
        </div>
      </div>
    );
  }

  const hasUnread = unreadCount(items) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Inbox</span>
        {hasUnread && (
          <button
            type="button"
            onClick={onMarkAll}
            className="text-xs text-primary hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((n) => {
          const Icon = KIND_ICON[n.kind] ?? Inbox;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onItemClick(n)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent",
                  !n.read_at && "bg-primary/[0.06]"
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    n.read_at ? "text-muted-foreground" : "text-primary"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      n.read_at
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    )}
                  >
                    {summarize(n)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read_at && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
