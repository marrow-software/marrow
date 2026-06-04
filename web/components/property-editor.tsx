"use client";

/**
 * PropertyEditor — typed key-value metadata shown below a page title.
 *
 * Renders each effective property (inherited folder-schema definitions plus
 * the page's own values) with a type-appropriate control: text/number/date
 * inputs, a dropdown for select, tag-style chips for multi-select, and a
 * checkbox. Edits are persisted per-property via the node properties API.
 */

import { useCallback, useEffect, useState } from "react";

import {
  deleteNodeProperty,
  getNodeProperties,
  setNodeProperty,
} from "@/lib/api";
import type { EffectiveProperty } from "@/lib/types";

interface Props {
  nodeId: string;
}

export function PropertyEditor({ nodeId }: Props) {
  const [props, setProps] = useState<EffectiveProperty[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await getNodeProperties(nodeId);
      setProps(res.properties);
    } catch {
      setProps([]);
    } finally {
      setLoaded(true);
    }
  }, [nodeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(
    async (p: EffectiveProperty, value: string | null) => {
      setProps((cur) =>
        cur.map((x) => (x.key === p.key ? { ...x, value } : x))
      );
      try {
        if (value === null || value === "") {
          await deleteNodeProperty(nodeId, p.key);
        } else {
          await setNodeProperty(nodeId, p.key, value, p.value_type);
        }
      } catch {
        void reload();
      }
    },
    [nodeId, reload]
  );

  if (!loaded || props.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-10 pb-3" data-testid="property-editor">
      {props.map((p) => (
        <div key={p.key} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 text-muted-foreground">{p.key}</span>
          <PropertyControl property={p} onChange={(v) => persist(p, v)} />
        </div>
      ))}
    </div>
  );
}

function PropertyControl({
  property,
  onChange,
}: {
  property: EffectiveProperty;
  onChange: (value: string | null) => void;
}) {
  const { value, value_type, options } = property;

  if (value_type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
      />
    );
  }

  if (value_type === "select") {
    return (
      <select
        className="rounded border border-border bg-transparent px-2 py-1"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {(options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (value_type === "multi-select") {
    let selected: string[] = [];
    try {
      selected = value ? (JSON.parse(value) as string[]) : [];
    } catch {
      selected = [];
    }
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter((x) => x !== opt)
        : [...selected, opt];
      onChange(next.length ? JSON.stringify(next) : null);
    };
    return (
      <div className="flex flex-wrap gap-1.5">
        {(options ?? []).map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                on
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  const inputType =
    value_type === "date" ? "date" : value_type === "number" ? "number" : "text";

  return (
    <input
      type={inputType}
      className="rounded border border-border bg-transparent px-2 py-1"
      defaultValue={value ?? ""}
      onBlur={(e) => onChange(e.target.value || null)}
      placeholder={`Add ${value_type}…`}
    />
  );
}
