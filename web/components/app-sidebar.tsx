"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  FilePlus,
  Folder,
  FolderPlus,
  Home,
  Inbox,
  Layers,
  LayoutGrid,
  LogOut,
  Plus,
  Search as SearchIcon,
  Settings,
  Share2,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/api";
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
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { InlineCreateRow } from "@/components/sidebar/inline-create-row";
import { createNode, createSpace, slugify, updateNode } from "@/lib/api";
import { SearchPanel } from "@/components/rail-panels/search-panel";
import { InboxPanel } from "@/components/rail-panels/inbox-panel";
import type { NodeTreeItem, SpaceTreeItem, User, Workspace, WorkspaceTree } from "@/lib/types";

// The four global-nav destinations that share the unified sidebar (#313). The
// active space's tree is the default ("pages") body; Search / Inbox / Shared
// surface their panel in place of the tree; Home navigates away to /home.
export type RailPanel = "pages" | "search" | "inbox" | "shared";

interface Props {
  tree: WorkspaceTree;
  user?: User | null;
  panel: RailPanel;
  onPanelChange: (panel: RailPanel) => void;
  memberCount: number | null;
  showOrgSettings?: boolean;
  workspaces: Workspace[];
  userRole: string | null;
  inboxUnread?: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onInboxUnreadChange?: (count: number) => void;
}

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || name[0]?.toUpperCase() || "?";
}

// Dismiss-on-outside-click + Escape, for any menu/flyout. The single dismissal
// scaffold in this file — both the self-stated menus (via useDismissableMenu)
// and the externally-controlled Spaces flyout (via SpacesNav) build on it.
function useOutsideDismiss(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

// Menu open-state + dismissal, shared by the workspace switcher and account menu
// so the dismiss scaffold lives in one place.
function useDismissableMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss(ref, open, close);
  return { open, setOpen, ref };
}

// ---------------------------------------------------------------------------
// Tree-state persistence (open/closed folders) — per workspace per user
// ---------------------------------------------------------------------------

function openStateKey(workspaceId: string, userId: string | null | undefined) {
  return `marrow.tree.open.${userId ?? "anon"}.${workspaceId}`;
}

