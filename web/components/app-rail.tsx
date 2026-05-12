"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderClosed,
  Search,
  Star,
  Inbox,
  LogOut,
  Check,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "@/components/settings-dialog";
import { createWorkspaceInOrg, logout, slugify } from "@/lib/api";
import type { Organization, OrgMembership, User, Workspace } from "@/lib/types";

export type RailPanel = "pages" | "search" | "starred" | "inbox";

interface Props {
  workspaceName: string;
  panel: RailPanel;
  onPanelChange: (panel: RailPanel) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  user?: User | null;
  workspaces?: Workspace[];
  orgs?: Organization[];
  userMemberships?: Record<string, OrgMembership["role"]>;
  currentWorkspaceId?: string;
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
  panel,
  onPanelChange,
  sidebarOpen,
  onSidebarToggle,
  user,
  workspaces = [],
  orgs = [],
  userMemberships = {},
  currentWorkspaceId,
}: Props) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3.5">
      <button
        type="button"
        title={`${workspaceName} workspace`}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-heading text-[17px] font-medium text-primary-foreground"
      >
        {initials(workspaceName)[0]}
      </button>

      {TABS.map(({ id, label, Icon }) => {
        const active = panel === id && sidebarOpen;
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
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
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
          orgs={orgs}
          userMemberships={userMemberships}
          currentWorkspaceId={currentWorkspaceId}
        />
      )}
    </div>
  );
}

/**
 * For an "organization" org, only OWNER may create workspaces.
 * For an "individual" org, any member may.
 */
function canCreateWorkspaceInOrg(
  org: Organization,
  role: OrgMembership["role"] | undefined,
): boolean {
  if (!role) return false;
  if (org.type === "individual") return true;
  return role === "owner";
}

function UserMenu({
  user,
  workspaces,
  orgs,
  userMemberships,
  currentWorkspaceId,
}: {
  user: User;
  workspaces: Workspace[];
  orgs: Organization[];
  userMemberships: Record<string, OrgMembership["role"]>;
  currentWorkspaceId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creatingForOrg, setCreatingForOrg] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreatingForOrg(null);
        setNewName("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const creatableOrgs = orgs.filter((o) =>
    canCreateWorkspaceInOrg(o, userMemberships[o.id]),
  );

  // Group workspaces by org for display.
  const wsByOrg = new Map<string, Workspace[]>();
  for (const ws of workspaces) {
    const list = wsByOrg.get(ws.org_id) ?? [];
    list.push(ws);
    wsByOrg.set(ws.org_id, list);
  }

  async function handleCreate(orgId: string) {
    const name = newName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const ws = await createWorkspaceInOrg(orgId, slugify(name), name);
      setOpen(false);
      setCreatingForOrg(null);
      setNewName("");
      router.push(`/w/${ws.id}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }

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
          className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-72 rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>

          {orgs.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="max-h-72 overflow-y-auto px-1">
                {orgs.map((org) => {
                  const list = wsByOrg.get(org.id) ?? [];
                  const canCreate = canCreateWorkspaceInOrg(
                    org,
                    userMemberships[org.id],
                  );
                  return (
                    <div key={org.id} className="px-2 py-1">
                      <p className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {org.name}
                      </p>
                      {list.map((ws) => {
                        const active = ws.id === currentWorkspaceId;
                        return (
                          <button
                            key={ws.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpen(false);
                              router.push(`/w/${ws.id}`);
                            }}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                          >
                            <span className="truncate">{ws.name}</span>
                            {active && (
                              <Check className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                      {canCreate && creatingForOrg !== org.id && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setCreatingForOrg(org.id);
                            setNewName("");
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create workspace
                        </button>
                      )}
                      {creatingForOrg === org.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleCreate(org.id);
                          }}
                          className="flex gap-1 px-2 py-1.5"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Workspace name"
                            disabled={submitting}
                            className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="submit"
                            disabled={submitting || !newName.trim()}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
              {creatableOrgs.length === 0 && (
                <p className="px-3 py-1 text-[11px] text-muted-foreground">
                  Ask an admin to create workspaces.
                </p>
              )}
            </>
          )}

          <div className="my-1 border-t border-border" />
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
