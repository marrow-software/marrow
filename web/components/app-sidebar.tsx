"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  Folder,
  FolderPlus,
  Plus,
  Settings,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import { toast } from "sonner";
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
import { createNode, createSpace, slugify, updateNode } from "@/lib/api";
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
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onInboxUnreadChange?: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Tree-state persistence (open/closed folders) — per workspace per user
// ---------------------------------------------------------------------------

function openStateKey(workspaceId: string, userId: string | null | undefined) {
  return `marrow.tree.open.${userId ?? "anon"}.${workspaceId}`;
}

function loadOpenState(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOpenState(key: string, state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be full or disabled; ignore
  }
}

// ---------------------------------------------------------------------------
// Drag payload + drop targets
// ---------------------------------------------------------------------------

interface DragPayload {
  nodeId: string;
  spaceId: string;
}

interface DropTarget {
  spaceId: string;
  parentId: string | null;
  before: string | null;
  after: string | null;
}

function dropId(spaceId: string, parentId: string | null, slot: "before" | "after" | "inside", nodeId?: string) {
  return `drop|${spaceId}|${parentId ?? "ROOT"}|${slot}|${nodeId ?? ""}`;
}

function parseDropId(id: string): { spaceId: string; parentId: string | null; slot: string; nodeId: string } | null {
  if (!id.startsWith("drop|")) return null;
  const [, spaceId, parentRaw, slot, nodeId] = id.split("|");
  return { spaceId, parentId: parentRaw === "ROOT" ? null : parentRaw, slot, nodeId };
}

// ---------------------------------------------------------------------------
// Recursive tree rendering
// ---------------------------------------------------------------------------

interface TreeContext {
  workspaceId: string;
  activePath: string;
  refresh: () => void;
  openMap: Record<string, boolean>;
  setOpen: (id: string, open: boolean) => void;
}

function NodeRow({
  node,
  depth,
  spaceId,
  parentId,
  siblings,
  index,
  ctx,
}: {
  node: NodeTreeItem;
  depth: number;
  spaceId: string;
  parentId: string | null;
  siblings: NodeTreeItem[];
  index: number;
  ctx: TreeContext;
}) {
  const router = useRouter();
  const isFolder = node.type === "folder";
  const isOpen = isFolder ? (ctx.openMap[node.id] ?? true) : false;
  const [creating, setCreating] = useState<null | "page" | "folder">(null);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `node|${node.id}`,
    data: { nodeId: node.id, spaceId } satisfies DragPayload,
  });

  // Drop "before" zone (above this row)
  const before = useDroppable({
    id: dropId(spaceId, parentId, "before", node.id),
  });
  // Drop "inside" zone (this folder)
  const inside = useDroppable({
    id: dropId(spaceId, node.id, "inside", node.id),
    disabled: !isFolder,
  });

  const indentStyle = { paddingLeft: `${depth * 12 + 8}px` };
  const href = isFolder ? null : `/w/${ctx.workspaceId}/n/${node.id}/${node.slug}`;
  const isActive = href ? ctx.activePath.startsWith(`/w/${ctx.workspaceId}/n/${node.id}`) : false;

  async function commitCreate(kind: "page" | "folder", name: string) {
    const lastChild = node.children[node.children.length - 1];
    const position = generateKeyBetween(lastChild?.position ?? null, null);
    try {
      const created = await createNode(spaceId, {
        type: kind,
        name,
        slug: slugify(name),
        parent_id: node.id,
        position,
      });
      setCreating(null);
      ctx.setOpen(node.id, true);
      if (kind === "page") {
        router.push(`/w/${ctx.workspaceId}/n/${created.id}/${created.slug}?new=1`);
      }
      ctx.refresh();
    } catch (e) {
      toast.error(`Failed to create ${kind}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      {/* Drop-before indicator zone */}
      <div
        ref={before.setNodeRef}
        className={`h-1 -my-0.5 ${before.isOver ? "bg-primary/40" : ""}`}
      />
      <div
        ref={setDragRef}
        style={{ ...indentStyle, opacity: isDragging ? 0.4 : undefined }}
        className="group flex items-center gap-1 py-0.5 pr-2"
        {...attributes}
        {...listeners}
      >
        <div ref={inside.setNodeRef} className="flex flex-1 items-center gap-1">
          {isFolder ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.setOpen(node.id, !isOpen);
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={isOpen ? "Collapse folder" : "Expand folder"}
            >
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          {isFolder ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {href ? (
            <a
              href={href}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex-1 truncate text-sm ${
                isActive ? "font-medium text-foreground" : "text-foreground/90 hover:text-foreground"
              }`}
            >
              {node.name}
            </a>
          ) : (
            <span className="flex-1 truncate text-sm text-foreground/90">{node.name}</span>
          )}
          {inside.isOver && isFolder && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </div>
        {isFolder && (
          <div className="hidden gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.setOpen(node.id, true);
                setCreating("page");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground"
              title="New page"
              aria-label="New page"
            >
              <FilePlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.setOpen(node.id, true);
                setCreating("folder");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground"
              title="New folder"
              aria-label="New folder"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {isFolder && isOpen && (
        <div>
          {node.children.map((child, i) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              spaceId={spaceId}
              parentId={node.id}
              siblings={node.children}
              index={i}
              ctx={ctx}
            />
          ))}
          {creating && (
            <InlineCreateRow
              placeholder={creating === "page" ? "Page title" : "Folder name"}
              className="flex items-center gap-2 py-0.5 pr-2"
              style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}
              icon={
                creating === "page" ? (
                  <FilePlus className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <FolderPlus className="h-3 w-3 text-muted-foreground" />
                )
              }
              onCommit={(name) => commitCreate(creating, name)}
              onCancel={() => setCreating(null)}
            />
          )}
          {/* Drop-into-empty-folder zone */}
          {node.children.length === 0 && !creating && (
            <div style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }} className="py-0.5 text-xs text-muted-foreground/70">
              Empty
            </div>
          )}
        </div>
      )}
      {/* Tail drop zone — only after the last sibling, used to drop after this node */}
      {index === siblings.length - 1 && (
        <DropAfter spaceId={spaceId} parentId={parentId} nodeId={node.id} depth={depth} />
      )}
    </div>
  );
}

