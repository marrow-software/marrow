"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { toast } from "sonner";

interface Props {
  placeholder: string;
  icon?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  onCommit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function InlineCreateRow({
  placeholder,
  icon,
  className,
  style,
  onCommit,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit() {
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onCommit(trimmed);
    } catch (err) {
      toast.error(String(err));
      setBusy(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // While this input is focused it owns Enter/Escape — stop them bubbling to
    // ancestor keydown listeners (e.g. a menu/flyout that closes on Escape), so
    // Escape only cancels create mode rather than also dismissing the container.
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className={className} style={style}>
      {icon}
      <input
        autoFocus
        value={value}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
      />
    </div>
  );
}
