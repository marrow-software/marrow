"use client";

/**
 * FolderViews — renders the page nodes inside a folder as a table, board, or
 * list, driven by a saved {@link NodeView}'s config (sort / filter / group-by).
 *
 * This component is purely presentational: it takes already-fetched rows and
 * the available views, and lets the user switch between them. Persisting view
 * definitions is done through the `*NodeView` helpers in `lib/api.ts`.
 */

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Pencil, Plus, Table2 } from "lucide-react";

import type { NodeView, NodeViewConfig, ViewType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A page node plus its resolved properties (key → display string). */
export interface ViewRow {
  id: string;
  name: string;
  properties: Record<string, string | null>;
}

const NO_GROUP = "—";

function rowPropertyValue(row: ViewRow, property: string): string | null {
  if (property === "name") return row.name;
  return row.properties[property] ?? null;
}

function applyFilters(rows: ViewRow[], config: NodeViewConfig): ViewRow[] {
  if (!config.filters?.length) return rows;
  return rows.filter((row) =>
    config.filters.every((f) => {
      const v = rowPropertyValue(row, f.property);
      switch (f.operator) {
        case "eq":
          return v === f.value;
        case "neq":
          return v !== f.value;
        case "contains":
          return (v ?? "").toLowerCase().includes((f.value ?? "").toLowerCase());
        case "is_empty":
          return v === null || v === "";
        case "is_not_empty":
          return v !== null && v !== "";
        default: {
          const _exhaustive: never = f.operator;
          return _exhaustive;
        }
      }
    }),
  );
}

function applySorts(rows: ViewRow[], config: NodeViewConfig): ViewRow[] {
  if (!config.sorts?.length) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const s of config.sorts) {
      const av = rowPropertyValue(a, s.property) ?? "";
      const bv = rowPropertyValue(b, s.property) ?? "";
      if (av === bv) continue;
      const cmp = av < bv ? -1 : 1;
      return s.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

function columnsFor(schemaKeys: string[], config: NodeViewConfig): string[] {
  if (config.visible_properties?.length) {
    return config.visible_properties.filter((k) => schemaKeys.includes(k));
  }
  return schemaKeys;
}

const VIEW_META: Record<ViewType, { icon: typeof List; label: string }> = {
  list: { icon: List, label: "List" },
  table: { icon: Table2, label: "Table" },
  board: { icon: LayoutGrid, label: "Board" },
};

export function FolderViews({
  views,
  rows,
  schemaKeys,
  canEdit = false,
  activeViewId,
  onActiveViewChange,
  onCreateView,
  onEditView,
  onOpenNode,
  emptyPagesMessage,
}: {
  views: NodeView[];
  rows: ViewRow[];
  schemaKeys: string[];
  canEdit?: boolean;
  activeViewId?: string | null;
  onActiveViewChange?: (viewId: string) => void;
  onCreateView?: () => void;
  onEditView?: (view: NodeView) => void;
  onOpenNode?: (nodeId: string) => void;
  emptyPagesMessage?: string;
}) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(
    views.find((v) => v.view_type === "list")?.id ?? views[0]?.id ?? null,
  );

  const activeId = activeViewId ?? internalActiveId;
  const setActiveId = onActiveViewChange ?? setInternalActiveId;

  useEffect(() => {
    if (views.length === 0) return;
    if (!activeId || !views.some((v) => v.id === activeId)) {
      const fallback =
        views.find((v) => v.view_type === "list")?.id ?? views[0]?.id ?? null;
      if (fallback) setActiveId(fallback);
    }
  }, [views, activeId, setActiveId]);

  const active = views.find((v) => v.id === activeId) ?? null;

  const visibleRows = useMemo(() => {
    if (!active) return rows;
    return applySorts(applyFilters(rows, active.config), active.config);
  }, [active, rows]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b px-1 py-2">
        {views.map((v) => {
          const Meta = VIEW_META[v.view_type];
          const Icon = Meta.icon;
          const isActive = v.id === active?.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveId(v.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {v.name}
            </button>
          );
        })}
        {canEdit && onCreateView && (
          <button
            type="button"
            title="Add view"
            aria-label="Add view"
            onClick={onCreateView}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        {canEdit && active && onEditView && (
          <button
            type="button"
            title="Edit view"
            aria-label="Edit view"
            onClick={() => onEditView(active)}
            className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {emptyPagesMessage ?? "No pages in this folder yet."}
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No pages match this view&rsquo;s filters.
          </p>
        ) : (
          <>
            {active?.view_type === "table" && (
              <TableView
                rows={visibleRows}
                schemaKeys={schemaKeys}
                config={active.config}
                onOpenNode={onOpenNode}
              />
            )}
            {active?.view_type === "board" && (
              <BoardView rows={visibleRows} config={active.config} onOpenNode={onOpenNode} />
            )}
            {(!active || active.view_type === "list") && (
              <ListView rows={visibleRows} onOpenNode={onOpenNode} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListView({
  rows,
  onOpenNode,
}: {
  rows: ViewRow[];
  onOpenNode?: (nodeId: string) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpenNode?.(r.id)}
            className="min-h-11 w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent/50"
          >
            {r.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TableView({
  rows,
  schemaKeys,
  config,
  onOpenNode,
}: {
  rows: ViewRow[];
  schemaKeys: string[];
  config: NodeViewConfig;
  onOpenNode?: (nodeId: string) => void;
}) {
  const cols = columnsFor(schemaKeys, config);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Name</th>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onOpenNode?.(r.id)}
                  className="text-left hover:underline"
                >
                  {r.name}
                </button>
              </td>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1.5 text-muted-foreground">
                  {r.properties[c] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({
  rows,
  config,
  onOpenNode,
}: {
  rows: ViewRow[];
  config: NodeViewConfig;
  onOpenNode?: (nodeId: string) => void;
}) {
  const groupKey = config.group_by;
  const groups = useMemo(() => {
    const map = new Map<string, ViewRow[]>();
    for (const r of rows) {
      const g = (groupKey ? r.properties[groupKey] : null) || NO_GROUP;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()];
  }, [rows, groupKey]);

  if (!groupKey) {
    return (
      <p className="text-sm text-muted-foreground">
        This board has no group-by property configured.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groups.map(([group, groupRows]) => (
        <div key={group} className="w-60 shrink-0 rounded-lg bg-muted/40 p-2">
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            <span>{group}</span>
            <span>{groupRows.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {groupRows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenNode?.(r.id)}
                className="rounded-md border bg-background px-2.5 py-2 text-left text-sm shadow-sm hover:border-foreground/30"
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
