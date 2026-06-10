import Link from "next/link";
import {
  AtSign,
  Clock,
  Eye,
  FileText,
  Inbox,
  LayoutGrid,
  MessageSquareReply,
  Share2,
  Star,
} from "lucide-react";
import type {
  MyRecentItem,
  Notification,
  NotificationKind,
  Organization,
  StarredNode,
  Workspace,
} from "@/lib/types";
import { relativeTime } from "@/lib/utils";

function WidgetCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// --- Recently edited (cross-workspace) ----------------------------------------

export function RecentWidget({ items }: { items: MyRecentItem[] }) {
  return (
    <WidgetCard title="Recently edited" icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
      {items.length === 0 ? (
        <EmptyRow>Pages you edit across your workspaces show up here.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const crumb = [item.workspace_name, item.space_name, ...item.node_path].join(" / ");
            return (
              <li key={item.node_id}>
                <Link
                  href={`/w/${item.workspace_id}/n/${item.node_id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{crumb}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(item.updated_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

// --- Starred -----------------------------------------------------------------

export function StarredWidget({ items }: { items: StarredNode[] }) {
  // Starred nodes don't carry workspace context, so v1 lists them without deep
  // links. Reuses GET /api/users/me/starred as-is.
  return (
    <WidgetCard title="Starred" icon={<Star className="h-4 w-4 text-muted-foreground" />}>
      {items.length === 0 ? (
        <EmptyRow>Star a page to keep it close.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="truncate text-sm font-medium">{item.name}</p>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// --- Inbox summary -----------------------------------------------------------

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
      return `New reply on ${name}`;
    case "share_request":
      return `Share request for ${name}`;
    case "watch_event":
      return `Activity on ${name}`;
    default:
      return name;
  }
}

export function InboxWidget({
  notifications,
  unreadCount,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  return (
    <section id="inbox" className="rounded-xl border border-border scroll-mt-20">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        Inbox
        {unreadCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </h2>
      {notifications.length === 0 ? (
        <EmptyRow>You&apos;re all caught up.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.slice(0, 6).map((n) => {
            const Icon = KIND_ICON[n.kind] ?? Inbox;
            return (
              <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm">{summarize(n)}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(n.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- Workspace switcher ------------------------------------------------------

export function SwitcherWidget({
  workspaces,
  orgs,
}: {
  workspaces: Workspace[];
  orgs: Organization[];
}) {
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "Workspace";
  return (
    <WidgetCard
      title="Your workspaces"
      icon={<LayoutGrid className="h-4 w-4 text-muted-foreground" />}
    >
      {workspaces.length === 0 ? (
        <EmptyRow>
          No workspaces yet.{" "}
          <Link href="/workspaces" className="font-medium text-foreground underline">
            Create one
          </Link>
        </EmptyRow>
      ) : (
        <ul className="divide-y divide-border">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/w/${ws.id}`}
                className="flex flex-col px-4 py-3 transition-colors hover:bg-accent"
              >
                <span className="truncate text-sm font-medium">{ws.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {orgName(ws.org_id)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
