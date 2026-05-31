"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppRail, type RailPanel } from "@/components/app-rail";
import { AppSidebar } from "@/components/app-sidebar";
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
      <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
        <AppRail
          workspaceName={tree.name}
          currentWorkspaceId={tree.id}
          panel={panel}
          onPanelChange={setPanel}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((v) => !v)}
          user={user}
          inboxUnread={inboxUnread}
          workspaces={workspaces}
          userRole={userRole}
        />
        {sidebarOpen && (
          <AppSidebar
            tree={tree}
            user={user}
            panel={panel}
            memberCount={memberCount}
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
