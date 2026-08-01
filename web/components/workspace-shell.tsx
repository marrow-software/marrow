"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type RailPanel } from "@/components/app-sidebar";
import { WorkspaceTreeProvider } from "@/components/workspace-tree-context";
import { listNotifications } from "@/lib/api";
import type { User, Workspace, WorkspaceTree } from "@/lib/types";

interface Props {
  tree: WorkspaceTree;
  user: User | null;
  memberCount: number | null;
  showOrgSettings: boolean;
  workspaces: Workspace[];
  userRole: string | null;
  children: React.ReactNode;
}

export function WorkspaceShell({ tree, user, memberCount, showOrgSettings, workspaces, userRole, children }: Props) {
  const [panel, setPanel] = useState<RailPanel>("pages");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inboxUnread, setInboxUnread] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotifications()
      .then((res) => {
        if (!cancelled) setInboxUnread(res.unread_count);
      })
      .catch(() => {
        /* inbox is best-effort; leave badge hidden on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPanel("search");
        setSidebarOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider>
      {/* One continuous surface (#313): the unified sidebar shares the editor's
          background and is set off only by its own 1px hairline border-r. */}
      <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
        {sidebarOpen && (
          <AppSidebar
            tree={tree}
            user={user}
            panel={panel}
            onPanelChange={setPanel}
            memberCount={memberCount}
            showOrgSettings={showOrgSettings}
            workspaces={workspaces}
            userRole={userRole}
            inboxUnread={inboxUnread}
            searchInputRef={searchInputRef}
            onInboxUnreadChange={setInboxUnread}
          />
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTreeProvider tree={tree}>{children}</WorkspaceTreeProvider>
        </main>
      </div>
    </SidebarProvider>
  );
}