// Last space picked in the Spaces flyout (#316) — remembered per workspace per
// user so the sidebar reopens on the space you were browsing.
function currentSpaceKey(workspaceId: string, userId: string | null | undefined) {
  return `marrow.space.current.${userId ?? "anon"}.${workspaceId}`;
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
  // Folders are tree containers only (Confluence-style) — expand/collapse, no landing page.
  const href = isFolder ? null : `/w/${ctx.workspaceId}/n/${node.id}/${node.slug}`;
  const isActive = href
    ? ctx.activePath.startsWith(`/w/${ctx.workspaceId}/n/${node.id}`)
    : false;

  function toggleFolder() {
    ctx.setOpen(node.id, !isOpen);
  }

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
                toggleFolder();
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
              className={`flex-1 truncate text-base ${
                isActive
                  ? "font-medium text-foreground"
                  : "text-foreground/90 hover:text-foreground"
              }`}
            >
              {node.name}
            </a>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1 truncate text-left text-base text-foreground/90 hover:text-foreground"
            >
              {node.name}
            </button>
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
      {/* The active space renders as a plain label (#316) — no accent/selected
          treatment, so it never implies a picked item. It is a disclosure for
          the tree below it, not a switcher (that's the Spaces flyout). */}
      <div className="group flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => ctx.setOpen(headerKey, !isOpen)}
          aria-expanded={isOpen}
          className="flex flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-base font-medium text-foreground"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{space.name}</span>
        </button>
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

// ---------------------------------------------------------------------------
// Workspace switcher — pinned to the TOP of the unified sidebar. Opening it
// floats a lightweight menu (workspace list + create + export + org settings)
// anchored below the trigger. No brand glyph here — the brand/avatar collision
// the audit flagged is gone; the account lives at the bottom.
// ---------------------------------------------------------------------------

function WorkspaceSwitcher({
  tree,
  memberCount,
  showOrgSettings,
  workspaces,
  userRole,
}: {
  tree: WorkspaceTree;
  memberCount: number | null;
  showOrgSettings?: boolean;
  workspaces: Workspace[];
  userRole: string | null;
}) {
  const { open, setOpen, ref } = useDismissableMenu();
  const canCreateWorkspace = userRole === "owner" || userRole === null;

  return (
    <div ref={ref} className="relative border-b border-sidebar-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Switch workspace"
        className="signal-flat signal-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent-soft"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
          {tree.name[0]?.toUpperCase() ?? "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-foreground">{tree.name}</span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {memberCount !== null ? `${memberCount} member${memberCount === 1 ? "" : "s"}` : "workspace"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="menu"
          className="signal-enter absolute left-2 right-2 top-[calc(100%+4px)] z-50 rounded-md border border-border-strong bg-popover py-1 shadow-[var(--shadow-signature)]"
        >
          {workspaces.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1 font-mono text-2xs font-semibold uppercase tracking-widest text-faint">
                Workspaces
              </p>
              <div className="max-h-56 overflow-y-auto">
                {workspaces.map((ws) => {
                  const isCurrent = ws.id === tree.id;
                  return (
                    <a
                      key={ws.id}
                      href={`/w/${ws.id}`}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-base hover:bg-accent-soft"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-2xs font-semibold text-primary">
                        {ws.name[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{ws.name}</span>
                      {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </a>
                  );
                })}
              </div>
              {canCreateWorkspace && (
                <a
                  href="/workspaces"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-base text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create workspace
                </a>
              )}
              <div className="my-1 border-t border-border" />
            </>
          )}
          <div className="px-2">
            <ExportDialog workspaceId={tree.id} workspaceName={tree.name} />
          </div>
          {showOrgSettings && (
            <a
              href={`/orgs/${tree.org_id}/settings`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-base text-muted-foreground hover:bg-accent-soft hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              Organization settings
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global-nav strip — Home · Search · Inbox · Shared with me. Replaces the old
// icon rail; the panels surface here in place of a separate rail flyout.
// ---------------------------------------------------------------------------

// One class string for every row in the nav strip — the Spaces trigger reuses
// it so the whole strip shares one type + spacing scale (#316 AC), not per-row CSS.
function navRowClass(active?: boolean) {
  return cn(
    "signal-flat signal-focus flex h-[var(--ctl-md)] items-center gap-2.5 rounded-md px-2 text-base text-foreground hover:bg-accent-soft",
    active && "signal-nav-active",
  );
}

function NavRow({
  Icon,
  label,
  active,
  badge,
  count,
  href,
  onClick,
}: {
  Icon: typeof Home;
  label: string;
  active?: boolean;
  badge?: number;
  count?: string;
  href?: string;
  onClick?: () => void;
}) {
  const cls = navRowClass(active);
  const inner = (
    <>
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count && (
        <span className="rounded-full bg-accent-soft px-1.5 font-mono text-2xs text-primary">{count}</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-2xs font-medium leading-none text-primary-foreground">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls} aria-current={active ? "page" : undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(cls, "w-full text-left")}>
      {inner}
    </button>
  );
}

function NavStrip({
  panel,
  onPanelChange,
  inboxUnread,
  spacesSlot,
}: {
  panel: RailPanel;
  onPanelChange: (panel: RailPanel) => void;
  inboxUnread: number;
  spacesSlot: React.ReactNode;
}) {
  return (
    <nav className="flex flex-col gap-px px-2 pb-1 pt-2">
      <NavRow Icon={Home} label="Home" href="/home" />
      <NavRow
        Icon={SearchIcon}
        label="Search"
        count="⌘K"
        active={panel === "search"}
        onClick={() => onPanelChange(panel === "search" ? "pages" : "search")}
      />
      <NavRow
        Icon={Inbox}
        label="Inbox"
        badge={inboxUnread}
        active={panel === "inbox"}
        onClick={() => onPanelChange(panel === "inbox" ? "pages" : "inbox")}
      />
      <NavRow
        Icon={Share2}
        label="Shared with me"
        active={panel === "shared"}
        onClick={() => onPanelChange(panel === "shared" ? "pages" : "shared")}
      />
      {/* Spaces splits switching from browsing (#316): the row opens a floating
          switcher flyout; the current space's tree lives below the divider. */}
      {spacesSlot}
    </nav>
  );
}

// Shared-with-me is a nav destination without a backend yet (#313 wires the
// strip; the feed lands later). An honest empty state keeps the nav coherent.
function SharedPanel() {
  return (
    <div className="px-4 py-8 text-center">
      <Share2 className="mx-auto h-5 w-5 text-muted-foreground/60" />
      <p className="mt-2 text-sm font-medium text-foreground">Nothing shared with you yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Pages other people share directly will appear here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spaces switcher (#316) — the nav-strip trigger + its floating flyout. Splits
// "switch spaces" (this flyout) from "browse the current space" (the inline
// tree below the divider). The flyout floats as a lightweight card beside the
// row — no scrim, no backdrop blur — so it reads as a menu, not an edge panel.
// ---------------------------------------------------------------------------

function FlyoutLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 font-mono text-2xs font-semibold uppercase tracking-widest text-faint">
      {children}
    </p>
  );
}

// One class string for every interactive row in the flyout (space picks +
// actions) — the flyout's counterpart to navRowClass, so the region shares one
// style rather than repeating it per row (#316 AC).
function flyoutRowClass() {
  return "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-base text-foreground hover:bg-accent-soft";
}

function SpacePickRow({ space, onPick }: { space: SpaceTreeItem; onPick: (id: string) => void }) {
  return (
    <button type="button" role="menuitem" onClick={() => onPick(space.id)} className={flyoutRowClass()}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-2xs font-semibold text-primary">
        {space.name[0]?.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate">{space.name}</span>
    </button>
  );
}

function SpacesFlyout({
  spaces,
  currentSpaceId,
  workspaceId,
  orgId,
  onPick,
  onClose,
  refresh,
}: {
  spaces: SpaceTreeItem[];
  currentSpaceId: string | null;
  workspaceId: string;
  orgId: string;
  onPick: (spaceId: string) => void;
  onClose: () => void;
  refresh: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const current = spaces.find((s) => s.id === currentSpaceId) ?? null;
  const q = filter.trim().toLowerCase();
  const matches = (s: SpaceTreeItem) => s.name.toLowerCase().includes(q);
  const others = spaces.filter((s) => s.id !== currentSpaceId && matches(s));
  const currentShown = current && matches(current) ? current : null;

  function pick(spaceId: string) {
    onPick(spaceId);
    onClose();
  }

  return (
    // Anchored beside the Spaces row's arrow (left-full + ml-2), floating as a
    // card — no scrim/blur. Enters with .signal-enter (--pop-from upward-translate
    // + fade over --dur-enter). Inherits the sidebar column's --text-base so every
    // row matches the tree + nav strip (#316 AC — one shared scale, not per-region).
    <div
      role="menu"
      aria-label="Switch space"
      className="signal-enter absolute left-full top-0 z-50 ml-2 flex max-h-[70vh] w-72 origin-top-left flex-col rounded-md border border-border-strong bg-popover shadow-[var(--shadow-signature)]"
    >
      <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
        <span className="text-base font-medium text-foreground">Spaces</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="signal-focus rounded text-faint hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex h-[var(--ctl-md)] items-center gap-2 rounded-md border border-border-strong bg-background px-2">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter spaces"
            aria-label="Filter spaces"
            className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {currentShown && (
          <>
            <FlyoutLabel>Current</FlyoutLabel>
            <SpacePickRow space={currentShown} onPick={pick} />
            <div className="my-1.5 border-t border-border" />
          </>
        )}

        {/* Phase 1 has no space-star backend, so this section lists every other
            space rather than a "Starred" subset (the prototype dossier flagged
            starred spaces as awaiting a real data source). */}
        <FlyoutLabel>All spaces</FlyoutLabel>
        {others.length > 0 ? (
          others.map((s) => <SpacePickRow key={s.id} space={s} onPick={pick} />)
        ) : (
          <p className="px-2 py-1.5 text-base text-muted-foreground">
            {q ? "No spaces match" : "No other spaces"}
          </p>
        )}

        <div className="my-1.5 border-t border-border" />

        <a href={`/orgs/${orgId}/admin?section=spaces`} role="menuitem" onClick={onClose} className={flyoutRowClass()}>
          <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
          View all spaces
        </a>

        {creating ? (
          <InlineCreateRow
            placeholder="Space name"
            className="flex items-center gap-2 rounded-md px-2 py-1"
            icon={<Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
            onCommit={async (name) => {
              const created = await createSpace(workspaceId, slugify(name), name);
              setCreating(false);
              refresh();
              pick(created.id);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button type="button" role="menuitem" onClick={() => setCreating(true)} className={flyoutRowClass()}>
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            Create a space
          </button>
        )}

        {/* Import is planned IA, not yet built — an honest disabled stub (cf. the
            "Shared with me" empty state), never a dead click. */}
        <div
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-base text-faint"
          aria-disabled="true"
          title="Coming soon"
        >
          <ArrowDownToLine className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Import from other tools</span>
          <span className="shrink-0 font-mono text-2xs uppercase tracking-widest">Soon</span>
        </div>
      </div>
    </div>
  );
}

function SpacesNav({
  spaces,
  currentSpaceId,
  active,
  open,
  onToggle,
  onClose,
  onPick,
  workspaceId,
  orgId,
  refresh,
}: {
  spaces: SpaceTreeItem[];
  currentSpaceId: string | null;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (spaceId: string) => void;
  workspaceId: string;
  orgId: string;
  refresh: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideDismiss(ref, open, onClose);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={navRowClass(active)}
      >
        <Layers className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-left">Spaces</span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 text-faint transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <SpacesFlyout
          spaces={spaces}
          currentSpaceId={currentSpaceId}
          workspaceId={workspaceId}
          orgId={orgId}
          onPick={onPick}
          onClose={onClose}
          refresh={refresh}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account — pinned to the BOTTOM of the sidebar. Absorbs the rail's user menu
// and the standalone settings popover (appearance + sign out) into one row.
// ---------------------------------------------------------------------------

function AccountMenu({ user }: { user: User }) {
  const { open, setOpen, ref } = useDismissableMenu();

  return (
    <div ref={ref} className="relative mt-auto border-t border-sidebar-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="signal-flat signal-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent-soft"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground text-xs font-medium text-background">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-faint">{user.email}</span>
        </span>
        <Settings className="h-4 w-4 shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="menu"
          className="signal-enter absolute bottom-[calc(100%+4px)] left-2 right-2 z-50 rounded-md border border-border-strong bg-popover py-1 shadow-[var(--shadow-signature)]"
        >
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-base text-foreground">Appearance</span>
            <ThemeToggle />
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              const logoutUrl = await logout();
              window.location.href = logoutUrl ?? "/login";
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-base text-foreground hover:bg-accent-soft"
          >
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
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
  currentSpaceId,
  activePath,
  refresh,
  user,
}: {
  tree: WorkspaceTree;
  currentSpaceId: string | null;
  activePath: string;
  refresh: () => void;
  user?: User | null;
}) {
  const [dragNodeName, setDragNodeName] = useState<string | null>(null);
  // Browse the current space only (#316); switching happens in the Spaces flyout.
  const currentSpace = tree.spaces.find((s) => s.id === currentSpaceId) ?? null;

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
      <DndContext
        id={`marrow-sidebar-${tree.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {currentSpace ? (
          <SpaceSection key={currentSpace.id} space={currentSpace} ctx={ctx} onCreated={refresh} />
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No spaces yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open <strong>Spaces</strong> above to create one.
            </p>
          </div>
        )}
        <DragOverlay>
          {dragNodeName && (
            <div className="rounded border border-border bg-popover px-2 py-1 text-base shadow">
              {dragNodeName}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export function AppSidebar({
  tree,
  user,
  panel,
  onPanelChange,
  memberCount,
  showOrgSettings,
  workspaces,
  userRole,
  inboxUnread = 0,
  searchInputRef,
  onInboxUnreadChange,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  // --- Current space (#316) -------------------------------------------------
  // The tree browses one space. Which one is: the space of the page you're on
  // (route wins), else the space you last picked in the flyout, else the first.
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const spaceKey = useMemo(() => currentSpaceKey(tree.id, user?.id), [tree.id, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSelectedSpaceId(window.localStorage.getItem(spaceKey));
    } catch {
      setSelectedSpaceId(null);
    }
  }, [spaceKey]);

  // Navigating (route change) closes the flyout — picking a page is a commit.
  useEffect(() => {
    setSpacesOpen(false);
  }, [pathname]);

  const spaceFromRoute = useMemo(() => {
    const m = pathname.match(/\/w\/[^/]+\/n\/([^/]+)/);
    return m ? findNode(tree.spaces, m[1])?.spaceId ?? null : null;
  }, [pathname, tree.spaces]);

  const currentSpaceId = useMemo(() => {
    if (spaceFromRoute) return spaceFromRoute;
    if (selectedSpaceId && tree.spaces.some((s) => s.id === selectedSpaceId)) return selectedSpaceId;
    return tree.spaces[0]?.id ?? null;
  }, [spaceFromRoute, selectedSpaceId, tree.spaces]);

  const selectSpace = useCallback(
    (id: string) => {
      setSelectedSpaceId(id);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(spaceKey, id);
        } catch {
          // localStorage may be full or disabled; ignore
        }
      }
      onPanelChange("pages");
    },
    [spaceKey, onPanelChange],
  );

  // One unified column (#313): switcher (top) → global-nav strip → the active
  // space's tree / a surfaced panel → account (bottom). Shares the editor's
  // background (bg-sidebar === bg-background) separated only by a 1px hairline;
  // one shared 14px type scale (base font-size on the column) across every
  // region — nav strip, tree, and menus.
  return (
    <aside
      className="flex h-full w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-base text-sidebar-foreground"
      aria-label="Workspace navigation"
    >
      <WorkspaceSwitcher
        tree={tree}
        memberCount={memberCount}
        showOrgSettings={showOrgSettings}
        workspaces={workspaces}
        userRole={userRole}
      />

      <NavStrip
        panel={panel}
        onPanelChange={onPanelChange}
        inboxUnread={inboxUnread}
        spacesSlot={
          <SpacesNav
            spaces={tree.spaces}
            currentSpaceId={currentSpaceId}
            active={panel === "pages"}
            open={spacesOpen}
            onToggle={() => {
              onPanelChange("pages");
              setSpacesOpen((v) => !v);
            }}
            onClose={() => setSpacesOpen(false)}
            onPick={selectSpace}
            workspaceId={tree.id}
            orgId={tree.org_id}
            refresh={refresh}
          />
        }
      />

      {/* Divider (#316 AC): separates the Spaces switcher trigger above from the
          current-space label + tree below. */}
      <div className="mx-3 border-t border-sidebar-border" />

      <div className="flex min-h-0 flex-1 flex-col">
        {panel === "pages" && (
          <PagesPanel
            tree={tree}
            currentSpaceId={currentSpaceId}
            activePath={pathname}
            refresh={refresh}
            user={user}
          />
        )}
        {panel === "search" && <SearchPanel workspaceId={tree.id} inputRef={searchInputRef} />}
        {panel === "inbox" && <InboxPanel onUnreadChange={onInboxUnreadChange} />}
        {panel === "shared" && <SharedPanel />}
      </div>

      {user && <AccountMenu user={user} />}
    </aside>
  );
}

// Used in unit tests / debugging — exported for completeness
export const __test = { generateKeyBetween, findNode, isDescendant, dropId, parseDropId };
