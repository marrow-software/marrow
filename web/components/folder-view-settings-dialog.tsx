"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createNodeView,
  deleteNodeView,
  updateNodeView,
} from "@/lib/api";
import type {
  NodeView,
  NodeViewConfig,
  PropertySchema,
  ViewFilter,
  ViewSort,
  ViewType,
} from "@/lib/types";

const VIEW_TYPES: { value: ViewType; label: string }[] = [
  { value: "list", label: "List" },
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
];

const FILTER_OPERATORS: { value: ViewFilter["operator"]; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const EMPTY_CONFIG: NodeViewConfig = {
  sorts: [],
  filters: [],
  group_by: null,
  visible_properties: [],
};

function defaultConfig(): NodeViewConfig {
  return { ...EMPTY_CONFIG };
}

function mergeConfig(partial?: Partial<NodeViewConfig>): NodeViewConfig {
  return {
    sorts: partial?.sorts ?? [],
    filters: partial?.filters ?? [],
    group_by: partial?.group_by ?? null,
    visible_properties: partial?.visible_properties ?? [],
  };
}

interface Props {
  folderNodeId: string;
  schema: PropertySchema[];
  views: NodeView[];
  mode: "create" | "edit" | null;
  editingView: NodeView | null;
  onOpenChange: (open: boolean) => void;
  onViewsChange: (views: NodeView[]) => void;
  onActiveViewChange?: (viewId: string) => void;
}

export function FolderViewSettingsDialog({
  folderNodeId,
  schema,
  views,
  mode,
  editingView,
  onOpenChange,
  onViewsChange,
  onActiveViewChange,
}: Props) {
  const open = mode !== null;
  const isCreate = mode === "create";

  const [name, setName] = useState("");
  const [viewType, setViewType] = useState<ViewType>("list");
  const [config, setConfig] = useState<NodeViewConfig>(defaultConfig());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filterProperties = useMemo(
    () => ["name", ...schema.map((s) => s.key)],
    [schema],
  );

  const sortProperties = filterProperties;

  const groupByOptions = useMemo(
    () => schema.filter((s) => s.value_type === "select"),
    [schema],
  );

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (isCreate) {
      setName("");
      setViewType("list");
      setConfig(defaultConfig());
    } else if (editingView) {
      setName(editingView.name);
      setViewType(editingView.view_type);
      setConfig(mergeConfig(editingView.config));
    }
  }, [open, isCreate, editingView]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("View name is required");
      return;
    }

    setBusy(true);
    try {
      if (isCreate) {
        const created = await createNodeView(folderNodeId, trimmedName, viewType, config);
        onViewsChange([...views, created]);
        onActiveViewChange?.(created.id);
        toast.success("View created");
      } else if (editingView) {
        const updated = await updateNodeView(editingView.id, {
          name: trimmedName,
          view_type: viewType,
          config,
        });
        onViewsChange(views.map((v) => (v.id === updated.id ? updated : v)));
        toast.success("View updated");
      }
      onOpenChange(false);
    } catch {
      toast.error("Could not save view");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editingView) return;
    if (views.length <= 1) {
      toast.error("Cannot delete the last view in a folder");
      setConfirmDelete(false);
      return;
    }

    setBusy(true);
    try {
      await deleteNodeView(editingView.id);
      const next = views.filter((v) => v.id !== editingView.id);
      onViewsChange(next);
      const fallback =
        next.find((v) => v.view_type === "list")?.id ?? next[0]?.id;
      if (fallback) onActiveViewChange?.(fallback);
      toast.success("View deleted");
      onOpenChange(false);
    } catch {
      toast.error("Could not delete view");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  function updateSort(index: number, patch: Partial<ViewSort>) {
    setConfig((c) => ({
      ...c,
      sorts: c.sorts.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addSort() {
    setConfig((c) => ({
      ...c,
      sorts: [...c.sorts, { property: "name", direction: "asc" }],
    }));
  }

  function removeSort(index: number) {
    setConfig((c) => ({
      ...c,
      sorts: c.sorts.filter((_, i) => i !== index),
    }));
  }

  function updateFilter(index: number, patch: Partial<ViewFilter>) {
    setConfig((c) => ({
      ...c,
      filters: c.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function addFilter() {
    setConfig((c) => ({
      ...c,
      filters: [
        ...c.filters,
        { property: filterProperties[0] ?? "name", operator: "eq", value: "" },
      ],
    }));
  }

  function removeFilter(index: number) {
    setConfig((c) => ({
      ...c,
      filters: c.filters.filter((_, i) => i !== index),
    }));
  }

  function toggleVisibleProperty(key: string) {
    setConfig((c) => {
      const set = new Set(c.visible_properties);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...c, visible_properties: [...set] };
    });
  }

  return (
    <>
      <Dialog open={open && !confirmDelete} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isCreate ? "Create view" : "Edit view"}</DialogTitle>
            {!isCreate && (
              <DialogDescription>
                Configure how pages in this folder are displayed.
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-1">
            <label className="block text-xs text-muted-foreground">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                placeholder="All"
              />
            </label>

            <label className="block text-xs text-muted-foreground">
              View type
              <select
                value={viewType}
                onChange={(e) => setViewType(e.target.value as ViewType)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                {VIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            {viewType === "board" && (
              <label className="block text-xs text-muted-foreground">
                Group by (select properties only)
                <select
                  value={config.group_by ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      group_by: e.target.value || null,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">—</option>
                  {groupByOptions.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {viewType === "table" && schema.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">
                  Visible columns (empty = all schema columns)
                </legend>
                {schema.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={config.visible_properties.includes(s.key)}
                      onChange={() => toggleVisibleProperty(s.key)}
                    />
                    {s.key}
                  </label>
                ))}
              </fieldset>
            )}

            <ConfigList
              title="Sorts"
              emptyLabel="No sorts"
              onAdd={addSort}
              items={config.sorts}
              renderItem={(sort, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    value={sort.property}
                    onChange={(e) => updateSort(index, { property: e.target.value })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {sortProperties.map((p) => (
                      <option key={p} value={p}>
                        {p === "name" ? "Name" : p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sort.direction}
                    onChange={(e) =>
                      updateSort(index, {
                        direction: e.target.value as ViewSort["direction"],
                      })
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeSort(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            />

            <ConfigList
              title="Filters"
              emptyLabel="No filters"
              onAdd={addFilter}
              items={config.filters}
              renderItem={(filter, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    value={filter.property}
                    onChange={(e) => updateFilter(index, { property: e.target.value })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {filterProperties.map((p) => (
                      <option key={p} value={p}>
                        {p === "name" ? "Name" : p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filter.operator}
                    onChange={(e) =>
                      updateFilter(index, {
                        operator: e.target.value as ViewFilter["operator"],
                      })
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    {FILTER_OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {filter.operator !== "is_empty" &&
                    filter.operator !== "is_not_empty" && (
                      <input
                        type="text"
                        value={filter.value ?? ""}
                        onChange={(e) =>
                          updateFilter(index, { value: e.target.value })
                        }
                        placeholder="Value"
                        className="min-w-24 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                    )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeFilter(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            />
          </div>

          <DialogFooter className="sm:justify-between">
            {!isCreate && editingView && views.length > 1 && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete view
              </Button>
            )}
            <div className="flex gap-2 sm:ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={busy}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete view &ldquo;{editingView?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This cannot be undone. The view definition will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={busy}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfigList<T>({
  title,
  emptyLabel,
  onAdd,
  items,
  renderItem,
}: {
  title: string;
  emptyLabel: string;
  onAdd: () => void;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <legend className="text-xs text-muted-foreground">{title}</legend>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
      <div className="space-y-2">{items.map((item, i) => renderItem(item, i))}</div>
    </fieldset>
  );
}