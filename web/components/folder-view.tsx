"use client";

import { ChevronRight, FileText, Folder } from "lucide-react";
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
  getNodeProperties,
  getPropertySchema,
  listNodeViews,
} from "@/lib/api";
import { formatPropertyValue } from "@/lib/format-property-value";
import type { Node, NodeView, PropertySchema } from "@/lib/types";

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
    const fetched = await listNodeViews(node.id);
    if (isStale()) return;

    setViews(fetched);
    if (fetched.length > 0) {
      setActiveViewId((cur) => {
        if (cur && fetched.some((v) => v.id === cur)) return cur;
        return fetched.find((v) => v.view_type === "list")?.id ?? fetched[0].id;
      });
    } else {
      setActiveViewId(null);
    }
  }, [node.id]);

  const loadSchemaOnly = useCallback(async () => {
    const schemaRows = await getPropertySchema(node.id).catch(
      () => [] as PropertySchema[],
    );
    setSchema(schemaRows);
  }, [node.id]);

  // Schema and rows share a single getPropertySchema fetch so table columns
  // (schema state) and per-row cell values can never disagree.
  const loadSchemaAndRows = useCallback(
    async (isStale: () => boolean = () => false) => {
      const schemaRows = await getPropertySchema(node.id).catch(
        () => [] as PropertySchema[],
      );
      if (isStale()) return;
      setSchema(schemaRows);

      if (!tree) {
        setRows([]);
        return;
      }

      const pages = collectDescendantPages(tree, node.id);
      if (pages.length === 0) {
        setRows([]);
        return;
      }

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
    },
    [tree, node.id],
  );

  useEffect(() => {
    const gen = folderLoadGenRef.current;
    const isStale = () => folderLoadGenRef.current !== gen;
    setViews(null);
    setActiveViewId(null);
    setSchema([]);
    setRows(null);
    (async () => {
      try {
        await loadViews(isStale);
      } catch {
        if (!isStale()) setViews([]);
      }
    })();
  }, [loadViews]);

  // Only fetch property data when the folder has saved views (opt-in).
  useEffect(() => {
    if (views === null || views.length === 0) {
      setSchema([]);
      setRows(null);
      return;
    }

    const gen = folderLoadGenRef.current;
    const isStale = () => folderLoadGenRef.current !== gen;
    setSchema([]);
    setRows(null);
    void loadSchemaAndRows(isStale);
  }, [views, loadSchemaAndRows]);

  const handleOpenNode = useCallback(
    (nodeId: string) => {
      const target = tree ? findNodeById(tree, nodeId) : null;
      const slug = target?.slug ?? "page";
      router.push(`/w/${workspaceId}/n/${nodeId}/${slug}`);
    },
    [router, tree, workspaceId],
  );

  const handleSchemaChange = useCallback(() => {
    if ((views?.length ?? 0) > 0) {
      void loadSchemaAndRows();
    } else {
      void loadSchemaOnly();
    }
  }, [loadSchemaAndRows, loadSchemaOnly, views?.length]);

  const handleViewsChange = useCallback((next: NodeView[]) => {
    setViews(next);
    if (next.length === 0) {
      setActiveViewId(null);
      setSchema([]);
      setRows(null);
    }
  }, []);

  const openCreateView = useCallback(() => {
    void loadSchemaOnly();
    setEditingView(null);
    setViewDialogMode("create");
  }, [loadSchemaOnly]);

  const openSchemaEditor = useCallback(() => {
    void loadSchemaOnly();
    setSchemaDialogOpen(true);
  }, [loadSchemaOnly]);

  const viewsLoading = views === null;
  const rowsLoading = rows === null;
  const hasViews = (views?.length ?? 0) > 0;
  const hasPages = descendantPages.length > 0;

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

      <div className="flex-1 overflow-auto px-10 py-10">
        <div className="mx-auto max-w-3xl">
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
            <p className="mb-6 text-sm text-muted-foreground">{node.description}</p>
          )}

          {directChildren.length === 0 && (
            <p className="text-sm text-muted-foreground">This folder is empty.</p>
          )}
          {directChildren.length > 0 && (
            <ul className="flex flex-col gap-1">
              {directChildren.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/w/${workspaceId}/n/${child.id}/${child.slug}`}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
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
          )}

          {!viewsLoading && canEdit && !hasViews && (
            <p className="mt-6 text-sm text-muted-foreground">
              <button
                type="button"
                onClick={openCreateView}
                className="text-foreground underline-offset-4 hover:underline"
              >
                Add table, board, or list view…
              </button>
              {" · "}
              <button
                type="button"
                onClick={openSchemaEditor}
                className="text-foreground underline-offset-4 hover:underline"
              >
                Manage properties
              </button>
            </p>
          )}
        </div>

        {!viewsLoading && hasViews && (
          <section className="mt-10 border-t border-border pt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4 md:px-0">
              <h2 className="text-sm font-medium">Views</h2>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={openSchemaEditor}
                >
                  Manage properties
                </Button>
              )}
            </div>
            <div className="w-full px-4 md:px-0">
              {rowsLoading ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Loading pages…
                </p>
              ) : (
                <FolderViews
                  views={views ?? []}
                  rows={rows ?? []}
                  schemaKeys={schemaKeys}
                  canEdit={canEdit}
                  activeViewId={activeViewId}
                  onActiveViewChange={setActiveViewId}
                  onCreateView={openCreateView}
                  onEditView={(view) => {
                    void loadSchemaOnly();
                    setEditingView(view);
                    setViewDialogMode("edit");
                  }}
                  onOpenNode={handleOpenNode}
                  emptyPagesMessage={emptyPagesMessage}
                />
              )}
              {!rowsLoading && schemaKeys.length === 0 && canEdit && hasPages && (
                <p className="mt-2 px-2 text-xs text-muted-foreground">
                  Add properties via Manage properties to show columns in table and
                  board views.
                </p>
              )}
            </div>
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
            onViewsChange={handleViewsChange}
            onActiveViewChange={setActiveViewId}
          />
        </>
      )}
    </div>
  );
}
