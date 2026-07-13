"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
  deletePropertySchema,
  getPropertySchema,
  upsertPropertySchema,
} from "@/lib/api";
import type { PropertySchema, PropertyValueType } from "@/lib/types";

const VALUE_TYPES: { value: PropertyValueType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" },
  { value: "checkbox", label: "Checkbox" },
];

function needsOptions(valueType: PropertyValueType): boolean {
  return valueType === "select" || valueType === "multi-select";
}

interface Props {
  folderNodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchemaChange?: () => void;
}

export function FolderPropertySchemaEditor({
  folderNodeId,
  open,
  onOpenChange,
  onSchemaChange,
}: Props) {
  const [schema, setSchema] = useState<PropertySchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<PropertySchema | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getPropertySchema(folderNodeId);
      setSchema(rows);
    } catch {
      toast.error("Could not load property schema");
      setSchema([]);
    } finally {
      setLoading(false);
    }
  }, [folderNodeId]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(row: PropertySchema) {
    setEditing(row);
    setEditorOpen(true);
  }

  async function handleDelete(key: string) {
    try {
      await deletePropertySchema(folderNodeId, key);
      setSchema((cur) => cur.filter((s) => s.key !== key));
      onSchemaChange?.();
      toast.success("Property removed");
    } catch {
      toast.error("Could not delete property");
    } finally {
      setDeleteKey(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Folder properties</DialogTitle>
            <DialogDescription>
              Define property keys for pages in this folder. Descendant pages inherit
              these fields.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-2 overflow-y-auto py-1">
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && schema.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No properties defined yet. Add a property to show columns in folder
                views.
              </p>
            )}
            {schema.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.key}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.value_type}
                    {row.options?.length
                      ? ` · ${row.options.join(", ")}`
                      : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Edit"
                  onClick={() => openEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Delete"
                  onClick={() => setDeleteKey(row.key)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SchemaKeyEditor
        folderNodeId={folderNodeId}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        existing={editing}
        existingKeys={schema.map((s) => s.key)}
        onSaved={() => {
          void reload();
          onSchemaChange?.();
        }}
      />

      <Dialog open={deleteKey !== null} onOpenChange={(v) => !v && setDeleteKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete property &ldquo;{deleteKey}&rdquo;?</DialogTitle>
            <DialogDescription>
              Page values for this key may remain in the database but will no longer
              appear in folder views or the page property editor.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteKey(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteKey && void handleDelete(deleteKey)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SchemaKeyEditor({
  folderNodeId,
  open,
  onOpenChange,
  existing,
  existingKeys,
  onSaved,
}: {
  folderNodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: PropertySchema | null;
  existingKeys: string[];
  onSaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [valueType, setValueType] = useState<PropertyValueType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setKey(existing.key);
      setValueType(existing.value_type);
      setOptionsText(existing.options?.join("\n") ?? "");
    } else {
      setKey("");
      setValueType("text");
      setOptionsText("");
    }
  }, [open, existing]);

  async function handleSave() {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      toast.error("Property key is required");
      return;
    }
    if (
      !existing &&
      existingKeys.some((k) => k.toLowerCase() === trimmedKey.toLowerCase())
    ) {
      toast.error("A property with this key already exists");
      return;
    }

    let options: string[] | null = null;
    if (needsOptions(valueType)) {
      options = optionsText
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean);
      if (options.length === 0) {
        toast.error("Select and multi-select properties need at least one option");
        return;
      }
    }

    setBusy(true);
    try {
      await upsertPropertySchema(folderNodeId, trimmedKey, valueType, options);
      toast.success(existing ? "Property updated" : "Property added");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Could not save property");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit property" : "Add property"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block text-xs text-muted-foreground">
            Key
            <input
              type="text"
              value={key}
              disabled={!!existing}
              onChange={(e) => setKey(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
              placeholder="Status"
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            Type
            <select
              value={valueType}
              onChange={(e) => setValueType(e.target.value as PropertyValueType)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {VALUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {needsOptions(valueType) && (
            <label className="block text-xs text-muted-foreground">
              Options (one per line)
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                placeholder={"Todo\nIn progress\nDone"}
              />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
