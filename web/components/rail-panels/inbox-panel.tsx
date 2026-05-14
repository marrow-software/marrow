"use client";

import { useEffect, useState } from "react";
import { AtSign, Inbox, MessageCircle, Share2, Eye, Check } from "lucide-react";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import type { Notification, NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

function iconFor(kind: NotificationKind) {
  switch (kind) {
    case "mention":
      return AtSign;
    case "comment_reply":
      return MessageCircle;
    case "share_request":
      return Share2;
    case "watch_event":
      return Eye;
  }
}

function describe(n: Notification): string {
  const p = n.payload as Record<string, string | undefined>;
  switch (n.kind) {
    case "mention":
      return `You were mentioned in ${p.node_name ?? "a page"}`;
    case "comment_reply":
      return p.snippet ? `Reply: "${p.snippet}"` : "Someone replied to your comment";
    case "share_request":
      return `Share request (${p.role ?? "viewer"})`;
    case "watch_event":
      return "Watched item updated";
  }
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function InboxPanel() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyNotifications({ limit: 100 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setUnread(data.unread_count);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onMarkRead(n: Notification) {
    if (n.read_at) return;
    await markNotificationRead(n.id, true);
    setItems((prev) =>
      prev?.map((x) =>
        x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
      ) ?? null,
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  async function onReadAll() {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) =>
        prev?.map((x) => ({ ...x, read_at: x.read_at ?? now })) ?? null,
      );
      setUnread(0);
    } finally {
      setBusy(false);
    }
  }

  if (items === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </p>
        {unread > 0 && (
          <button
            type="button"
            onClick={onReadAll}
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((n) => {
          const Icon = iconFor(n.kind);
          const isUnread = n.read_at === null;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onMarkRead(n)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-sidebar-border px-3 py-2.5 text-left transition-colors hover:bg-accent",
                  isUnread && "bg-primary/5",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    isUnread ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      isUnread
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {describe(n)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {relativeTime(n.created_at)}
                  </p>
                </div>
                {!isUnread && (
                  <Check className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/60" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
