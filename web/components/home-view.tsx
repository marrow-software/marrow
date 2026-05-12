"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileText,
  FolderTree,
  Inbox,
  Sparkles,
  Star,
} from "lucide-react";
import { useWorkspaceTree } from "@/components/workspace-tree-context";
import { useRecentPages } from "@/lib/recent-pages";
import type { SpaceTreeItem, User } from "@/lib/types";

interface Props {
  user: User | null;
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(user: User | null): string {
  if (!user?.name) return "";
  return user.name.split(/\s+/)[0] ?? "";
}

function totalPages(space: SpaceTreeItem): number {
  return space.collections.reduce((acc, c) => acc + c.pages.length, 0);
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function HomeView({ user }: Props) {
  const tree = useWorkspaceTree();
  const recent = useRecentPages(tree?.id ?? "");

  if (!tree) return null;

  const hasContent = tree.spaces.some((s) => s.collections.length > 0);
  const name = firstName(user);

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-8 py-10">
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          {greeting(new Date())}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&rsquo;s what&rsquo;s waiting for you in{" "}
          <span className="text-foreground">{tree.name}</span>.
        </p>
      </header>

      {!hasContent ? (
        <EmptyWorkspace workspaceId={tree.id} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <SectionHeader icon={<Clock className="h-3.5 w-3.5" />} label="Continue where you left off" />
            {recent.length === 0 ? (
              <EmptyCard
                title="Nothing yet"
                description="Open a page and it&rsquo;ll show up here so you can pick up where you left off."
              />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {recent.slice(0, 6).map((r) => (
                  <li key={r.pageId}>
                    <Link
                      href={`/w/${tree.id}/pages/${r.pageId}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm text-foreground">
                        {r.title || "Untitled"}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatRelative(r.visitedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-6">
            <section>
              <SectionHeader icon={<Inbox className="h-3.5 w-3.5" />} label="Inbox" />
              <EmptyCard
                compact
                title="All clear"
                description="Mentions and review requests will land here."
              />
            </section>
            <section>
              <SectionHeader icon={<Star className="h-3.5 w-3.5" />} label="Starred" />
              <EmptyCard
                compact
                title="Nothing starred"
                description="Star a page to keep it one click away."
              />
            </section>
          </aside>

          <section className="lg:col-span-3">
            <SectionHeader
              icon={<FolderTree className="h-3.5 w-3.5" />}
              label="Your spaces"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tree.spaces.map((space) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  workspaceId={tree.id}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}

function EmptyCard({
  title,
  description,
  compact,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-muted/20 ${
        compact ? "px-4 py-4" : "px-6 py-8"
      }`}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SpaceCard({
  space,
  workspaceId,
}: {
  space: SpaceTreeItem;
  workspaceId: string;
}) {
  const pageCount = totalPages(space);
  const firstPage = space.collections.find((c) => c.pages.length > 0)?.pages[0];
  const href = firstPage
    ? `/w/${workspaceId}/pages/${firstPage.id}`
    : `/w/${workspaceId}`;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <span className="truncate font-medium text-foreground">{space.name}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">
        {space.collections.length}{" "}
        {space.collections.length === 1 ? "collection" : "collections"} ·{" "}
        {pageCount} {pageCount === 1 ? "page" : "pages"}
      </span>
    </Link>
  );
}

function EmptyWorkspace({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-8 py-12 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <h2 className="mt-4 font-heading text-xl font-semibold">
        Your workspace is a blank slate
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Create a space to organize your knowledge, then add collections and pages.
        Everything you build can be exported and restored exactly.
      </p>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Tip — use the sidebar&rsquo;s <span className="text-foreground">+</span> buttons to
        get started
      </p>
      <Link
        href={`/w/${workspaceId}`}
        className="sr-only"
        aria-hidden="true"
      >
        workspace
      </Link>
    </div>
  );
}
