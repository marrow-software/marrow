import { useCallback, useEffect, useRef, useState } from "react";

// Dismiss-on-outside-click + Escape, for any menu/flyout. The single dismissal
// scaffold across the app chrome — the sidebar's self-stated menus (via
// useDismissableMenu), its externally-controlled Spaces flyout, and the page
// menu all build on it rather than hand-rolling their own document listener.
export function useOutsideDismiss(
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

// Menu open-state + dismissal, shared by menus that own their own trigger (e.g.
// the workspace switcher and account menu) so the dismiss scaffold lives in one
// place.
export function useDismissableMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss(ref, open, close);
  return { open, setOpen, ref };
}
