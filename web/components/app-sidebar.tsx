"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FilePlus, FolderPlus, Plus, Settings } from "lucide-react";
import { ExportDialog } from "@/components/export-dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { InlineCreateRow } from "@/components/sidebar/inline-create-row";
import { createNode, createSpace, slugify } from "@/lib/api";
import { SearchPanel } from "@/components/rail-panels/search-panel";
import { StarredPanel } from "@/components/rail-panels/starred-panel";
import { InboxPanel } from "@/components/rail-panels/inbox-panel";
import type { RailPanel } from "@/components/app-rail";
import type { NodeTreeItem, SpaceTreeItem, User, WorkspaceTree } from "@/lib/types";

interface Props {
  tree: WorkspaceTree;
  user?: User | null;
  panel: RailPanel;
  memberCount: number | null;
  showOrgSettings: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

function NodeRow({
  node,
  spaceId,
  workspaceId,
  activePath,
  depth,
  onCreated,
}: {
  node: NodeTreeItem;
  spaceId: string;
  workspaceId: string;
  activePath: string;
  depth: number;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [creatingPage, setCreatingPage] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const router = useRouter();

  const href = `/w/${workspaceId}/n/${node.id}/${node.slug}`;
  const isActive = activePath.startsWith(`/w/${workspaceId}/n/${node.id}`);
  const indent = { paddingLeft: `${depth * 0.75 + 0.5}rem` };

  if (node.type === "page") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton render={<a href={href} />} isActive={isActive} size="sm" style={indent}>
          {node.name}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Folder
  function startCreatePage() {
    setOpen(true);
    setCreatingPage(true);
  }
  function startCreateFolder() {
    setOpen(true);
    setCreatingFolder(true);
  }

  return (
    <div>
      <div
        className="group flex items-center justify-between py-0.5"
        style={indent}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1 truncate text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <a
            href={href}
            onClick={(e) => e.stopPropagation()}
            className={`truncate ${isActive ? "text-foreground" : ""}`}
          >
            {node.name}
          </a>
        </button>
        <div className="hidden items-center gap-1 pr-2 group-hover:flex">
          <button
            type="button"
            onClick={startCreateFolder}
            className="text-muted-foreground hover:text-foreground"
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={startCreatePage}
            className="text-muted-foreground hover:text-foreground"
            title="New page"
            aria-label="New page"
          >
            <FilePlus className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open && (
        <SidebarMenu>
          {creatingFolder && (
            <InlineCreateRow
              placeholder="Folder name"
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 0.75 + 0.5}rem` }}
              icon={<FolderPlus className="h-3 w-3 text-muted-foreground" />}
              onCommit={async (name) => {
                await createNode(spaceId, "folder", name, { parent_id: node.id });
                setCreatingFolder(false);
                onCreated();
              }}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
          {creatingPage && (
            <InlineCreateRow
              placeholder="Page title"
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${(depth + 1) * 0.75 + 0.5}rem` }}
              icon={<FilePlus className="h-3 w-3 text-muted-foreground" />}
              onCommit={async (name) => {
                const page = await createNode(spaceId, "page", name, { parent_id: node.id });
                setCreatingPage(false);
                router.push(`/w/${workspaceId}/n/${page.id}/${page.slug}?new=1`);
                onCreated();
              }}
              onCancel={() => setCreatingPage(false)}
            />
          )}
          {node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              spaceId={spaceId}
              workspaceId={workspaceId}
              activePath={activePath}
              depth={depth + 1}
              onCreated={onCreated}
            />
          ))}
          {!creatingPage && !creatingFolder && node.children.length === 0 && (
            <p
              className="py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 0.75 + 0.5}rem` }}
            >
              Empty
            </p>
          )}
        </SidebarMenu>
      )}
    </div>
  );
}

