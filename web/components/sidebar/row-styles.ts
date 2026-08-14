import { cn } from "@/lib/utils";

// One class string for every row in the sidebar nav strip — the Spaces trigger
// and the settings-shell nav (app/orgs/[orgId]/admin/layout.tsx) reuse it so the
// whole chrome shares one type + spacing scale (#316 AC), not per-region CSS.
export function navRowClass(active?: boolean) {
  return cn(
    "signal-flat signal-focus flex h-[var(--ctl-md)] items-center gap-2.5 rounded-md px-2 text-base text-foreground hover:bg-accent-soft",
    active && "signal-nav-active",
  );
}

// The flyout's counterpart to navRowClass (filter box, space picks, footer
// actions) — so the switcher region shares one style rather than repeating it
// per row (#316 AC).
export function flyoutRowClass() {
  return "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-base text-foreground hover:bg-accent-soft";
}
