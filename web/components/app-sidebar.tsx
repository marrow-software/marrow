"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Plus,
  Settings,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { toast } from "sonner";
import { ExportDialog } from "@/components/export-dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { InlineCreateRow } from "@/components/sidebar/inline-create-row";
import { createNode, createSpace, updateNode, slugify } from "@/lib/api";
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
}

// ---------------------------------------------------------------------------
// Tree open-state persistence
// ---------------------------------------------------------------------------

function useOpenNodes(workspaceId: string, userId?: string) {
  const key = `marrow-tree-open-${workspaceId}-${userId ?? "anon"}`;

  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(key);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback(
    (id: string) => {
      setOpenSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {}
        return next;
      });
    },
    [key]
  );

  const open = useCallback(
    (id: string) => {
      setOpenSet((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {}
        return next;
      });
    },
    [key]
  );

  return { openSet, toggle, open };
}

// ---------------------------------------------------------------------------
// Flatten / find helpers
// ---------------------------------------------------------------------------

interface FlatNode {
  node: NodeTreeItem;
  spaceId: string;
  parentId: string | null;
  siblings: NodeTreeItem[];
  index: number;
}

function flattenNodes(
  nodes: NodeTreeItem[],
  spaceId: string,
  parentId: string | null
): FlatNode[] {
  const result: FlatNode[] = [];
  nodes.forEach((node, index) => {
    result.push({ node, spaceId, parentId, siblings: nodes, index });
    result.push(...flattenNodes(node.children, spaceId, node.id));
  });
  return result;
}

function flattenTree(tree: WorkspaceTree): FlatNode[] {
  return tree.spaces.flatMap((space) =>
    flattenNodes(space.nodes, space.id, null)
  );
}

// ---------------------------------------------------------------------------
// Inline-create type picker
// ---------------------------------------------------------------------------

