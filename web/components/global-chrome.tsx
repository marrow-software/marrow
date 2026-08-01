"use client";

import Link from "next/link";
import { ChevronDown, Home, Inbox, LayoutGrid, LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import type { Organization, User, Workspace } from "@/lib/types";

interface Props {
  user: User | null;
  workspaces: Workspace[];
  orgs: Organization[];
  unreadCount: number;
}

/**
 * Lightweight global top bar for the account-level Home — intentionally NOT the
 * workspace-bound WorkspaceShell. Provides Home, Inbox, a workspace switcher,
 * and a user menu. Built as a client component for the dropdowns + sign-out.
 */
export function GlobalChrome({ user, workspaces, orgs, unreadCount }: Props) {
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "Workspace";

  async function handleSignOut() {
    const url = await logout().catch(() => null);
    window.location.assign(url ?? "/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-1">
        <Link
          href="/home"
          className="mr-2 text-lg font-semibold tracking-tight lowercase"
        >
          marrow
        </Link>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <a
          href="#inbox"
          className="relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Inbox className="h-4 w-4" />
          Inbox
          {unreadCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </a>
      </div>

      <div className="flex items-center gap-2">
        {/* Workspace switcher */}
        <details name="global-chrome-menu" className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <LayoutGrid className="h-4 w-4" />
            Switch workspace
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md">
            {workspaces.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No workspaces yet.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {workspaces.map((ws) => (
                  <li key={ws.id}>
                    <Link
                      href={`/w/${ws.id}`}
                      className="flex flex-col rounded-md px-3 py-2 hover:bg-muted"
                    >
                      <span className="truncate text-sm font-medium">{ws.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {orgName(ws.org_id)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-border pt-1">
              <Link
                href="/workspaces"
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                See all workspaces
              </Link>
            </div>
          </div>
        </details>

        {/* User menu */}
        <details name="global-chrome-menu" className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </summary>
          <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md">
            {user && (
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