function SpaceSection({
  space,
  workspaceId,
  activePath,
  onCreated,
}: {
  space: SpaceTreeItem;
  workspaceId: string;
  activePath: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [creatingPage, setCreatingPage] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const router = useRouter();

  return (
    <SidebarGroup>
      <div className="group flex items-center justify-between">
        <SidebarGroupLabel
          className="flex flex-1 cursor-pointer items-center gap-2"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
            {space.name[0]?.toUpperCase()}
          </span>
          {space.name}
        </SidebarGroupLabel>
        <div className="mr-2 hidden items-center gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setCreatingFolder(true);
            }}
            className="text-muted-foreground hover:text-foreground"
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setCreatingPage(true);
            }}
            className="text-muted-foreground hover:text-foreground"
            title="New page"
            aria-label="New page"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {open && (
        <SidebarGroupContent>
          {creatingFolder && (
            <InlineCreateRow
              placeholder="Folder name"
              className="ml-3 flex items-center gap-2 py-0.5"
              icon={<FolderPlus className="h-3 w-3 text-muted-foreground" />}
              onCommit={async (name) => {
                await createNode(space.id, "folder", name);
                setCreatingFolder(false);
                onCreated();
              }}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
          {creatingPage && (
            <InlineCreateRow
              placeholder="Page title"
              className="ml-3 flex items-center gap-2 py-0.5"
              icon={<FilePlus className="h-3 w-3 text-muted-foreground" />}
              onCommit={async (name) => {
                const page = await createNode(space.id, "page", name);
                setCreatingPage(false);
                router.push(`/w/${workspaceId}/n/${page.id}/${page.slug}?new=1`);
                onCreated();
              }}
              onCancel={() => setCreatingPage(false)}
            />
          )}
          {space.nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              spaceId={space.id}
              workspaceId={workspaceId}
              activePath={activePath}
              depth={0}
              onCreated={onCreated}
            />
          ))}
          {!creatingPage && !creatingFolder && space.nodes.length === 0 && (
            <p className="px-4 py-1 text-xs text-muted-foreground">No content yet</p>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

function WorkspaceHeader({
  tree,
  memberCount,
  showOrgSettings,
}: {
  tree: WorkspaceTree;
  memberCount: number | null;
  showOrgSettings: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-sidebar-border px-3.5 py-3 group">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-foreground">{tree.name}</div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {memberCount !== null ? `${memberCount} member${memberCount === 1 ? "" : "s"}` : "workspace"}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExportDialog workspaceId={tree.id} workspaceName={tree.name} />
        {showOrgSettings && (
          <a
            href={`/orgs/${tree.org_id}/settings`}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Organization settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Workspace menu"
        aria-label="Workspace menu"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PagesPanel({
  tree,
  activePath,
  refresh,
}: {
  tree: WorkspaceTree;
  activePath: string;
  refresh: () => void;
}) {
  const [creatingSpace, setCreatingSpace] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      <div className="flex items-center justify-between px-3 py-1 group">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Spaces
        </span>
        <button
          type="button"
          onClick={() => setCreatingSpace(true)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          title="New space"
          aria-label="New space"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {creatingSpace && (
        <InlineCreateRow
          placeholder="Space name"
          className="flex items-center gap-2 px-3 py-1"
          icon={
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
              ·
            </span>
          }
          onCommit={async (name) => {
            await createSpace(tree.id, slugify(name), name);
            setCreatingSpace(false);
            refresh();
          }}
          onCancel={() => setCreatingSpace(false)}
        />
      )}
      {tree.spaces.map((space) => (
        <SpaceSection
          key={space.id}
          space={space}
          workspaceId={tree.id}
          activePath={activePath}
          onCreated={refresh}
        />
      ))}
      {!creatingSpace && tree.spaces.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No spaces yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Hover <strong>Spaces</strong> above and click <strong>+</strong> to create one.
          </p>
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ tree, panel, memberCount, showOrgSettings, searchInputRef }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <WorkspaceHeader tree={tree} memberCount={memberCount} showOrgSettings={showOrgSettings} />

      {panel === "pages" && <PagesPanel tree={tree} activePath={pathname} refresh={refresh} />}
      {panel === "search" && <SearchPanel workspaceId={tree.id} inputRef={searchInputRef} />}
      {panel === "starred" && <StarredPanel />}
      {panel === "inbox" && <InboxPanel />}
    </aside>
  );
}