function CreateTypeMenu({
  onChoose,
  onClose,
}: {
  onChoose: (type: "page" | "folder") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 z-50 mt-1 rounded-md border border-border bg-popover p-1 shadow-md text-sm"
    >
      <button
        type="button"
        onClick={() => onChoose("page")}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-foreground text-muted-foreground"
      >
        <FilePlus className="h-3.5 w-3.5" />
        New page
      </button>
      <button
        type="button"
        onClick={() => onChoose("folder")}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-foreground text-muted-foreground"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        New folder
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive NodeTreeItem
// ---------------------------------------------------------------------------

interface NodeItemProps {
  node: NodeTreeItem;
  spaceId: string;
  workspaceId: string;
  activePath: string;
  depth: number;
  openSet: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onCreated: () => void;
  dragOverFolderId: string | null;
}

function SortableNodeItem(props: NodeItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-40" : ""}>
      <NodeItem {...props} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  );
}

function NodeItem({
  node,
  spaceId,
  workspaceId,
  activePath,
  depth,
  openSet,
  onToggle,
  onOpen,
  onCreated,
  dragOverFolderId,
  dragListeners,
  dragAttributes,
}: NodeItemProps & {
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState<"page" | "folder" | null>(null);
  const isOpen = openSet.has(node.id);
  const isOverFolder = dragOverFolderId === node.id;

  const indent = depth * 12 + 8;

  function startCreate(type: "page" | "folder") {
    setMenuOpen(false);
    onOpen(node.id);
    setCreating(type);
  }

  if (node.type === "page") {
    const href = `/w/${workspaceId}/pages/${node.id}`;
    const isActive = activePath === href;

    return (
      <a
        href={href}
        style={{ paddingLeft: `${indent}px` }}
        className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm ${
          isActive
            ? "bg-accent text-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        }`}
        {...dragAttributes}
        {...dragListeners}
      >
        <File className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </a>
    );
  }

  // folder
  return (
    <div>
      <div
        className={`group relative flex items-center rounded-md ${isOverFolder ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          style={{ paddingLeft: `${indent}px` }}
          className="flex flex-1 items-center gap-1.5 py-1 pr-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground rounded-md"
          {...dragAttributes}
          {...dragListeners}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>

        <div className="relative mr-1.5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            title="New item"
            aria-label="New item"
          >
            <Plus className="h-3 w-3" />
          </button>
          {menuOpen && (
            <CreateTypeMenu
              onChoose={startCreate}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {isOpen && (
        <SortableContext
          items={node.children.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {node.children.map((child) => (
            <SortableNodeItem
              key={child.id}
              node={child}
              spaceId={spaceId}
              workspaceId={workspaceId}
              activePath={activePath}
              depth={depth + 1}
              openSet={openSet}
              onToggle={onToggle}
              onOpen={onOpen}
              onCreated={onCreated}
              dragOverFolderId={dragOverFolderId}
            />
          ))}
          {creating && (
            <InlineCreateRow
              placeholder={creating === "page" ? "Page title" : "Folder name"}
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              className="flex items-center gap-2 py-1 pr-2"
              icon={
                creating === "page" ? (
                  <FilePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )
              }
              onCommit={async (name) => {
                const created = await createNode(spaceId, {
                  type: creating,
                  name,
                  parent_id: node.id,
                });
                setCreating(null);
                if (created.type === "page") {
                  router.push(`/w/${workspaceId}/pages/${created.id}?new=1`);
                }
                onCreated();
              }}
              onCancel={() => setCreating(null)}
            />
          )}
          {!creating && node.children.length === 0 && (
            <p
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              className="py-1 text-xs text-muted-foreground/60"
            >
              Empty
            </p>
          )}
        </SortableContext>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpaceSection
// ---------------------------------------------------------------------------

function SpaceSection({
  space,
  workspaceId,
  activePath,
  openSet,
  onToggle,
  onOpen,
  onCreated,
  dragOverFolderId,
}: {
  space: SpaceTreeItem;
  workspaceId: string;
  activePath: string;
  openSet: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onCreated: () => void;
  dragOverFolderId: string | null;
}) {
  const spaceOpen = openSet.has(`space-${space.id}`);
  const [creating, setCreating] = useState<"page" | "folder" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  return (
    <SidebarGroup>
      <div className="flex items-center justify-between group">
        <SidebarGroupLabel
          className="flex flex-1 cursor-pointer items-center gap-2"
          onClick={() => onToggle(`space-${space.id}`)}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
            {space.name[0]?.toUpperCase()}
          </span>
          {space.name}
        </SidebarGroupLabel>

        <div className="relative mr-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="hidden group-hover:flex items-center text-muted-foreground hover:text-foreground"
            title="New item in space"
            aria-label="New item in space"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <CreateTypeMenu
              onChoose={(type) => {
                setMenuOpen(false);
                if (!spaceOpen) onToggle(`space-${space.id}`);
                setCreating(type);
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {spaceOpen && (
        <SidebarGroupContent>
          <SortableContext
            items={space.nodes.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {space.nodes.map((node) => (
              <SortableNodeItem
                key={node.id}
                node={node}
                spaceId={space.id}
                workspaceId={workspaceId}
                activePath={activePath}
                depth={0}
                openSet={openSet}
                onToggle={onToggle}
                onOpen={onOpen}
                onCreated={onCreated}
                dragOverFolderId={dragOverFolderId}
              />
            ))}
          </SortableContext>

          {creating && (
            <InlineCreateRow
              placeholder={creating === "page" ? "Page title" : "Folder name"}
              className="flex items-center gap-2 px-2 py-1"
              icon={
                creating === "page" ? (
                  <FilePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )
              }
              onCommit={async (name) => {
                const created = await createNode(space.id, {
                  type: creating,
                  name,
                  parent_id: null,
                });
                setCreating(null);
                if (created.type === "page") {
                  router.push(`/w/${workspaceId}/pages/${created.id}?new=1`);
                }
                onCreated();
              }}
              onCancel={() => setCreating(null)}
            />
          )}

          {!creating && space.nodes.length === 0 && (
            <p className="px-4 py-1 text-xs text-muted-foreground">
              No content yet
            </p>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceHeader
// ---------------------------------------------------------------------------

function WorkspaceHeader({
  tree,
  memberCount,
}: {
  tree: WorkspaceTree;
  memberCount: number | null;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-sidebar-border px-3.5 py-3 group">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-foreground">
          {tree.name}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {memberCount !== null
            ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
            : "workspace"}
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
// Drag overlay item
// ---------------------------------------------------------------------------

function DragOverlayItem({ node }: { node: NodeTreeItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-accent/80 px-2 py-1 text-sm text-foreground shadow-lg backdrop-blur-sm">
      {node.type === "folder" ? (
        <Folder className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <File className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PagesPanel with DnD context
// ---------------------------------------------------------------------------

function PagesPanel({
  tree,
  user,
  activePath,
  refresh,
}: {
  tree: WorkspaceTree;
  user?: User | null;
  activePath: string;
  refresh: () => void;
}) {
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [localTree, setLocalTree] = useState<WorkspaceTree>(tree);
  const [activeNode, setActiveNode] = useState<NodeTreeItem | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const { openSet, toggle, open } = useOpenNodes(tree.id, user?.id);

  // Sync localTree when parent tree refreshes
  useEffect(() => {
    setLocalTree(tree);
  }, [tree]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Build a flat lookup of all nodes for DnD resolution
  const allFlat = flattenTree(localTree);
  const nodeMap = new Map(allFlat.map((f) => [f.node.id, f]));

  function handleDragStart(event: DragStartEvent) {
    const flat = nodeMap.get(event.active.id as string);
    if (flat) setActiveNode(flat.node);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      setDragOverFolderId(null);
      return;
    }
    const overFlat = nodeMap.get(overId);
    if (overFlat?.node.type === "folder") {
      setDragOverFolderId(overId);
    } else {
      setDragOverFolderId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveNode(null);
    setDragOverFolderId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeFlat = nodeMap.get(active.id as string);
    const overFlat = nodeMap.get(over.id as string);
    if (!activeFlat || !overFlat) return;

    const activeNode = activeFlat.node;
    const overNode = overFlat.node;

    // Cross-workspace drag guard (backend enforces, but catch it here too)
    const activeSpace = localTree.spaces.find((s) =>
      flattenNodes(s.nodes, s.id, null).some((f) => f.node.id === activeNode.id)
    );
    const overSpace = localTree.spaces.find((s) =>
      flattenNodes(s.nodes, s.id, null).some((f) => f.node.id === overNode.id)
    );
    if (activeSpace && overSpace && activeSpace.id !== overSpace.id) {
      toast.error("Cannot move items across spaces");
      return;
    }

    // Determine new parent and position
    let newParentId: string | null;
    let newPosition: string;

    if (overNode.type === "folder" && dragOverFolderId === overNode.id) {
      // Dropped ON a folder → become last child
      newParentId = overNode.id;
      const lastChildPos =
        overNode.children.length > 0
          ? overNode.children[overNode.children.length - 1].position
          : null;
      newPosition = generateKeyBetween(lastChildPos, null);
    } else {
      // Dropped between siblings → reorder
      newParentId = overFlat.parentId;
      const siblings = overFlat.siblings.filter((s) => s.id !== activeNode.id);
      const overIdx = siblings.findIndex((s) => s.id === overNode.id);
      const before = overIdx > 0 ? siblings[overIdx - 1].position : null;
      const after = siblings[overIdx]?.position ?? null;
      newPosition = generateKeyBetween(before, after);
    }

    // Optimistic update
    const snapshot = localTree;
    setLocalTree((prev) => applyMove(prev, activeNode.id, newParentId, newPosition));

    try {
      await updateNode(activeNode.id, {
        parent_id: newParentId,
        position: newPosition,
      });
      refresh();
    } catch (err) {
      setLocalTree(snapshot);
      toast.error(String(err));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
              await createSpace(localTree.id, slugify(name), name);
              setCreatingSpace(false);
              refresh();
            }}
            onCancel={() => setCreatingSpace(false)}
          />
        )}

        {localTree.spaces.map((space) => (
          <SpaceSection
            key={space.id}
            space={space}
            workspaceId={localTree.id}
            activePath={activePath}
            openSet={openSet}
            onToggle={toggle}
            onOpen={open}
            onCreated={refresh}
            dragOverFolderId={dragOverFolderId}
          />
        ))}

        {!creatingSpace && localTree.spaces.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">No spaces yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Hover <strong>Spaces</strong> above and click <strong>+</strong> to
              create one.
            </p>
          </div>
        )}
      </div>

      <DragOverlay>
        {activeNode && <DragOverlayItem node={activeNode} />}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Immutable tree mutation helpers
// ---------------------------------------------------------------------------

function removeNode(nodes: NodeTreeItem[], id: string): NodeTreeItem[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

function insertNode(
  nodes: NodeTreeItem[],
  node: NodeTreeItem,
  parentId: string | null,
  position: string
): NodeTreeItem[] {
  if (parentId === null) {
    return [...nodes, { ...node, position, parent_id: null }].sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0
    );
  }
  return nodes.map((n) => {
    if (n.id === parentId) {
      const newChildren = [
        ...n.children,
        { ...node, position, parent_id: parentId },
      ].sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0
      );
      return { ...n, children: newChildren };
    }
    return { ...n, children: insertNode(n.children, node, parentId, position) };
  });
}

function applyMove(
  tree: WorkspaceTree,
  nodeId: string,
  newParentId: string | null,
  newPosition: string
): WorkspaceTree {
  // Find the node across all spaces
  let movedNode: NodeTreeItem | null = null;
  let targetSpaceId: string | null = null;

  const spacesWithout = tree.spaces.map((space) => {
    const flat = flattenNodes(space.nodes, space.id, null);
    const found = flat.find((f) => f.node.id === nodeId);
    if (found) {
      movedNode = found.node;
      targetSpaceId = space.id;
    }
    return { ...space, nodes: removeNode(space.nodes, nodeId) };
  });

  if (!movedNode || !targetSpaceId) return tree;

  const spacesWithNode = spacesWithout.map((space) => {
    if (space.id !== targetSpaceId) return space;
    return {
      ...space,
      nodes: insertNode(space.nodes, movedNode!, newParentId, newPosition),
    };
  });

  return { ...tree, spaces: spacesWithNode };
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

export function AppSidebar({ tree, user, panel, memberCount, searchInputRef }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <WorkspaceHeader tree={tree} memberCount={memberCount} />

      {panel === "pages" && (
        <PagesPanel
          tree={tree}
          user={user}
          activePath={pathname}
          refresh={refresh}
        />
      )}
      {panel === "search" && (
        <SearchPanel workspaceId={tree.id} inputRef={searchInputRef} />
      )}
      {panel === "starred" && <StarredPanel />}
      {panel === "inbox" && <InboxPanel />}
    </aside>
  );
}