function DropAfter({
  spaceId,
  parentId,
  nodeId,
  depth,
}: {
  spaceId: string;
  parentId: string | null;
  nodeId: string;
  depth: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId(spaceId, parentId, "after", nodeId),
  });
  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      className={`h-1 ${isOver ? "bg-primary/40" : ""}`}
    />
  );
}

function SpaceSection({
  space,
  ctx,
  onCreated,
}: {
  space: SpaceTreeItem;
  ctx: TreeContext;
  onCreated: () => void;
}) {
  const headerKey = `space:${space.id}`;
  const isOpen = ctx.openMap[headerKey] ?? true;
  const [creating, setCreating] = useState<null | "page" | "folder">(null);
  const router = useRouter();

  // Drop-into-empty-space zone
  const emptyDrop = useDroppable({
    id: dropId(space.id, null, "inside", `space:${space.id}`),
  });

  async function commitRoot(kind: "page" | "folder", name: string) {
    const lastRoot = space.nodes[space.nodes.length - 1];
    const position = generateKeyBetween(lastRoot?.position ?? null, null);
    try {
      const created = await createNode(space.id, {
        type: kind,
        name,
        slug: slugify(name),
        parent_id: null,
        position,
      });
      setCreating(null);
      ctx.setOpen(headerKey, true);
      onCreated();
      if (kind === "page") {
        router.push(`/w/${ctx.workspaceId}/n/${created.id}/${created.slug}?new=1`);
      }
    } catch (e) {
      toast.error(`Failed to create ${kind}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <SidebarGroup>
      <div className="group flex items-center justify-between">
        <SidebarGroupLabel
          className="flex flex-1 cursor-pointer items-center gap-2"
          onClick={() => ctx.setOpen(headerKey, !isOpen)}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
            {space.name[0]?.toUpperCase()}
          </span>
          {space.name}
        </SidebarGroupLabel>
        <div className="mr-2 hidden gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={() => {
              ctx.setOpen(headerKey, true);
              setCreating("page");
            }}
            className="text-muted-foreground hover:text-foreground"
            title="New page"
            aria-label="New page"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              ctx.setOpen(headerKey, true);
              setCreating("folder");
            }}
            className="text-muted-foreground hover:text-foreground"
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {isOpen && (
        <SidebarGroupContent>
          {space.nodes.map((node, i) => (
            <NodeRow
              key={node.id}
              node={node}
              depth={0}
              spaceId={space.id}
              parentId={null}
              siblings={space.nodes}
              index={i}
              ctx={ctx}
            />
          ))}
          {creating && (
            <InlineCreateRow
              placeholder={creating === "page" ? "Page title" : "Folder name"}
              className="flex items-center gap-2 py-0.5 pr-2"
              style={{ paddingLeft: "28px" }}
              icon={
                creating === "page" ? (
                  <FilePlus className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <FolderPlus className="h-3 w-3 text-muted-foreground" />
                )
              }
              onCommit={(name) => commitRoot(creating, name)}
              onCancel={() => setCreating(null)}
            />
          )}
          {space.nodes.length === 0 && !creating && (
            <div
              ref={emptyDrop.setNodeRef}
              className={`px-4 py-2 text-xs text-muted-foreground ${
                emptyDrop.isOver ? "bg-primary/10" : ""
              }`}
            >
              Empty — hover the space header to add a page or folder.
            </div>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

function WorkspaceHeader({ tree, memberCount }: { tree: WorkspaceTree; memberCount: number | null }) {
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
        <a
          href={`/orgs/${tree.org_id}/settings`}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Organization settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </a>
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

// ---------------------------------------------------------------------------
// Drag end → compute new position via fractional-indexing and PATCH the node
// ---------------------------------------------------------------------------

function findNode(spaces: SpaceTreeItem[], nodeId: string):
  | { node: NodeTreeItem; spaceId: string; parentId: string | null; siblings: NodeTreeItem[] }
  | null
{
  for (const sp of spaces) {
    const found = walk(sp.nodes, nodeId, null, sp.id);
    if (found) return found;
  }
  return null;
  function walk(
    list: NodeTreeItem[],
    target: string,
    parentId: string | null,
    spaceId: string,
  ): { node: NodeTreeItem; spaceId: string; parentId: string | null; siblings: NodeTreeItem[] } | null {
    for (const n of list) {
      if (n.id === target) return { node: n, spaceId, parentId, siblings: list };
      const inner = walk(n.children, target, n.id, spaceId);
      if (inner) return inner;
    }
    return null;
  }
}

function siblingsOfParent(spaces: SpaceTreeItem[], spaceId: string, parentId: string | null): NodeTreeItem[] {
  const sp = spaces.find((s) => s.id === spaceId);
  if (!sp) return [];
  if (parentId === null) return sp.nodes;
  const found = findNode(spaces, parentId);
  return found?.node.children ?? [];
}

function isDescendant(spaces: SpaceTreeItem[], rootId: string, candidateId: string): boolean {
  const found = findNode(spaces, rootId);
  if (!found) return false;
  const stack = [...found.node.children];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.id === candidateId) return true;
    stack.push(...cur.children);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pages panel
// ---------------------------------------------------------------------------

function PagesPanel({
  tree,
  activePath,
  refresh,
  user,
}: {
  tree: WorkspaceTree;
  activePath: string;
  refresh: () => void;
  user?: User | null;
}) {
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [dragNodeName, setDragNodeName] = useState<string | null>(null);

  const storageKey = useMemo(() => openStateKey(tree.id, user?.id), [tree.id, user?.id]);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // Load persisted open state on mount / when storage key changes
  useEffect(() => {
    setOpenMap(loadOpenState(storageKey));
  }, [storageKey]);

  const setOpen = useCallback(
    (id: string, open: boolean) => {
      setOpenMap((prev) => {
        const next = { ...prev, [id]: open };
        saveOpenState(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const ctx: TreeContext = { workspaceId: tree.id, activePath, refresh, openMap, setOpen };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("node|")) {
      const found = findNode(tree.spaces, id.slice("node|".length));
      setDragNodeName(found?.node.name ?? null);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragNodeName(null);
    if (!e.over) return;
    const activeId = String(e.active.id);
    if (!activeId.startsWith("node|")) return;
    const draggedId = activeId.slice("node|".length);
    const dragged = findNode(tree.spaces, draggedId);
    if (!dragged) return;

    const target = parseDropId(String(e.over.id));
    if (!target) return;

    // Cross-workspace drop guard. (All spaces in `tree` belong to one workspace,
    // so this is a defensive check matching the PRD non-goal.)
    if (!tree.spaces.some((s) => s.id === target.spaceId)) {
      toast.error("Cannot move across workspaces");
      return;
    }

    // Same-space, same-position no-op guard for "inside" drop on self.
    if (target.parentId === draggedId) return;

    // Cycle guard: can't drop a folder into its own descendant.
    if (target.parentId && isDescendant(tree.spaces, draggedId, target.parentId)) {
      toast.error("Cannot move a folder into one of its descendants");
      return;
    }

    // Determine the new sibling list (parent's children) and compute position.
    const targetSiblings = siblingsOfParent(tree.spaces, target.spaceId, target.parentId)
      .filter((n) => n.id !== draggedId);

    let before: string | null = null;
    let after: string | null = null;

    if (target.slot === "inside") {
      // Append to end of the new parent's children
      before = targetSiblings[targetSiblings.length - 1]?.position ?? null;
      after = null;
    } else {
      // Find index of the anchor node in the (filtered) sibling list
      const anchorIdx = targetSiblings.findIndex((n) => n.id === target.nodeId);
      if (anchorIdx === -1) {
        // Anchor node not found in siblings — fall back to appending at the end
        before = targetSiblings[targetSiblings.length - 1]?.position ?? null;
        after = null;
      } else if (target.slot === "before") {
        before = anchorIdx > 0 ? targetSiblings[anchorIdx - 1].position : null;
        after = targetSiblings[anchorIdx].position;
      } else {
        // "after"
        before = targetSiblings[anchorIdx].position;
        after = anchorIdx + 1 < targetSiblings.length ? targetSiblings[anchorIdx + 1].position : null;
      }
    }

    let newPosition: string;
    try {
      newPosition = generateKeyBetween(before, after);
    } catch (err) {
      toast.error(`Failed to compute new position: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const reparented = target.parentId !== dragged.parentId;
    const noop =
      !reparented && dragged.node.position === newPosition;
    if (noop) return;

    // Optimistic UI: tweak the displayed position on the dragged node. Because
    // `tree` is server-driven via router.refresh(), we trigger a refresh after
    // the PATCH succeeds. On failure we restore by re-fetching too.
    try {
      await updateNode(draggedId, {
        parent_id: reparented ? target.parentId : undefined,
        position: newPosition,
      });
      refresh();
    } catch (err) {
      toast.error(`Move failed: ${err instanceof Error ? err.message : String(err)}`);
      refresh(); // rollback by re-syncing with server
    }
  }

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {tree.spaces.map((space) => (
          <SpaceSection key={space.id} space={space} ctx={ctx} onCreated={refresh} />
        ))}
        <DragOverlay>
          {dragNodeName && (
            <div className="rounded border border-border bg-popover px-2 py-1 text-sm shadow">
              {dragNodeName}
            </div>
          )}
        </DragOverlay>
      </DndContext>
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

export function AppSidebar({ tree, user, panel, memberCount, showOrgSettings, searchInputRef, onInboxUnreadChange }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <WorkspaceHeader tree={tree} memberCount={memberCount} />

      {panel === "pages" && (
        <PagesPanel tree={tree} activePath={pathname} refresh={refresh} user={user} />
      )}
      {panel === "search" && <SearchPanel workspaceId={tree.id} inputRef={searchInputRef} />}
      {panel === "starred" && <StarredPanel workspaceId={tree.id} />}
      {panel === "inbox" && <InboxPanel onUnreadChange={onInboxUnreadChange} />}
    </aside>
  );
}

// Used in unit tests / debugging — exported for completeness
export const __test = { generateKeyBetween, findNode, isDescendant, dropId, parseDropId };
