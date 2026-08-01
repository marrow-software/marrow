"use client";

import { useEffect, useRef, useState } from "react";
import { FolderClosed, Search, Star, Inbox, LogOut, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/settings-dialog";
import { logout } from "@/lib/api";
import type { User, Workspace } from "@/lib/types";

export type RailPanel = "pages" | "search" | "starred" | "inbox";

interface Props {
  workspaceName: string;
  currentWorkspaceId: string;
  panel: RailPanel;
  onPanelChange: (panel: RailPanel) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  user?: User | null;
  inboxUnread?: number;
  workspaces: Workspace[];
  userRole: string | null;
}

const TABS: Array<{ id: RailPanel; label: string; Icon: typeof FolderClosed }> = [
  { id: "pages", label: "Pages", Icon: FolderClosed },
  { id: "search", label: "Search", Icon: Search },
  { id: "starred", label: "Starred", Icon: Star },
  { id: "inbox", label: "Inbox", Icon: Inbox },
];

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || name[0]?.toUpperCase() || "?";
}

export function AppRail({
  workspaceName,
  currentWorkspaceId,
  panel,
  onPanelChange,
  sidebarOpen,
  onSidebarToggle,
  user,
  inboxUnread = 0,
  workspaces,
  userRole,
}: Props) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3.5">
      <button
        type="button"
        title={`${workspaceName} workspace`}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-[17px] font-medium text-primary-foreground"
      >
        {initials(workspaceName)[0]}
      </button>

      {TABS.map(({ id, label, Icon }) => {
        const active = panel === id && sidebarOpen;
        const badge = id === "inbox" && inboxUnread > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (panel === id) {
                onSidebarToggle();
              } else {
                onPanelChange(id);
                if (!sidebarOpen) onSidebarToggle();
              }
            }}
            title={badge ? `${label} (${inboxUnread} unread)` : label}
            aria-label={badge ? `${label}, ${inboxUnread} unread` : label}
            aria-pressed={active}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {badge && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                {inboxUnread > 9 ? "9+" : inboxUnread}
              </span>
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      <SettingsDialog
        triggerClassName="h-9 w-9 rounded-lg"
        iconClassName="h-4 w-4"
      />

      {user && (
        <UserMenu
          user={user}
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          userRole={userRole}
        />
      )}
    </div>
  );
}

function UserMenu({
  user,
  workspaces,
  currentWorkspaceId,
  userRole,
}: {
  user: User;
  workspaces: Workspace[];
  currentWorkspaceId: string;
  userRole: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const canCreateWorkspace = userRole === "owner" || userRole === null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative mt-2">
      <button
        type="button"
        title={user.name}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4a6b8a] text-[11px] font-medium text-white outline-none ring-offset-2 ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-primary"
      >
        {initials(user.name)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-64 rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {/* User identity */}
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>

          <div className="my-1 border-t border-border" />

          {/* Workspace switcher */}
          {workspaces.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Workspaces
              </p>
              <div className="max-h-48 overflow-y-auto">
                {workspaces.map((ws) => {
                  const isCurrent = ws.id === currentWorkspaceId;
                  return (
                    <a
                      key={ws.id}
                      href={`/w/${ws.id}`}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent",
                        isCurrent ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
                        {ws.name[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                      {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </a>
                  );
                })}
              </div>

              {canCreateWorkspace && (
                <a
                  href="/workspaces"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create workspace
                </a>
              )}

              <div className="my-1 border-t border-border" />
            </>
          )}

          {/* Sign out */}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              const logoutUrl = await logout();
              window.location.href = logoutUrl ?? "/login";
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
