"use client";

/**
 * PropertyEditor — typed key-value metadata strip rendered below a page title.
 *
 * Shows properties already set on the node plus any property keys inherited
 * from ancestor folders' schemas. Tag-style chips for select/multi-select,
 * native date pickers for dates, checkbox + number/text inputs otherwise.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  deleteNodeProperty,
  listNodeProperties,
  setNodeProperty,
  type InheritedPropertySchema,
  type NodeProperty,
  type PropertyValueType,
} from "@/lib/api";

interface Props {
  nodeId: string;
}

interface Row {
  key: string;
  label: string;
  value_type: PropertyValueType;
  options: string[];
  value: unknown;
  inherited: boolean;
}

function defaultValueFor(t: PropertyValueType): unknown {
  switch (t) {
    case "text":
    case "select":
      return "";
    case "number":
      return null;
    case "date":
      return "";
    case "checkbox":
      return false;
    case "multi_select":
      return [];
  }
}

export function PropertyEditor({ nodeId }: Props) {
  const [props, setProps] = useState<NodeProperty[]>([]);
  const [inherited, setInherited] = useState<InheritedPropertySchema[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const view = await listNodeProperties(nodeId);
      setProps(view.properties);
      setInherited(view.inherited_schema);
    } catch (err) {
      toast.error(`Failed to load properties: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, NodeProperty>();
    for (const p of props) byKey.set(p.key, p);

    const result: Row[] = [];
    const seen = new Set<string>();

    for (const s of inherited) {
      seen.add(s.key);
      const existing = byKey.get(s.key);
      result.push({
        key: s.key,
        label: s.label || s.key,
        value_type: s.value_type,
        options: s.options,
        value: existing ? existing.value : defaultValueFor(s.value_type),
        inherited: true,
      });
    }

    for (const p of props) {
      if (seen.has(p.key)) continue;
      result.push({
        key: p.key,
        label: p.key,
        value_type: p.value_type,
        options: [],
        value: p.value,
        inherited: false,
      });
    }
    return result;
  }, [props, inherited]);

  const save = useCallback(
    async (row: Row, nextValue: unknown) => {
      try {
        await setNodeProperty(nodeId, row.key, row.value_type, nextValue);
        await refresh();
      } catch (err) {
        toast.error(`Failed to save '${row.key}': ${String(err)}`);
      }
    },
    [nodeId, refresh]
  );

  const remove = useCallback(
    async (row: Row) => {
      try {
        await deleteNodeProperty(nodeId, row.key);
        await refresh();
      } catch (err) {
        toast.error(`Failed to clear '${row.key}': ${String(err)}`);
      }
    },
    [nodeId, refresh]
  );

  const addAdHoc = useCallback(async () => {
    const key = window.prompt("Property key (e.g. status, tags, due)")?.trim();
    if (!key) return;
    const t = (window.prompt(
      "Type: text, number, date, select, multi_select, checkbox",
      "text"
    ) || "text").trim() as PropertyValueType;
    if (
      !["text", "number", "date", "select", "multi_select", "checkbox"].includes(t)
    ) {
      toast.error(`Unknown type: ${t}`);
      return;
    }
    try {
      await setNodeProperty(nodeId, key, t, defaultValueFor(t));
      await refresh();
    } catch (err) {
      toast.error(`Failed to add property: ${String(err)}`);
    }
  }, [nodeId, refresh]);

  if (loading) return null;
  if (rows.length === 0) {
    return (
      <div className="px-10 pt-1 pb-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={addAdHoc}
          className="hover:text-foreground transition"
        >
          + Add property
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-10 pt-1 pb-3 text-sm">
      {rows.map((row) => (
        <PropertyRow
          key={row.key}
          row={row}
          onSave={(v) => save(row, v)}
          onClear={() => remove(row)}
        />
      ))}
      <button
        type="button"
        onClick={addAdHoc}
        className="text-xs text-muted-foreground hover:text-foreground transition self-center"
      >
        + Add property
      </button>
    </div>
  );
}

interface RowProps {
  row: Row;
  onSave: (value: unknown) => void;
  onClear: () => void;
}

function PropertyRow({ row, onSave, onClear }: RowProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
        {row.label}
      </span>
      <ValueControl row={row} onSave={onSave} />
      {!row.inherited && (
        <button
          type="button"
          aria-label={`Clear ${row.key}`}
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ValueControl({ row, onSave }: { row: Row; onSave: (v: unknown) => void }) {
  const baseInput =
    "rounded border border-border bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  switch (row.value_type) {
    case "text":
      return (
        <input
          type="text"
          defaultValue={(row.value as string) ?? ""}
          onBlur={(e) => {
            if (e.target.value !== row.value) onSave(e.target.value);
          }}
          className={baseInput}
        />
      );
    case "number":
      return (
        <input
          type="number"
          defaultValue={row.value == null ? "" : String(row.value)}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== row.value) onSave(v);
          }}
          className={`${baseInput} w-24`}
        />
      );
    case "date":
      return (
        <input
          type="date"
          defaultValue={(row.value as string) ?? ""}
          onChange={(e) => onSave(e.target.value || null)}
          className={baseInput}
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={Boolean(row.value)}
          onChange={(e) => onSave(e.target.checked)}
        />
      );
    case "select":
      return (
        <select
          value={(row.value as string) ?? ""}
          onChange={(e) => onSave(e.target.value || null)}
          className={baseInput}
        >
          <option value="">—</option>
          {row.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "multi_select": {
      const current = Array.isArray(row.value) ? (row.value as string[]) : [];
      const toggle = (opt: string) => {
        const next = current.includes(opt)
          ? current.filter((v) => v !== opt)
          : [...current, opt];
        onSave(next);
      };
      return (
        <div className="flex flex-wrap gap-1">
          {row.options.length === 0 && current.length === 0 && (
            <span className="text-xs text-muted-foreground italic">
              no options
            </span>
          )}
          {row.options.map((opt) => {
            const active = current.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                onClick={() => toggle(opt)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
  }
}
