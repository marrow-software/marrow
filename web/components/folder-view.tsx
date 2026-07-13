"use client";

import { ChevronDown, ChevronRight, FileText, Folder, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FolderPropertySchemaEditor } from "@/components/folder-property-schema-editor";
import { FolderViewSettingsDialog } from "@/components/folder-view-settings-dialog";
import { FolderViews, type ViewRow } from "@/components/folder-views";
import { useWorkspaceRole } from "@/components/workspace-role-context";
import {
  collectDescendantPages,
  collectDirectChildren,
  findNodeBreadcrumb,
  findNodeById,
  useWorkspaceTree,
} from "@/components/workspace-tree-context";
import { Button } from "@/components/ui/button";
import {
  createNodeView,
  getNodeProperties,
  getPropertySchema,
  listNodeViews,
} from "@/lib/api";
import { formatPropertyValue } from "@/lib/format-property-value";
import type { Node, NodeView, PropertySchema } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  node: Node;
  workspaceId: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = 10,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export function FolderView({ node, workspaceId }: Props) {
  const router = useRouter();
  const tree = useWorkspaceTree();
  const { canEdit } = useWorkspaceRole();

  const [views, setViews] = useState<NodeView[] | null>(null);
  const [schema, setSchema] = useState<PropertySchema[]>([]);
  const [rows, setRows] = useState<ViewRow[] | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
  const [viewDialogMode, setViewDialogMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [editingView, setEditingView] = useState<NodeView | null>(null);

  const folderLoadGenRef = useRef(0);

  useEffect(() => {
    folderLoadGenRef.current += 1;
  }, [node.id, tree]);

  const crumb = tree ? findNodeBreadcrumb(tree, node.id) : null;
  const breadcrumbParts = crumb
    ? [crumb.spaceName, ...crumb.ancestorNames, node.name]
    : [node.name];

  const descendantPages = useMemo(
    () => (tree ? collectDescendantPages(tree, node.id) : []),
    [tree, node.id],
  );

  const directChildren = useMemo(
    () => (tree ? collectDirectChildren(tree, node.id) : []),
    [tree, node.id],
  );

  const schemaKeys = useMemo(() => schema.map((s) => s.key), [schema]);

  const loadViews = useCallback(async (isStale: () => boolean = () => false) => {
    let fetched = await listNodeViews(node.id);
    if (isStale()) return;

    if (fetched.length === 0 && canEdit) {
      try {
        await createNodeView(node.id, "All", "list");
      } catch {
        /* concurrent create — refetch below */
      }
      if (isStale()) return;
      fetched = await listNodeViews(node.id);
      if (isStale()) return;
    }

    if (isStale()) return;
    setViews(fetched);
    if (fetched.length > 0) {
      setActiveViewId((cur) => {
        if (cur && fetched.some((v) => v.id === cur)) return cur;
        return fetched.find((v) => v.view_type === "list")?.id ?? fetched[0].id;
      });
    }
  }, [node.id, canEdit]);

  const loadSchema = useCallback(async (isStale: () => boolean = () => false) => {
    try {
      const rows = await getPropertySchema(node.id);
      if (isStale()) return;
      setSchema(rows);
    } catch {
      if (isStale()) return;
      setSchema([]);
    }
  }, [node.id]);

  const loadRows = useCallback(async (isStale: () => boolean = () => false) => {
    if (!tree) {
      if (!isStale()) setRows([]);
      return;
    }

    const pages = collectDescendantPages(tree, node.id);
    if (pages.length === 0) {
      if (!isStale()) setRows([]);
      return;
    }

    const schemaRows = await getPropertySchema(node.id).catch(() => [] as PropertySchema[]);
    if (isStale()) return;
    const keys = schemaRows.map((s) => s.key);
    const typeByKey = new Map(schemaRows.map((s) => [s.key, s.value_type]));

    const built = await mapWithConcurrency(pages, async (page) => {
      const properties: Record<string, string | null> = {};
      if (keys.length > 0) {
        try {
          const res = await getNodeProperties(page.id);
          for (const key of keys) {
            const prop = res.properties.find((p) => p.key === key);
            const valueType = typeByKey.get(key) ?? prop?.value_type ?? "text";
            properties[key] = formatPropertyValue(prop?.value ?? null, valueType);
          }
        } catch {
          for (const key of keys) properties[key] = null;
        }
      }
      return { id: page.id, name: page.name, properties };
    });

    if (isStale()) return;
    setRows(built);
  }, [tree, node.id]);

  useEffect(() => {
    const gen = folderLoadGenRef.current;
    const isStale = () => folderLoadGenRef.current !== gen;
    setViews(null);
    setActiveViewId(null);
    (async () => {
      try {
        await loadViews(isStale);
      } catch {
        if (!isStale()) setViews([]);
      }
    })();
  }, [loadViews]);

  useEffect(() => {
    const gen = folderLoadGenRef.current;
    const isStale = () => folderLoadGenRef.current !== gen;
    setSchema([]);
    void loadSchema(isStale);
  }, [loadSchema]);

  useEffect(() => {
    const gen = folderLoadGenRef.current;
    const isStale = () => folderLoadGenRef.current !== gen;
    setRows(null);
    void loadRows(isStale);
  }, [loadRows]);

  const handleOpenNode = useCallback(
    (nodeId: string) => {
      const target = tree ? findNodeById(tree, nodeId) : null;
      const slug = target?.slug ?? "page";
      router.push(`/w/${workspaceId}/n/${nodeId}/${slug}`);
    },
    [router, tree, workspaceId],
  );

  const handleSchemaChange = useCallback(() => {
    void loadSchema();
    void loadRows();
  }, [loadSchema, loadRows]);

  const viewsLoading = views === null;
  const rowsLoading = rows === null;
  const hasPages = descendantPages.length > 0;

  const viewerNoViews =
    !canEdit && views !== null && views.length === 0;

  const emptyPagesMessage =
    "No pages in this folder yet. Create a page from the sidebar.";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[13px] text-muted-foreground">
          {breadcrumbParts.map((part, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              <span
                className={`truncate ${
                  i === breadcrumbParts.length - 1 ? "text-foreground" : ""
                }`}
              >
                {part}
              </span>
              {i < breadcrumbParts.length - 1 && (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              )}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-10 py-10">
          <div className="mb-2 flex items-center gap-3">
            <Folder className="h-7 w-7 text-muted-foreground" />
            <h1
              className="font-heading"
              style={{
                fontSize: 40,
                fontWeight: 400,
                letterSpacing: "-0.015em",
                fontVariationSettings: '"SOFT" 60',
              }}
            >
              {node.name}
            </h1>
          </div>
          {node.description && (
            <p className="mb-4 text-sm text-muted-foreground">{node.description}</p>
          )}

          {canEdit && (
            <div className="mb-6 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSchemaDialogOpen(true)}
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Properties
              </Button>
            </div>
          )}
        </div>

        <div className="w-full px-4 pb-6 md:px-6">
          {viewsLoading && (
            <p className="px-2 py-4 text-sm text-muted-foreground">Loading views…</p>
          )}

          {viewerNoViews && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              {hasPages
                ? "No views configured. Pages exist in this folder but cannot be browsed here."
                : "No views in this folder yet."}
            </p>
          )}

          {!viewsLoading && views && views.length > 0 && (
            <>
              {rowsLoading ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Loading pages…
                </p>
              ) : (
                <FolderViews
                  views={views}
                  rows={rows ?? []}
                  schemaKeys={schemaKeys}
                  canEdit={canEdit}
                  activeViewId={activeViewId}
                  onActiveViewChange={setActiveViewId}
                  onCreateView={() => {
                    setEditingView(null);
                    setViewDialogMode("create");
                  }}
                  onEditView={(view) => {
                    setEditingView(view);
                    setViewDialogMode("edit");
                  }}
                  onOpenNode={handleOpenNode}
                  emptyPagesMessage={emptyPagesMessage}
                />
              )}
              {!rowsLoading && schemaKeys.length === 0 && canEdit && hasPages && (
                <p className="mt-2 px-2 text-xs text-muted-foreground">
                  Add properties via the Properties menu to show columns in table and
                  board views.
                </p>
              )}
            </>
          )}
        </div>

        {directChildren.length > 0 && (
          <section className="border-t border-border px-4 py-4 md:px-6">
            <button
              type="button"
              className="mb-3 flex w-full items-center gap-2 text-left md:hidden"
              onClick={() => setContentsOpen((v) => !v)}
            >
              {contentsOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                Contents ({directChildren.length})
              </span>
            </button>
            <h2 className="mb-3 hidden text-sm font-medium md:block">
              Contents ({directChildren.length})
            </h2>
            <ul
              className={cn(
                "mx-auto flex max-w-3xl flex-col gap-1",
                contentsOpen ? "block" : "hidden md:flex",
              )}
            >
              {directChildren.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/w/${workspaceId}/n/${child.id}/${child.slug}`}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    {child.type === "folder" ? (
                      <Folder className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-foreground">{child.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {canEdit && (
        <>
          <FolderPropertySchemaEditor
            folderNodeId={node.id}
            open={schemaDialogOpen}
            onOpenChange={setSchemaDialogOpen}
            onSchemaChange={handleSchemaChange}
          />
          <FolderViewSettingsDialog
            folderNodeId={node.id}
            schema={schema}
            views={views ?? []}
            mode={viewDialogMode}
            editingView={editingView}
            onOpenChange={(open) => {
              if (!open) {
                setViewDialogMode(null);
                setEditingView(null);
              }
            }}
            onViewsChange={setViews}
            onActiveViewChange={setActiveViewId}
          />
        </>
      )}
    </div>
  );
}
